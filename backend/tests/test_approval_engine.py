import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.database import Base
from app.models.models import (
    Company, User, Expense, ApprovalRule, ApprovalStep, ApprovalDecision,
    UserRole, ExpenseCategory, RuleType, DecisionType
)
from app.services.approval_service import process_decision, initialize_workflow, NotCurrentApproverError
import uuid
from datetime import date

TEST_DB_URL = "postgresql://postgres:1234@localhost:5432/reimbursement_test"

engine = create_engine(TEST_DB_URL)
TestSession = sessionmaker(bind=engine)


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(engine)
    yield
    Base.metadata.drop_all(engine)


@pytest.fixture
def db():
    session = TestSession()
    yield session
    session.close()


# ─── Helpers ──────────────────────────────────────────────────────────────────

def make_company(db):
    c = Company(name="Test Co", country_code="IN", default_currency="INR")
    db.add(c)
    db.flush()
    return c


def make_user(db, company_id, role=UserRole.manager):
    u = User(
        company_id=company_id,
        email=f"{uuid.uuid4()}@test.com",
        full_name="Test User",
        hashed_password="hashed",
        role=role,
    )
    db.add(u)
    db.flush()
    return u


def make_rule(db, company_id, rule_type, percentage=None, key_approver_id=None, approvers=[]):
    rule = ApprovalRule(
        company_id=company_id,
        name="Test Rule",
        rule_type=rule_type,
        percentage_threshold=percentage,
        key_approver_id=key_approver_id,
    )
    db.add(rule)
    db.flush()
    for i, approver_id in enumerate(approvers):
        step = ApprovalStep(
            rule_id=rule.id,
            approver_user_id=approver_id,
            step_order=i + 1,
        )
        db.add(step)
    db.flush()
    return rule


def make_expense(db, company_id, submitted_by, rule_id):
    e = Expense(
        company_id=company_id,
        submitted_by=submitted_by,
        approval_rule_id=rule_id,
        title="Test Expense",
        category=ExpenseCategory.travel,
        expense_date=date(2026, 1, 1),
        amount=1000,
        currency="INR",
        status="pending",
        current_step=1,
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    return e


# ─── Tests ────────────────────────────────────────────────────────────────────

def test_percentage_rule_resolves(db):
    company = make_company(db)
    users = [make_user(db, company.id) for _ in range(5)]
    rule = make_rule(db, company.id, RuleType.percentage, percentage=60, approvers=[u.id for u in users])
    employee = make_user(db, company.id, role=UserRole.employee)
    expense = make_expense(db, company.id, employee.id, rule.id)

    # Step through first 3 approvers (60%)
    for i, u in enumerate(users[:3]):
        expense.current_step = i + 1
        db.commit()
        result = process_decision(expense.id, u.id, "approved", "ok", db)

    assert result["expense_status"] == "approved"
    assert result["triggered_by"] == "percentage"


def test_key_approver_resolves_immediately(db):
    company = make_company(db)
    cfo = make_user(db, company.id)
    other = make_user(db, company.id)
    rule = make_rule(db, company.id, RuleType.key_approver, key_approver_id=cfo.id, approvers=[cfo.id, other.id])
    employee = make_user(db, company.id, role=UserRole.employee)
    expense = make_expense(db, company.id, employee.id, rule.id)

    # CFO approves at step 1
    result = process_decision(expense.id, cfo.id, "approved", "CFO approved", db)

    assert result["expense_status"] == "approved"
    assert result["triggered_by"] == "key_approver"


def test_hybrid_resolves_on_key_approver(db):
    company = make_company(db)
    cfo = make_user(db, company.id)
    others = [make_user(db, company.id) for _ in range(4)]
    rule = make_rule(
        db, company.id, RuleType.hybrid,
        percentage=80, key_approver_id=cfo.id,
        approvers=[cfo.id] + [u.id for u in others]
    )
    employee = make_user(db, company.id, role=UserRole.employee)
    expense = make_expense(db, company.id, employee.id, rule.id)

    # Only CFO approves (20% < 80%) but hybrid should resolve via key_approver
    result = process_decision(expense.id, cfo.id, "approved", "ok", db)

    assert result["expense_status"] == "approved"
    assert result["triggered_by"] == "key_approver"


def test_rejection_resolves_immediately(db):
    company = make_company(db)
    users = [make_user(db, company.id) for _ in range(3)]
    rule = make_rule(db, company.id, RuleType.percentage, percentage=60, approvers=[u.id for u in users])
    employee = make_user(db, company.id, role=UserRole.employee)
    expense = make_expense(db, company.id, employee.id, rule.id)

    result = process_decision(expense.id, users[0].id, "rejected", "not valid", db)

    assert result["expense_status"] == "rejected"
    assert result["triggered_by"] == "rejection"


def test_admin_override_approves_any_pending_step(db):
    company = make_company(db)
    assigned_approver = make_user(db, company.id, role=UserRole.manager)
    admin = make_user(db, company.id, role=UserRole.admin)
    employee = make_user(db, company.id, role=UserRole.employee)

    rule = make_rule(db, company.id, RuleType.percentage, percentage=100, approvers=[assigned_approver.id])
    expense = make_expense(db, company.id, employee.id, rule.id)

    result = process_decision(
        expense_id=expense.id,
        user_id=admin.id,
        decision="approved",
        comment="Admin override approval",
        allow_override=True,
        db=db,
    )

    db.refresh(expense)
    assert result["expense_status"] == "approved"
    assert result["triggered_by"] == "admin_override"
    assert expense.status.value == "approved"


def test_non_override_user_cannot_act_outside_current_approver(db):
    company = make_company(db)
    assigned_approver = make_user(db, company.id, role=UserRole.manager)
    another_manager = make_user(db, company.id, role=UserRole.manager)
    employee = make_user(db, company.id, role=UserRole.employee)

    rule = make_rule(db, company.id, RuleType.percentage, percentage=100, approvers=[assigned_approver.id])
    expense = make_expense(db, company.id, employee.id, rule.id)

    with pytest.raises(NotCurrentApproverError):
        process_decision(
            expense_id=expense.id,
            user_id=another_manager.id,
            decision="approved",
            comment="Trying to approve",
            allow_override=False,
            db=db,
        )