from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import auth, users, currency, approval_rules, approvals, expenses

app = FastAPI(title="Reimbursement API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(currency.router, prefix="/api/v1")
app.include_router(approval_rules.router, prefix="/api/v1")
app.include_router(approvals.router, prefix="/api/v1")
app.include_router(expenses.router, prefix="/api/v1")