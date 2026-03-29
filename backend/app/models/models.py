import uuid
from sqlalchemy import (
    Column, String, Text, DateTime, Date, Numeric,
    Boolean, Integer, ForeignKey, Enum, func
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.core.database import Base
import enum


# ─── Enums ────────────────────────────────────────────────────────────────────

class UserRole(str, enum.Enum):
    admin = "admin"
    manager = "manager"
    employee = "employee"


class ExpenseStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class ExpenseCategory(str, enum.Enum):
    travel = "travel"
    meals = "meals"
    accommodation = "accommodation"
    equipment = "equipment"
    other = "other"


class RuleType(str, enum.Enum):
    percentage = "percentage"
    key_approver = "key_approver"
    hybrid = "hybrid"


class DecisionType(str, enum.Enum):
    approved = "approved"
    rejected = "rejected"


# ─── Mixin ────────────────────────────────────────────────────────────────────

class TimestampMixin:
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    meta = Column(JSONB, nullable=True, default=dict)


# ─── Models ───────────────────────────────────────────────────────────────────

class Company(TimestampMixin, Base):
    __tablename__ = "companies"

    name = Column(String(255), nullable=False)
    country_code = Column(String(2), nullable=False)        # ISO 3166-1 alpha-2
    default_currency = Column(String(3), nullable=False)    # ISO 4217

    users = relationship("User", back_populates="company")
    expenses = relationship("Expense", back_populates="company")
    approval_rules = relationship("ApprovalRule", back_populates="company")


class User(TimestampMixin, Base):
    __tablename__ = "users"

    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False)
    email = Column(String(255), nullable=False, unique=True)
    full_name = Column(String(255), nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), nullable=False, default=UserRole.employee)
    manager_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)

    company = relationship("Company", back_populates="users")
    manager = relationship("User", remote_side="User.id", foreign_keys=[manager_id])
    expenses = relationship("Expense", back_populates="submitted_by_user", foreign_keys="Expense.submitted_by")
    approval_decisions = relationship("ApprovalDecision", back_populates="decided_by_user")


class Expense(TimestampMixin, Base):
    __tablename__ = "expenses"

    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False)
    submitted_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    approval_rule_id = Column(UUID(as_uuid=True), ForeignKey("approval_rules.id"), nullable=True)

    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    category = Column(Enum(ExpenseCategory), nullable=False)
    expense_date = Column(Date, nullable=False)

    amount = Column(Numeric(12, 2), nullable=False)             # original submitted amount
    currency = Column(String(3), nullable=False)                # original currency
    converted_amount = Column(Numeric(12, 2), nullable=True)    # in company default currency
    exchange_rate = Column(Numeric(18, 6), nullable=True)

    status = Column(Enum(ExpenseStatus), nullable=False, default=ExpenseStatus.pending)
    current_step = Column(Integer, nullable=False, default=1)

    company = relationship("Company", back_populates="expenses")
    submitted_by_user = relationship("User", back_populates="expenses", foreign_keys=[submitted_by])
    approval_rule = relationship("ApprovalRule", back_populates="expenses")
    expense_lines = relationship("ExpenseLine", back_populates="expense")
    approval_decisions = relationship("ApprovalDecision", back_populates="expense")
    receipt = relationship("Receipt", back_populates="expense", uselist=False)


class ExpenseLine(TimestampMixin, Base):
    __tablename__ = "expense_lines"

    expense_id = Column(UUID(as_uuid=True), ForeignKey("expenses.id"), nullable=False)
    description = Column(String(255), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    category = Column(Enum(ExpenseCategory), nullable=False)

    expense = relationship("Expense", back_populates="expense_lines")


class ApprovalRule(TimestampMixin, Base):
    __tablename__ = "approval_rules"

    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False)
    name = Column(String(255), nullable=False)
    rule_type = Column(Enum(RuleType), nullable=False)
    percentage_threshold = Column(Numeric(5, 2), nullable=True)   # e.g. 60.00
    key_approver_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    company = relationship("Company", back_populates="approval_rules")
    steps = relationship("ApprovalStep", back_populates="rule", order_by="ApprovalStep.step_order")
    expenses = relationship("Expense", back_populates="approval_rule")


class ApprovalStep(TimestampMixin, Base):
    __tablename__ = "approval_steps"

    rule_id = Column(UUID(as_uuid=True), ForeignKey("approval_rules.id"), nullable=False)
    approver_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    step_order = Column(Integer, nullable=False)
    is_manager_approver = Column(Boolean, default=False, nullable=False)

    rule = relationship("ApprovalRule", back_populates="steps")
    approver = relationship("User")


class ApprovalDecision(TimestampMixin, Base):
    __tablename__ = "approval_decisions"

    expense_id = Column(UUID(as_uuid=True), ForeignKey("expenses.id"), nullable=False)
    decided_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    step_index = Column(Integer, nullable=False)
    decision = Column(Enum(DecisionType), nullable=False)
    comment = Column(Text, nullable=True)
    decided_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    expense = relationship("Expense", back_populates="approval_decisions")
    decided_by_user = relationship("User", back_populates="approval_decisions")


class Receipt(TimestampMixin, Base):
    __tablename__ = "receipts"

    expense_id = Column(UUID(as_uuid=True), ForeignKey("expenses.id"), nullable=False, unique=True)
    file_url = Column(String(500), nullable=False)
    ocr_raw = Column(JSONB, nullable=True)       # raw OCR output
    ocr_parsed = Column(JSONB, nullable=True)    # parsed fields (amount, date, vendor etc.)
    ocr_status = Column(String(50), nullable=True)  # pending, done, failed

    expense = relationship("Expense", back_populates="receipt")