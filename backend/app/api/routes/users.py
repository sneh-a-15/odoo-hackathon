from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from uuid import UUID
from typing import List

from app.core.database import get_db
from app.core.dependencies import require_admin
from app.core.security import hash_password
from app.models.models import User, UserRole
from app.schemas.user import (
    UserCreate,
    UserUpdate,
    UserResponse,
    UserCreateResponse,
    UserUpdateResponse,
    UserDeleteResponse,
)

router = APIRouter(prefix="/users", tags=["users"])


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _validate_manager_id(manager_id: UUID, company_id, db: Session):
    """Ensure manager_id references a user with role=manager in the same company."""
    manager = (
        db.query(User)
        .filter(
            User.id == manager_id,
            User.company_id == company_id,
            User.role == UserRole.manager,
            User.deleted_at.is_(None),
        )
        .first()
    )
    if not manager:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="manager_id must reference a user with role 'manager' in the same company",
        )


# ─── POST /users ──────────────────────────────────────────────────────────────

@router.post("", response_model=UserCreateResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    # Check duplicate email
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    # Validate manager_id if provided
    if payload.manager_id:
        _validate_manager_id(payload.manager_id, admin.company_id, db)

    user = User(
        company_id=admin.company_id,
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
        role=UserRole(payload.role.value),
        manager_id=payload.manager_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


# ─── GET /users ───────────────────────────────────────────────────────────────

@router.get("", response_model=List[UserResponse])
def list_users(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    users = (
        db.query(User)
        .filter(
            User.company_id == admin.company_id,
            User.deleted_at.is_(None),
        )
        .order_by(User.created_at.desc())
        .all()
    )
    return users


# ─── PATCH /users/{user_id} ──────────────────────────────────────────────────

@router.patch("/{user_id}", response_model=UserUpdateResponse)
def update_user(
    user_id: UUID,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    # Tenant-scoped lookup
    user = (
        db.query(User)
        .filter(
            User.id == user_id,
            User.company_id == admin.company_id,
            User.deleted_at.is_(None),
        )
        .first()
    )
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Validate manager_id if provided
    if payload.manager_id is not None:
        _validate_manager_id(payload.manager_id, admin.company_id, db)
        user.manager_id = payload.manager_id

    if payload.role is not None:
        user.role = UserRole(payload.role.value)

    db.commit()
    db.refresh(user)
    return user


# ─── DELETE /users/{user_id} ─────────────────────────────────────────────────

@router.delete("/{user_id}", response_model=UserDeleteResponse)
def delete_user(
    user_id: UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    # Tenant-scoped lookup
    user = (
        db.query(User)
        .filter(
            User.id == user_id,
            User.company_id == admin.company_id,
            User.deleted_at.is_(None),
        )
        .first()
    )
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Prevent admin from deleting themselves
    if user.id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own account",
        )

    user.deleted_at = func.now()
    db.commit()
    db.refresh(user)
    return user
