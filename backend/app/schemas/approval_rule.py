from pydantic import BaseModel, field_validator, model_validator
from uuid import UUID
from typing import Optional, List
from enum import Enum
from datetime import datetime


class RuleTypeEnum(str, Enum):
    percentage = "percentage"
    key_approver = "key_approver"
    hybrid = "hybrid"


# ─── Step Schemas ─────────────────────────────────────────────────────────────

class ApprovalStepCreate(BaseModel):
    approver_user_id: UUID
    step_order: int
    is_manager_approver: bool = False


class ApprovalStepResponse(BaseModel):
    id: UUID
    approver_user_id: UUID
    step_order: int
    is_manager_approver: bool

    model_config = {"from_attributes": True}


# ─── Rule Request Schemas ─────────────────────────────────────────────────────

class ApprovalRuleCreate(BaseModel):
    name: str
    rule_type: RuleTypeEnum
    percentage_threshold: Optional[float] = None
    key_approver_id: Optional[UUID] = None
    steps: List[ApprovalStepCreate]

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Rule name cannot be empty")
        return v.strip()

    @model_validator(mode="after")
    def validate_rule_fields(self):
        rt = self.rule_type

        if rt == RuleTypeEnum.percentage:
            if self.percentage_threshold is None:
                raise ValueError("percentage_threshold is required for 'percentage' rule type")
            if not (1 <= self.percentage_threshold <= 100):
                raise ValueError("percentage_threshold must be between 1 and 100")

        elif rt == RuleTypeEnum.key_approver:
            if self.key_approver_id is None:
                raise ValueError("key_approver_id is required for 'key_approver' rule type")

        elif rt == RuleTypeEnum.hybrid:
            if self.percentage_threshold is None:
                raise ValueError("percentage_threshold is required for 'hybrid' rule type")
            if not (1 <= self.percentage_threshold <= 100):
                raise ValueError("percentage_threshold must be between 1 and 100")
            if self.key_approver_id is None:
                raise ValueError("key_approver_id is required for 'hybrid' rule type")

        return self

    @field_validator("steps")
    @classmethod
    def validate_steps(cls, v: List[ApprovalStepCreate]) -> List[ApprovalStepCreate]:
        if len(v) < 1:
            raise ValueError("At least 1 approval step is required")

        orders = sorted([s.step_order for s in v])
        expected = list(range(1, len(v) + 1))
        if orders != expected:
            raise ValueError(
                f"step_order values must be unique and contiguous starting from 1. "
                f"Got {orders}, expected {expected}"
            )
        return v


class ApprovalRuleUpdate(BaseModel):
    name: Optional[str] = None
    rule_type: Optional[RuleTypeEnum] = None
    percentage_threshold: Optional[float] = None
    key_approver_id: Optional[UUID] = None
    steps: Optional[List[ApprovalStepCreate]] = None

    @model_validator(mode="after")
    def validate_rule_fields(self):
        rt = self.rule_type
        if rt is None:
            return self

        if rt == RuleTypeEnum.percentage:
            if self.percentage_threshold is None:
                raise ValueError("percentage_threshold is required for 'percentage' rule type")
            if not (1 <= self.percentage_threshold <= 100):
                raise ValueError("percentage_threshold must be between 1 and 100")

        elif rt == RuleTypeEnum.key_approver:
            if self.key_approver_id is None:
                raise ValueError("key_approver_id is required for 'key_approver' rule type")

        elif rt == RuleTypeEnum.hybrid:
            if self.percentage_threshold is None:
                raise ValueError("percentage_threshold is required for 'hybrid' rule type")
            if not (1 <= self.percentage_threshold <= 100):
                raise ValueError("percentage_threshold must be between 1 and 100")
            if self.key_approver_id is None:
                raise ValueError("key_approver_id is required for 'hybrid' rule type")

        return self

    @field_validator("steps")
    @classmethod
    def validate_steps(cls, v):
        if v is None:
            return v
        if len(v) < 1:
            raise ValueError("At least 1 approval step is required")

        orders = sorted([s.step_order for s in v])
        expected = list(range(1, len(v) + 1))
        if orders != expected:
            raise ValueError(
                f"step_order values must be unique and contiguous starting from 1. "
                f"Got {orders}, expected {expected}"
            )
        return v


# ─── Rule Response Schemas ────────────────────────────────────────────────────

class ApprovalRuleResponse(BaseModel):
    id: UUID
    name: str
    rule_type: str
    percentage_threshold: Optional[float] = None
    key_approver_id: Optional[UUID] = None
    steps: List[ApprovalStepResponse] = []

    model_config = {"from_attributes": True}


class ApprovalRuleListItem(BaseModel):
    id: UUID
    name: str
    rule_type: str
    steps_count: int

    model_config = {"from_attributes": True}
