"""
TASK-23: Cross-tenant isolation tests
─────────────────────────────────────
Creates two separate companies with their own users, expenses, and approval rules.
Asserts that Company B's user can NEVER read or write Company A's data.
"""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient
from datetime import date
import uuid

from app.core.database import Base
from app.models.models import (
    Company, User, Expense, ApprovalRule, ApprovalStep,
    UserRole, ExpenseCategory, RuleType,
)
from app.core.security import hash_password, create_access_token

TEST_DB_URL = "postgresql://postgres:1234@localhost:5432/reimbursement_test"

engine = create_engine(TEST_DB_URL)
TestSession = sessionmaker(bind=engine)


# ─── Fixtures ─────────────────────────────────────────────────────────────────

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

def make_company(db, name="Test Co", currency="INR"):
    c = Company(name=name, country_code="IN", default_currency=currency)
    db.add(c)
    db.flush()
    return c


def make_user(db, company_id, role=UserRole.admin, email=None):
    u = User(
        company_id=company_id,
        email=email or f"{uuid.uuid4()}@test.com",
        full_name="Test User",
        hashed_password=hash_password("password123"),
        role=role,
    )
    db.add(u)
    db.flush()
    return u


def make_expense(db, company_id, submitted_by):
    e = Expense(
        company_id=company_id,
        submitted_by=submitted_by,
        title="Test Expense",
        category=ExpenseCategory.travel,
        expense_date=date(2026, 1, 15),
        amount=500,
        currency="INR",
        converted_amount=500,
        status="pending",
        current_step=1,
    )
    db.add(e)
    db.flush()
    return e


def make_rule(db, company_id, approver_id):
    rule = ApprovalRule(
        company_id=company_id,
        name="Test Rule",
        rule_type=RuleType.percentage,
        percentage_threshold=100,
    )
    db.add(rule)
    db.flush()
    step = ApprovalStep(
        rule_id=rule.id,
        approver_user_id=approver_id,
        step_order=1,
    )
    db.add(step)
    db.flush()
    return rule


def token_for(user):
    return create_access_token({
        "sub": str(user.id),
        "role": user.role.value if hasattr(user.role, 'value') else user.role,
        "company_id": str(user.company_id),
    })


def auth_header(user):
    return {"Authorization": f"Bearer {token_for(user)}"}


# ─── Setup two isolated companies ────────────────────────────────────────────

@pytest.fixture
def two_companies(db):
    """Create two companies each with admin, manager, employee, expense, rule."""
    # Company A
    co_a = make_company(db, name="Company Alpha", currency="USD")
    admin_a = make_user(db, co_a.id, UserRole.admin, "admin-a@alpha.com")
    mgr_a = make_user(db, co_a.id, UserRole.manager, "mgr-a@alpha.com")
    emp_a = make_user(db, co_a.id, UserRole.employee, "emp-a@alpha.com")
    exp_a = make_expense(db, co_a.id, emp_a.id)
    rule_a = make_rule(db, co_a.id, mgr_a.id)

    # Company B
    co_b = make_company(db, name="Company Beta", currency="EUR")
    admin_b = make_user(db, co_b.id, UserRole.admin, "admin-b@beta.com")
    mgr_b = make_user(db, co_b.id, UserRole.manager, "mgr-b@beta.com")
    emp_b = make_user(db, co_b.id, UserRole.employee, "emp-b@beta.com")
    exp_b = make_expense(db, co_b.id, emp_b.id)
    rule_b = make_rule(db, co_b.id, mgr_b.id)

    db.commit()

    return {
        "a": {"company": co_a, "admin": admin_a, "manager": mgr_a, "employee": emp_a, "expense": exp_a, "rule": rule_a},
        "b": {"company": co_b, "admin": admin_b, "manager": mgr_b, "employee": emp_b, "expense": exp_b, "rule": rule_b},
    }


# ─── Import the FastAPI app for TestClient ────────────────────────────────────

from main import app
from app.core.database import get_db


@pytest.fixture
def test_client(db):
    """Override the DB dependency to use our test session."""
    def override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ─── Tests ────────────────────────────────────────────────────────────────────

class TestExpenseCrossTenant:
    """Company B users must NOT see or modify Company A expenses."""

    def test_admin_b_cannot_list_company_a_expenses(self, test_client, two_companies):
        admin_b = two_companies["b"]["admin"]
        res = test_client.get("/api/v1/expenses", headers=auth_header(admin_b))
        assert res.status_code == 200
        data = res.json()
        # Admin B should see only Company B's expenses (or none from A)
        for item in data.get("items", []):
            assert item["id"] != str(two_companies["a"]["expense"].id), \
                "Admin B can see Company A's expense — tenant leak!"

    def test_admin_b_cannot_view_company_a_expense_history(self, test_client, two_companies):
        admin_b = two_companies["b"]["admin"]
        expense_a_id = two_companies["a"]["expense"].id
        res = test_client.get(
            f"/api/v1/approvals/{expense_a_id}/history",
            headers=auth_header(admin_b),
        )
        assert res.status_code == 404, \
            f"Expected 404, got {res.status_code} — cross-tenant history leak!"


class TestUsersCrossTenant:
    """Company B admin must NOT list Company A users."""

    def test_admin_b_cannot_list_company_a_users(self, test_client, two_companies):
        admin_b = two_companies["b"]["admin"]
        res = test_client.get("/api/v1/users", headers=auth_header(admin_b))
        assert res.status_code == 200
        data = res.json()
        a_user_ids = {
            str(two_companies["a"]["admin"].id),
            str(two_companies["a"]["manager"].id),
            str(two_companies["a"]["employee"].id),
        }
        returned_ids = {u["id"] for u in data}
        assert a_user_ids.isdisjoint(returned_ids), \
            "Admin B can see Company A users — tenant leak!"


class TestApprovalRulesCrossTenant:
    """Company B admin must NOT list or modify Company A rules."""

    def test_admin_b_cannot_list_company_a_rules(self, test_client, two_companies):
        admin_b = two_companies["b"]["admin"]
        res = test_client.get("/api/v1/approval-rules", headers=auth_header(admin_b))
        assert res.status_code == 200
        data = res.json()
        rule_a_id = str(two_companies["a"]["rule"].id)
        returned_ids = {r["id"] for r in data}
        assert rule_a_id not in returned_ids, \
            "Admin B can see Company A's approval rule — tenant leak!"

    def test_admin_b_cannot_update_company_a_rule(self, test_client, two_companies):
        admin_b = two_companies["b"]["admin"]
        rule_a_id = two_companies["a"]["rule"].id
        res = test_client.patch(
            f"/api/v1/approval-rules/{rule_a_id}",
            headers=auth_header(admin_b),
            json={"name": "Hacked Rule"},
        )
        assert res.status_code == 404, \
            f"Expected 404, got {res.status_code} — cross-tenant rule update!"


class TestApprovalQueueCrossTenant:
    """Company B manager must NOT see Company A's pending expenses."""

    def test_manager_b_queue_has_no_company_a_expenses(self, test_client, two_companies):
        mgr_b = two_companies["b"]["manager"]
        res = test_client.get("/api/v1/approvals/queue", headers=auth_header(mgr_b))
        assert res.status_code == 200
        data = res.json()
        expense_a_id = str(two_companies["a"]["expense"].id)
        returned_ids = {item["expense_id"] for item in data}
        assert expense_a_id not in returned_ids, \
            "Manager B sees Company A expense in queue — tenant leak!"

    def test_manager_b_cannot_decide_company_a_expense(self, test_client, two_companies):
        mgr_b = two_companies["b"]["manager"]
        expense_a_id = two_companies["a"]["expense"].id
        res = test_client.post(
            f"/api/v1/approvals/{expense_a_id}/decide",
            headers=auth_header(mgr_b),
            json={"decision": "approved", "comment": "sneaky approval"},
        )
        assert res.status_code == 404, \
            f"Expected 404, got {res.status_code} — cross-tenant approval!"
