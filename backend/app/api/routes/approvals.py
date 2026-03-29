from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, and_
from uuid import UUID
from typing import List

from app.core.database import get_db
from app.core.dependencies import require_manager, get_current_user
from app.models.models import (
    Expense, ApprovalRule, ApprovalStep, ExpenseStatus, User, Company
)
from app.schemas.approval import (
    ApprovalDecideRequest,
    ApprovalQueueItem,
    ApprovalDecideResponse,
    ApprovalHistoryItem,
)
from app.services.approval_service import (
    process_decision,
    get_approval_history,
    ApprovalEngineError,
    NotCurrentApproverError,
    ExpenseNotPendingError,
)

router = APIRouter(prefix="/approvals", tags=["approvals"])


# ─── GET /approvals/queue ────────────────────────────────────────────────────
# TASK-17: Return expenses where the current step's approver = caller

@router.get("/queue", response_model=List[ApprovalQueueItem])
def get_approval_queue(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    # Return all pending expenses where the caller is the designated
    # approver for the current step. Uses a join through:
    #   expenses → approval_rules → approval_steps
    # filtering on step_order = expense.current_step AND (approver_user_id = caller OR manager_id = caller)

    if current_user.role == "admin":
        queue_query = (
            db.query(Expense)
            .options(
                joinedload(Expense.submitted_by_user),
                joinedload(Expense.approval_rule).joinedload(ApprovalRule.steps),
            )
            .filter(
                Expense.status == ExpenseStatus.pending,
                Expense.company_id == current_user.company_id,
                Expense.deleted_at.is_(None),
            )
        )
    else:
        queue_query = (
            db.query(Expense)
            .join(ApprovalRule, Expense.approval_rule_id == ApprovalRule.id)
            .join(ApprovalStep, ApprovalStep.rule_id == ApprovalRule.id)
            .join(User, Expense.submitted_by == User.id)
            .options(
                joinedload(Expense.submitted_by_user),
                joinedload(Expense.approval_rule).joinedload(ApprovalRule.steps),
            )
            .filter(
                Expense.status == ExpenseStatus.pending,
                Expense.company_id == current_user.company_id,
                Expense.deleted_at.is_(None),
                ApprovalStep.step_order == Expense.current_step,
                ApprovalStep.deleted_at.is_(None),
            )
        )
        queue_query = queue_query.filter(
            or_(
                and_(
                    ApprovalStep.is_manager_approver == True,
                    User.manager_id == current_user.id
                ),
                and_(
                    ApprovalStep.is_manager_approver == True,
                    User.manager_id.is_(None),
                    ApprovalStep.approver_user_id == current_user.id
                ),
                and_(
                    ApprovalStep.is_manager_approver == False,
                    ApprovalStep.approver_user_id == current_user.id
                )
            )
        )

    pending_expenses = queue_query.all()

    # Get company currency
    company = db.query(Company).filter(Company.id == current_user.company_id).first()
    company_currency = company.default_currency if company else "USD"

    result = []
    for exp in pending_expenses:
        active_steps = [s for s in exp.approval_rule.steps if s.deleted_at is None] if exp.approval_rule else []
        result.append(
            ApprovalQueueItem(
                expense_id=exp.id,
                title=exp.title,
                description=exp.description,
                submitted_by=str(exp.submitted_by),
                submitted_by_name=(exp.submitted_by_user.full_name or exp.submitted_by_user.email) if exp.submitted_by_user else "Unknown",
                amount=float(exp.amount),
                currency=exp.currency,
                converted_amount=float(exp.converted_amount) if exp.converted_amount else None,
                company_currency=company_currency,
                current_step=exp.current_step,
                step_total=len(active_steps),
                category=exp.category.value if hasattr(exp.category, 'value') else exp.category,
                expense_date=str(exp.expense_date),
            )
        )
    return result


# ─── POST /approvals/{expense_id}/decide ─────────────────────────────────────
# TASK-18: Validate caller is current step's approver, delegate to engine

@router.post("/{expense_id}/decide", response_model=ApprovalDecideResponse)
def decide_approval(
    expense_id: UUID,
    payload: ApprovalDecideRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    """
    Submit an approval or rejection decision.
    Delegates to the approval engine service which:
      1. Validates the caller is the current step's approver
      2. Records the decision
      3. Evaluates the rule (percentage / key_approver / hybrid)
      4. Advances or resolves the expense
    """
    # Verify expense exists and belongs to caller's company
    expense = (
        db.query(Expense)
        .filter(
            Expense.id == expense_id,
            Expense.company_id == current_user.company_id,
            Expense.deleted_at.is_(None),
        )
        .first()
    )
    if not expense:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")

    try:
        result = process_decision(
            expense_id=expense_id,
            user_id=current_user.id,
            decision=payload.decision.value,
            comment=payload.comment,
            allow_override=(current_user.role == "admin"),
            db=db,
        )
    except NotCurrentApproverError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except ExpenseNotPendingError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
    except ApprovalEngineError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    return ApprovalDecideResponse(
        expense_id=UUID(result["expense_id"]),
        decision=result["decision"],
        next_step=result.get("next_step"),
        expense_status=result["expense_status"],
        triggered_by=result.get("triggered_by"),
    )


# ─── GET /approvals/{expense_id}/history ─────────────────────────────────────
# TASK-25: Full decision log for an expense

@router.get("/{expense_id}/history", response_model=List[ApprovalHistoryItem])
def get_expense_approval_history(
    expense_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return all approval decisions for an expense, ordered by step."""
    # Verify expense exists and belongs to caller's company
    expense = (
        db.query(Expense)
        .filter(
            Expense.id == expense_id,
            Expense.company_id == current_user.company_id,
            Expense.deleted_at.is_(None),
        )
        .first()
    )
    if not expense:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")

    history = get_approval_history(expense_id, db)
    return [ApprovalHistoryItem(**item) for item in history]
