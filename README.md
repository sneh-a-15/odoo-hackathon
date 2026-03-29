# Reimbursement & Expense Approval System

This project is a comprehensive Reimbursement and Expense Approval web application built for the Odoo Hackathon. It features a robust FastAPI backend connected to a PostgreSQL database and a responsive, modern frontend built with React, Vite, and TailwindCSS.

## 🚀 Tech Stack

### Backend
- **Framework:** [FastAPI](https://fastapi.tiangolo.com/)
- **ORM:** [SQLAlchemy](https://www.sqlalchemy.org/)
- **Migrations:** [Alembic](https://alembic.sqlalchemy.org/)
- **Database:** PostgreSQL
- **Authentication:** JWT (JSON Web Tokens) with passlib and python-jose
- **Validation:** Pydantic

### Frontend
- **Framework:** [React 19](https://react.dev/)
- **Build Tool:** [Vite](https://vitejs.dev/)
- **Styling:** [TailwindCSS v4](https://tailwindcss.com/)
- **Routing:** React Router v7
- **State Management:** [TanStack React Query](https://tanstack.com/query/latest)
- **Forms & Validation:** React Hook Form + Zod
- **HTTP Client:** Axios

## ✨ Key Features

- **Authentication & Authorization:** Secure user login and registration with JWT.
- **Role-based Access Control:** Different access levels for employees and managers.
- **Expense Management:** Submit, view, and manage reimbursement requests.
- **Approval Workflow:** Multi-level approval rules and dynamic routing for expense approvals.
- **Currency Support:** Handle different currencies for global expense tracking.

## 🛠️ Getting Started

Follow these instructions to get the project up and running on your local machine.

### Prerequisites
- Python 3.9+
- Node.js 18+
- PostgreSQL database

### 1. Backend Setup

Open a terminal and navigate to the backend directory:
```bash
cd backend
```

Create and activate a virtual environment:
```bash
# Windows
python -m venv venv
venv\Scripts\activate

# macOS/Linux
python3 -m venv venv
source venv/bin/activate
```

Install Python dependencies:
```bash
pip install -r requirements.txt
```

Create a `.env` file in the `backend` directory with your database constraints. Here is a generic example of what to include:
```env
DATABASE_URL=postgresql://user:password@localhost/dbname
SECRET_KEY=your_super_secret_jwt_key
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
```

Run database migrations to initialize tables:
```bash
alembic upgrade head
```

Start the FastAPI development server:
```bash
uvicorn main:app --reload
```
The API should now be running at `http://localhost:8000`. You can view the interactive API docs at `http://localhost:8000/docs`.

### 2. Frontend Setup

Open a new terminal and navigate to the frontend directory:
```bash
cd frontend
```

Install Node.js dependencies:
```bash
npm install
```

Start the Vite development server:
```bash
npm run dev
```
The frontend application should now be running at `http://localhost:5173`.

## 📂 Project Structure

```text
odoo-hackathon/
├── backend/            # FastAPI application
│   ├── alembic/        # Database migrations
│   ├── app/            # Main application package containing routes, models, schemas
│   ├── main.py         # Entry point for the backend
│   └── requirements.txt# Python dependencies
└── frontend/           # React frontend application
    ├── public/         # Static assets
    ├── src/            # React components, pages, and utilities
    ├── package.json    # Node.js dependencies
    └── vite.config.js  # Vite configuration
```