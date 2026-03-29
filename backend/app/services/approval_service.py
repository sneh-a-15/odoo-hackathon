"""
Core Approval Engine Service
────────────────────────────
Handles the full lifecycle of expense approval workflows:
  1. initialize_workflow  — attach a rule to an expense, set up step 1
  2. process_decision     — record a vote, evaluate the rule, advance or resolve
  3. _evaluate_rule       — determine if the expense should be resolved based on
                            percentage / key_approver / hybrid conditions
"""

from uuid import UUID
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func

from app.models.models import (
    Expense,
    ApprovalRule,
    ApprovalStep,
    ApprovalDecision,
    ExpenseStatus,
    DecisionType,
    RuleType,
)


class ApprovalEngineError(Exception):
    """Base exception for approval engine errors."""
    pass


class NotCurrentApproverError(ApprovalEngineError):
    """Raised when the caller is not the designated approver for the current step."""
    pass


class ExpenseNotPendingError(ApprovalEngineError):
    """Raised when trying to act on an expense that is not in 'pending' status."""
    pass


class NoApprovalRuleError(ApprovalEngineError):
    """Raised when no approval rule is found for the company."""
    pass


# ─── Public API ───────────────────────────────────────────────────────────────

def initialize_workflow(expense_id: UUID, rule_id: UUID, db: Session) -> dict:
    """
    Attach an approval rule to an expense and prepare it for step 1.

    Args:
        expense_id: The expense to initialize.
        rule_id: The approval rule to attach.
        db: Database session.

    Returns:
        Dict with expense_id, rule_id, total_steps, current_step.
    """
    expense = db.query(Expense).filter(Expense.id == expense_id).first()
    if not expense:
        raise ApprovalEngineError(f"Expense {expense_id} not found")

    rule = (
        db.query(ApprovalRule)
        .options(joinedload(ApprovalRule.steps))
        .filter(
            ApprovalRule.id == rule_id,
            ApprovalRule.company_id == expense.company_id,
            ApprovalRule.deleted_at.is_(None),
        )
        .first()
    )
    if not rule:
        raise NoApprovalRuleError(f"Approval rule {rule_id} not found in this company")

    active_steps = [s for s in rule.steps if s.deleted_at is None]
    if not active_steps:
        raise ApprovalEngineError("Approval rule has no active steps")

    # Attach rule and set to step 1
    expense.approval_rule_id = rule.id
    expense.current_step = 1
    expense.status = ExpenseStatus.pending

    db.commit()
    db.refresh(expense)

    return {
        "expense_id": str(expense.id),
        "rule_id": str(rule.id),
        "rule_name": rule.name,
        "total_steps": len(active_steps),
        "current_step": expense.current_step,
    }


def auto_assign_rule(expense_id: UUID, db: Session) -> dict:
    """
    Automatically find and attach the first active approval rule
    for the expense's company. Called during expense submission.
    """
    expense = db.query(Expense).filter(Expense.id == expense_id).first()
    if not expense:
        raise ApprovalEngineError(f"Expense {expense_id} not found")

    rule = (
        db.query(ApprovalRule)
        .options(joinedload(ApprovalRule.steps))
        .filter(
            ApprovalRule.company_id == expense.company_id,
            ApprovalRule.deleted_at.is_(None),
        )
        .first()
    )
    if not rule:
        raise NoApprovalRuleError("No approval rule configured for this company")

    return initialize_workflow(expense_id, rule.id, db)


def process_decision(
    expense_id: UUID,
    user_id: UUID,
    decision: str,
    comment: str | None,
    db: Session,
    allow_override: bool = False,
) -> dict:
    """
    Process an approval or rejection decision on an expense.

    Flow:
      1. Validate expense is pending and caller is the current step's approver.
      2. Write an ApprovalDecision row.
      3. If rejected → expense status = 'rejected', chain halted.
      4. If approved → evaluate the rule:
         a. Check if rule conditions are met (percentage / key_approver / hybrid).
         b. If met → expense status = 'approved'.
         c. If not met → advance current_step to next step.
         d. If all steps exhausted → expense status = 'approved'.

    Returns:
        Dict with expense_id, decision, expense_status, next_step, triggered_by.
    """
    expense = (
        db.query(Expense)
        .options(
            joinedload(Expense.approval_rule),
            joinedload(Expense.submitted_by_user)
        )
        .filter(Expense.id == expense_id, Expense.deleted_at.is_(None))
        .first()
    )
    if not expense:
        raise ApprovalEngineError(f"Expense {expense_id} not found")

    if expense.status != ExpenseStatus.pending:
        raise ExpenseNotPendingError(
            f"Expense is already '{expense.status.value}', cannot process further decisions"
        )

    if not expense.approval_rule_id:
        raise ApprovalEngineError("Expense has no approval rule attached")

    # Get the current step and verify the caller is the designated approver
    current_step = (
        db.query(ApprovalStep)
        .filter(
            ApprovalStep.rule_id == expense.approval_rule_id,
            ApprovalStep.step_order == expense.current_step,
            ApprovalStep.deleted_at.is_(None),
        )
        .first()
    )
    if not current_step:
        raise ApprovalEngineError(
            f"No step found at step_order={expense.current_step} for this rule"
        )

    expected_approver_id = current_step.approver_user_id
    if current_step.is_manager_approver and expense.submitted_by_user and expense.submitted_by_user.manager_id:
        expected_approver_id = expense.submitted_by_user.manager_id

    is_override = False
    if expected_approver_id != user_id:
        if not allow_override:
            raise NotCurrentApproverError(
                "You are not the designated approver for the current step"
            )
        is_override = True

    # Check for duplicate decision at this step
    existing = (
        db.query(ApprovalDecision)
        .filter(
            ApprovalDecision.expense_id == expense_id,
            ApprovalDecision.step_index == expense.current_step,
            ApprovalDecision.deleted_at.is_(None),
        )
        .first()
    )
    if existing:
        raise ApprovalEngineError(
            f"A decision has already been recorded for step {expense.current_step}"
        )

    # Write the decision
    decision_enum = DecisionType(decision)
    approval_decision = ApprovalDecision(
        expense_id=expense.id,
        decided_by=user_id,
        step_index=expense.current_step,
        decision=decision_enum,
        comment=comment,
    )
    db.add(approval_decision)
    db.flush()

    # Evaluate outcome
    if is_override:
        if decision_enum == DecisionType.rejected:
            expense.status = ExpenseStatus.rejected
            result = {
                "expense_id": str(expense.id),
                "decision": "rejected",
                "expense_status": "rejected",
                "next_step": None,
                "triggered_by": "admin_override",
            }
        else:
            expense.status = ExpenseStatus.approved
            result = {
                "expense_id": str(expense.id),
                "decision": "approved",
                "expense_status": "approved",
                "next_step": None,
                "triggered_by": "admin_override",
            }
    else:
        result = _evaluate_and_advance(expense, decision_enum, db)

    db.commit()
    db.refresh(expense)

    return result


# ─── Internal Evaluation Logic ────────────────────────────────────────────────

def _evaluate_and_advance(
    expense: Expense,
    latest_decision: DecisionType,
    db: Session,
) -> dict:
    """
    After recording a decision, evaluate whether the expense should be resolved.

    Rejection short-circuit: any rejection → expense rejected immediately.

    Approval evaluation (by rule_type):
      - percentage:   approved_count / total_steps >= threshold
      - key_approver: the key approver has voted 'approved'
      - hybrid:       EITHER percentage OR key_approver condition is met
      - (fallback):   all steps complete → approved
    """

    # ── REJECTION SHORT-CIRCUIT ───────────────────────────────────────────
    if latest_decision == DecisionType.rejected:
        expense.status = ExpenseStatus.rejected
        return {
            "expense_id": str(expense.id),
            "decision": "rejected",
            "expense_status": "rejected",
            "next_step": None,
            "triggered_by": "rejection",
        }

    # ── LOAD RULE + ALL DATA ──────────────────────────────────────────────
    rule = (
        db.query(ApprovalRule)
        .options(joinedload(ApprovalRule.steps))
        .filter(ApprovalRule.id == expense.approval_rule_id)
        .first()
    )

    active_steps = sorted(
        [s for s in rule.steps if s.deleted_at is None],
        key=lambda s: s.step_order,
    )
    total_steps = len(active_steps)

    # Count all approved decisions for this expense
    approved_count = (
        db.query(ApprovalDecision)
        .filter(
            ApprovalDecision.expense_id == expense.id,
            ApprovalDecision.decision == DecisionType.approved,
            ApprovalDecision.deleted_at.is_(None),
        )
        .count()
    )

    approval_percentage = (approved_count / total_steps * 100) if total_steps > 0 else 0

    # ── RULE EVALUATION ──────────────────────────────────────────────────
    resolved = False
    triggered_by = None

    rule_type = rule.rule_type
    if isinstance(rule_type, RuleType):
        rule_type = rule_type.value

    # Check key_approver condition
    key_approver_passed = False
    if rule.key_approver_id:
        key_approver_decision = (
            db.query(ApprovalDecision)
            .filter(
                ApprovalDecision.expense_id == expense.id,
                ApprovalDecision.decided_by == rule.key_approver_id,
                ApprovalDecision.decision == DecisionType.approved,
                ApprovalDecision.deleted_at.is_(None),
            )
            .first()
        )
        key_approver_passed = key_approver_decision is not None

    # Check percentage condition
    percentage_passed = False
    if rule.percentage_threshold is not None:
        percentage_passed = approval_percentage >= float(rule.percentage_threshold)

    # Evaluate based on rule_type
    if rule_type == "percentage":
        if percentage_passed:
            resolved = True
            triggered_by = "percentage"

    elif rule_type == "key_approver":
        if key_approver_passed:
            resolved = True
            triggered_by = "key_approver"

    elif rule_type == "hybrid":
        if key_approver_passed:
            resolved = True
            triggered_by = "key_approver"
        elif percentage_passed:
            resolved = True
            triggered_by = "percentage"

    # Fallback: all steps completed → approve
    if not resolved and approved_count >= total_steps:
        resolved = True
        triggered_by = "all_steps_complete"

    # ── RESOLVE OR ADVANCE ────────────────────────────────────────────────
    if resolved:
        expense.status = ExpenseStatus.approved
        return {
            "expense_id": str(expense.id),
            "decision": "approved",
            "expense_status": "approved",
            "next_step": None,
            "triggered_by": triggered_by,
            "approved_count": approved_count,
            "total_steps": total_steps,
            "approval_percentage": round(approval_percentage, 2),
        }
    else:
        # Advance to next step
        expense.current_step += 1
        return {
            "expense_id": str(expense.id),
            "decision": "approved",
            "expense_status": "pending",
            "next_step": expense.current_step,
            "triggered_by": None,
            "approved_count": approved_count,
            "total_steps": total_steps,
            "approval_percentage": round(approval_percentage, 2),
        }


# ─── Query Helpers ────────────────────────────────────────────────────────────

def get_current_approver(expense_id: UUID, db: Session) -> UUID | None:
    """Return the user_id of the designated approver for the expense's current step."""
    expense = db.query(Expense).options(joinedload(Expense.submitted_by_user)).filter(Expense.id == expense_id).first()
    if not expense or not expense.approval_rule_id:
        return None

    step = (
        db.query(ApprovalStep)
        .filter(
            ApprovalStep.rule_id == expense.approval_rule_id,
            ApprovalStep.step_order == expense.current_step,
            ApprovalStep.deleted_at.is_(None),
        )
        .first()
    )
    if not step:
        return None

    expected_approver_id = step.approver_user_id
    if step.is_manager_approver and expense.submitted_by_user and expense.submitted_by_user.manager_id:
        expected_approver_id = expense.submitted_by_user.manager_id

    return expected_approver_id


def get_approval_history(expense_id: UUID, db: Session) -> list[dict]:
    """Return all decisions for an expense, ordered by step_index."""
    decisions = (
        db.query(ApprovalDecision)
        .options(joinedload(ApprovalDecision.decided_by_user))
        .filter(
            ApprovalDecision.expense_id == expense_id,
            ApprovalDecision.deleted_at.is_(None),
        )
        .order_by(ApprovalDecision.step_index)
        .all()
    )
    return [
        {
            "step_index": d.step_index,
            "decided_by": str(d.decided_by),
            "decided_by_name": (d.decided_by_user.full_name or d.decided_by_user.email) if d.decided_by_user else None,
            "decision": d.decision.value if hasattr(d.decision, 'value') else d.decision,
            "comment": d.comment,
            "decided_at": d.decided_at.isoformat() if d.decided_at else None,
        }
        for d in decisions
    ]
