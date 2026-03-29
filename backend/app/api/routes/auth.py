from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import hash_password, verify_password, create_access_token
from app.core.dependencies import get_current_user
from app.schemas.auth import RegisterRequest, LoginRequest, TokenResponse
from app.models.models import User, Company, UserRole
import httpx
import uuid

router = APIRouter(prefix="/auth", tags=["auth"])

async def get_currency_for_country(country_code: str) -> str:
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get("https://restcountries.com/v3.1/all?fields=name,currencies,cca2")
            countries = r.json()
            for c in countries:
                if c.get("cca2") == country_code.upper():
                    currencies = c.get("currencies", {})
                    if currencies:
                        return list(currencies.keys())[0]
    except Exception:
        pass
    return "USD"  # fallback

@router.post("/register", response_model=TokenResponse)
async def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    currency = await get_currency_for_country(payload.country_code)

    company = Company(
        name=payload.company_name,
        country_code=payload.country_code.upper(),
        default_currency=currency,
    )
    db.add(company)
    db.flush()

    user = User(
        company_id=company.id,
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
        role=UserRole.admin,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": str(user.id), "role": user.role, "company_id": str(company.id)})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"id": str(user.id), "email": user.email, "full_name": user.full_name, "role": user.role, "company_id": str(company.id), "company_currency": company.default_currency}
    }

@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    company = db.query(Company).filter(Company.id == user.company_id).first()
    token = create_access_token({"sub": str(user.id), "role": user.role, "company_id": str(user.company_id)})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"id": str(user.id), "email": user.email, "full_name": user.full_name, "role": user.role, "company_id": str(user.company_id), "company_currency": company.default_currency if company else "USD"}
    }

@router.get("/me")
def get_me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    company = db.query(Company).filter(Company.id == current_user.company_id).first()
    return {
        "id": str(current_user.id),
        "email": current_user.email,
        "full_name": current_user.full_name,
        "role": current_user.role.value if hasattr(current_user.role, 'value') else current_user.role,
        "company_id": str(current_user.company_id),
        "manager_id": str(current_user.manager_id) if current_user.manager_id else None,
        "company_currency": company.default_currency if company else "USD"
    }