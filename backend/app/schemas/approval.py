from pydantic import BaseModel, field_validator, model_validator
from uuid import UUID
from typing import Optional, List
from datetime import datetime
from enum import Enum


class DecisionEnum(str, Enum):
    approved = "approved"
    rejected = "rejected"


# ─── Request Schemas ──────────────────────────────────────────────────────────

class ApprovalDecideRequest(BaseModel):
    decision: DecisionEnum
    comment: Optional[str] = None

    @model_validator(mode="after")
    def comment_required_on_reject(self):
        if self.decision == DecisionEnum.rejected:
            if not self.comment or len(self.comment.strip()) < 10:
                raise ValueError("Comment is required on rejection and must be at least 10 characters")
        return self


# ─── Response Schemas ─────────────────────────────────────────────────────────

class ApprovalQueueItem(BaseModel):
    expense_id: UUID
    title: str
    submitted_by: str
    submitted_by_name: str
    amount: float
    currency: str
    converted_amount: Optional[float] = None
    current_step: int
    step_total: int
    category: str
    expense_date: str


class ApprovalDecideResponse(BaseModel):
    expense_id: UUID
    decision: str
    next_step: Optional[int] = None
    expense_status: str
    triggered_by: Optional[str] = None


class ApprovalHistoryItem(BaseModel):
    step_index: int
    decided_by: str
    decided_by_name: Optional[str] = None
    decision: str
    comment: Optional[str] = None
    decided_at: Optional[str] = None
