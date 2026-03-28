from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import users, items  # swap with your routes
from app.core.database import engine
from app.models import Base

Base.metadata.create_all(bind=engine)

app = FastAPI(title="HackApp", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users.router, prefix="/api/v1/users", tags=["users"])