from pydantic import BaseModel, condecimal, validator
from datetime import date
from uuid import UUID
from enum import Enum

class ExpenseCategory(str, Enum):
    travel = "travel"
    meals = "meals"
    accommodation = "accommodation"
    equipment = "equipment"
    other = "other"

class ExpenseCreate(BaseModel):
    title: str
    category: ExpenseCategory
    description: str | None = None
    expense_date: date
    amount: condecimal(gt=0, decimal_places=2)
    currency: str

    @validator("currency")
    def currency_uppercase(cls, v):
        return v.upper()

    @validator("expense_date")
    def no_future_date(cls, v):
        if v > date.today():
            raise ValueError("Expense date cannot be in the future")
        return v

class ExpenseResponse(BaseModel):
    id: UUID
    title: str
    category: str
    amount: float
    currency: str
    converted_amount: float | None
    company_currency: str
    status: str
    current_step: int

    class Config:
        from_attributes = True