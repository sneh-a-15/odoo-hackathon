from pydantic import BaseModel, EmailStr, field_validator
from uuid import UUID
from datetime import datetime
from typing import Optional
from enum import Enum


class AllowedRole(str, Enum):
    employee = "employee"
    manager = "manager"


# ─── Request Schemas ──────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    email: EmailStr
    full_name: str
    role: AllowedRole
    password: str
    manager_id: Optional[UUID] = None

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least 1 number")
        return v

    @field_validator("full_name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Full name cannot be empty")
        return v.strip()


class UserUpdate(BaseModel):
    role: Optional[AllowedRole] = None
    manager_id: Optional[UUID] = None


# ─── Response Schemas ─────────────────────────────────────────────────────────

class UserResponse(BaseModel):
    id: UUID
    email: str
    full_name: str
    role: str
    manager_id: Optional[UUID] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class UserCreateResponse(BaseModel):
    id: UUID
    email: str
    full_name: str
    role: str
    manager_id: Optional[UUID] = None

    model_config = {"from_attributes": True}


class UserUpdateResponse(BaseModel):
    id: UUID
    role: str
    manager_id: Optional[UUID] = None

    model_config = {"from_attributes": True}


class UserDeleteResponse(BaseModel):
    id: UUID
    deleted_at: datetime
