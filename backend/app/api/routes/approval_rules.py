from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from uuid import UUID
from typing import List

from app.core.database import get_db
from app.core.dependencies import require_admin
from app.models.models import User, ApprovalRule, ApprovalStep, RuleType, UserRole
from app.schemas.approval_rule import (
    ApprovalRuleCreate,
    ApprovalRuleUpdate,
    ApprovalRuleResponse,
)

router = APIRouter(prefix="/approval-rules", tags=["approval-rules"])


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _validate_user_in_company(user_id: UUID, company_id, db: Session, label: str = "User"):
    """Check that the referenced user exists in the same company and is not deleted."""
    user = (
        db.query(User)
        .filter(
            User.id == user_id,
            User.company_id == company_id,
            User.deleted_at.is_(None),
        )
        .first()
    )
    if not user:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{label} {user_id} not found in your company",
        )
    return user


def _create_steps(rule_id: UUID, steps_data, company_id, db: Session):
    """Create ApprovalStep rows for a rule, validating each approver user."""
    step_objects = []
    for step in steps_data:
        _validate_user_in_company(step.approver_user_id, company_id, db, label="Approver")
        step_obj = ApprovalStep(
            rule_id=rule_id,
            approver_user_id=step.approver_user_id,
            step_order=step.step_order,
            is_manager_approver=step.is_manager_approver,
        )
        db.add(step_obj)
        step_objects.append(step_obj)
    return step_objects


# ─── POST /approval-rules ────────────────────────────────────────────────────

@router.post("", response_model=ApprovalRuleResponse, status_code=status.HTTP_201_CREATED)
def create_approval_rule(
    payload: ApprovalRuleCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    from sqlalchemy import func

    # Soft-delete any existing active rules for this company (singleton enforcement)
    existing_rules = (
        db.query(ApprovalRule)
        .filter(
            ApprovalRule.company_id == admin.company_id,
            ApprovalRule.deleted_at.is_(None)
        )
        .all()
    )
    for existing in existing_rules:
        existing.deleted_at = func.now()
    if existing_rules:
        db.flush()

    # Validate key_approver_id if provided
    if payload.key_approver_id:
        _validate_user_in_company(payload.key_approver_id, admin.company_id, db, label="Key approver")

    # Create rule
    rule = ApprovalRule(
        company_id=admin.company_id,
        name=payload.name,
        rule_type=RuleType(payload.rule_type.value),
        percentage_threshold=payload.percentage_threshold,
        key_approver_id=payload.key_approver_id,
    )
    db.add(rule)
    db.flush()  # get rule.id before creating steps

    # Create steps in same transaction
    _create_steps(rule.id, payload.steps, admin.company_id, db)

    db.commit()
    db.refresh(rule)
    return rule


# ─── GET /approval-rules ─────────────────────────────────────────────────────

@router.get("", response_model=List[ApprovalRuleResponse])
def list_approval_rules(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    rules = (
        db.query(ApprovalRule)
        .options(joinedload(ApprovalRule.steps))
        .filter(
            ApprovalRule.company_id == admin.company_id,
            ApprovalRule.deleted_at.is_(None),
        )
        .all()
    )
    # The DB models automatically map to the response model, but we should just return the ORM list
    # since from_attributes=True is turned on for ApprovalRuleResponse and its nested schemas.
    return rules


# ─── PATCH /approval-rules/{rule_id} ─────────────────────────────────────────

@router.patch("/{rule_id}", response_model=ApprovalRuleResponse)
def update_approval_rule(
    rule_id: UUID,
    payload: ApprovalRuleUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    # Tenant-scoped lookup
    rule = (
        db.query(ApprovalRule)
        .options(joinedload(ApprovalRule.steps))
        .filter(
            ApprovalRule.id == rule_id,
            ApprovalRule.company_id == admin.company_id,
            ApprovalRule.deleted_at.is_(None),
        )
        .first()
    )
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Approval rule not found")

    # Update scalar fields
    if payload.name is not None:
        rule.name = payload.name

    if payload.rule_type is not None:
        rule.rule_type = RuleType(payload.rule_type.value)

    if payload.percentage_threshold is not None:
        rule.percentage_threshold = payload.percentage_threshold

    if payload.key_approver_id is not None:
        _validate_user_in_company(payload.key_approver_id, admin.company_id, db, label="Key approver")
        rule.key_approver_id = payload.key_approver_id

    # Replace steps if provided (delete old, create new)
    if payload.steps is not None:
        for old_step in rule.steps:
            db.delete(old_step)
        db.flush()
        _create_steps(rule.id, payload.steps, admin.company_id, db)

    db.commit()
    db.refresh(rule)
    return rule
