from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID
from app.core.database import get_db
from app.core.dependencies import get_current_user, require_employee
from app.models.models import Expense, Company, User
from app.schemas.expense import ExpenseCreate, ExpenseResponse
from app.services.currency_service import convert_amount
from app.services.approval_service import auto_assign_rule, NoApprovalRuleError

router = APIRouter(prefix="/expenses", tags=["expenses"])

@router.post("", response_model=ExpenseResponse)
async def submit_expense(
    payload: ExpenseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_employee)
):
    company = db.query(Company).filter(Company.id == current_user.company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    # convert to company currency
    conversion = await convert_amount(
        float(payload.amount),
        payload.currency,
        company.default_currency
    )

    expense = Expense(
        company_id=current_user.company_id,
        submitted_by=current_user.id,
        title=payload.title,
        category=payload.category,
        description=payload.description,
        expense_date=payload.expense_date,
        amount=payload.amount,
        currency=payload.currency,
        converted_amount=conversion["converted_amount"],
        exchange_rate=conversion["rate"],
        status="pending",
        current_step=1,
    )

    db.add(expense)
    db.commit()
    db.refresh(expense)

    # Auto-assign approval rule so the expense enters the approval queue
    try:
        auto_assign_rule(expense.id, db)
    except NoApprovalRuleError:
        # No rule configured yet — expense is saved but won't appear in queue
        pass

    return {
        "id": expense.id,
        "title": expense.title,
        "category": expense.category,
        "amount": float(expense.amount),
        "currency": expense.currency,
        "converted_amount": float(expense.converted_amount),
        "company_currency": company.default_currency,
        "status": expense.status,
        "current_step": expense.current_step,
    }

@router.get("")
def get_expenses(
    status: str | None = None,
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(Expense).filter(
        Expense.company_id == current_user.company_id,
        Expense.deleted_at == None
    )

    # employees only see their own
    if current_user.role == "employee":
        query = query.filter(Expense.submitted_by == current_user.id)
    # managers see only their direct reports' expenses
    elif current_user.role == "manager":
        team_ids = (
            db.query(User.id)
            .filter(User.manager_id == current_user.id, User.deleted_at.is_(None))
            .all()
        )
        team_id_list = [uid for (uid,) in team_ids]
        query = query.filter(Expense.submitted_by.in_(team_id_list))
    # admin sees all company expenses (no extra filter)

    if status:
        query = query.filter(Expense.status == status)

    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()

    return {
        "items": [
            {
                "id": str(e.id),
                "title": e.title,
                "amount": float(e.amount),
                "currency": e.currency,
                "converted_amount": float(e.converted_amount) if e.converted_amount else None,
                "status": e.status,
                "expense_date": str(e.expense_date),
                "category": e.category,
            }
            for e in items
        ],
        "total": total,
        "page": page,
    }