"""
Dashboard Analytics Endpoint
─────────────────────────────
GET /api/v1/dashboard/summary

Returns all dashboard KPIs in a SINGLE raw SQL query using CTEs + window
functions.  Zero Python loops — the database does all the aggregation.

Three CTEs:
  1. status_counts  — total / pending / approved / rejected counts + sums
  2. by_category    — spend grouped by expense category
  3. monthly_trend  — last 6 months of spend with row_number window function
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.models import User, Company

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def get_summary_sql(role: str) -> str:
    user_scope_filter = ""
    if role == "employee":
        user_scope_filter = "AND submitted_by = :uid"
    elif role == "manager":
        user_scope_filter = "AND submitted_by IN (SELECT id FROM users WHERE manager_id = :uid OR id = :uid)"

    return text(f"""
WITH
-- ─── CTE 0: Scoped Expenses ──────────────────────────────────────────
scoped_expenses AS (
    SELECT *
    FROM expenses
    WHERE company_id = :cid 
      AND deleted_at IS NULL
      {user_scope_filter}
),

-- ─── CTE 1: Status KPIs ──────────────────────────────────────────────
status_counts AS (
    SELECT
        COUNT(*)                                                   AS total_expenses,
        COUNT(*) FILTER (WHERE status = 'pending')                 AS pending_count,
        COUNT(*) FILTER (WHERE status = 'approved')                AS approved_count,
        COUNT(*) FILTER (WHERE status = 'rejected')                AS rejected_count,
        COALESCE(SUM(converted_amount), 0)                         AS total_spend,
        COALESCE(SUM(converted_amount) FILTER (WHERE status = 'approved'), 0)
                                                                   AS approved_spend,
        COALESCE(SUM(converted_amount) FILTER (WHERE status = 'pending'), 0)
                                                                   AS pending_spend,
        ROUND(
            CASE WHEN COUNT(*) > 0
                 THEN COUNT(*) FILTER (WHERE status = 'approved') * 100.0 / COUNT(*)
                 ELSE 0
            END, 1
        )                                                          AS approval_rate
    FROM scoped_expenses
),

-- ─── CTE 2: Spend by Category ────────────────────────────────────────
by_category AS (
    SELECT
        category                                                   AS cat,
        COUNT(*)                                                   AS cat_count,
        COALESCE(SUM(converted_amount), 0)                         AS cat_spend,
        ROUND(
            CASE WHEN (SELECT COALESCE(SUM(converted_amount), 1) FROM scoped_expenses) > 0
                 THEN SUM(converted_amount) * 100.0
                      / (SELECT COALESCE(SUM(converted_amount), 1) FROM scoped_expenses)
                 ELSE 0
            END, 1
        )                                                          AS cat_pct
    FROM scoped_expenses
    GROUP BY category
    ORDER BY cat_spend DESC
),

-- ─── CTE 3: Monthly Trend (last 6 months) ────────────────────────────
monthly_trend AS (
    SELECT
        TO_CHAR(DATE_TRUNC('month', expense_date), 'YYYY-MM')       AS month,
        TO_CHAR(DATE_TRUNC('month', expense_date), 'Mon YYYY')      AS month_label,
        COUNT(*)                                                    AS month_count,
        COALESCE(SUM(converted_amount), 0)                          AS month_spend,
        ROW_NUMBER() OVER (ORDER BY DATE_TRUNC('month', expense_date) DESC) AS rn
    FROM scoped_expenses
    WHERE expense_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months'
    GROUP BY DATE_TRUNC('month', expense_date)
    ORDER BY month ASC
),

-- ─── CTE 4: Top spenders ─────────────────────────────────────────────
top_spenders AS (
    SELECT
        u.full_name                                                AS spender_name,
        COUNT(e.id)                                                AS expense_count,
        COALESCE(SUM(e.converted_amount), 0)                       AS total_spent,
        ROW_NUMBER() OVER (ORDER BY SUM(e.converted_amount) DESC NULLS LAST) AS rn
    FROM scoped_expenses e
    JOIN users u ON u.id = e.submitted_by
    GROUP BY u.id, u.full_name
)

-- ─── Final SELECT: combine all CTEs into one JSON-like row ───────────
SELECT
    -- Status KPIs
    (SELECT total_expenses  FROM status_counts)  AS total_expenses,
    (SELECT pending_count   FROM status_counts)  AS pending_count,
    (SELECT approved_count  FROM status_counts)  AS approved_count,
    (SELECT rejected_count  FROM status_counts)  AS rejected_count,
    (SELECT total_spend     FROM status_counts)  AS total_spend,
    (SELECT approved_spend  FROM status_counts)  AS approved_spend,
    (SELECT pending_spend   FROM status_counts)  AS pending_spend,
    (SELECT approval_rate   FROM status_counts)  AS approval_rate,

    -- Category breakdown (aggregated as JSON array)
    (SELECT COALESCE(json_agg(json_build_object(
        'category',   cat,
        'count',      cat_count,
        'spend',      cat_spend,
        'percentage', cat_pct
    )), '[]'::json) FROM by_category)             AS category_breakdown,

    -- Monthly trend (aggregated as JSON array)
    (SELECT COALESCE(json_agg(json_build_object(
        'month',       month,
        'month_label', month_label,
        'count',       month_count,
        'spend',       month_spend
    ) ORDER BY month ASC), '[]'::json)
     FROM monthly_trend WHERE rn <= 6)            AS monthly_trend,

    -- Top spenders (aggregated as JSON array, top 5)
    (SELECT COALESCE(json_agg(json_build_object(
        'name',          spender_name,
        'expense_count', expense_count,
        'total_spent',   total_spent
    ) ORDER BY total_spent DESC), '[]'::json)
     FROM top_spenders WHERE rn <= 5)             AS top_spenders
""")


@router.get("/summary")
def get_dashboard_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Single-query dashboard analytics using CTEs.
    All aggregation is done in Postgres — zero Python loops.
    """
    
    role_str = current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role)
    sql = get_summary_sql(role_str)
    
    params = {"cid": current_user.company_id, "uid": current_user.id}
    row = db.execute(sql, params).mappings().first()
    
    company = db.query(Company).filter(Company.id == current_user.company_id).first()
    company_currency = company.default_currency if company else "USD"

    if not row or row["total_expenses"] is None or row["total_expenses"] == 0:
        # No data yet — return zeroed response
        return {
            "kpis": {
                "total_expenses": 0,
                "pending_count": 0,
                "approved_count": 0,
                "rejected_count": 0,
                "total_spend": 0,
                "approved_spend": 0,
                "pending_spend": 0,
                "approval_rate": 0,
            },
            "category_breakdown": [],
            "monthly_trend": [],
            "top_spenders": [],
            "company_currency": company_currency,
        }

    return {
        "kpis": {
            "total_expenses": row["total_expenses"],
            "pending_count":  row["pending_count"],
            "approved_count": row["approved_count"],
            "rejected_count": row["rejected_count"],
            "total_spend":    float(row["total_spend"]),
            "approved_spend": float(row["approved_spend"]),
            "pending_spend":  float(row["pending_spend"]),
            "approval_rate":  float(row["approval_rate"]),
        },
        "category_breakdown": row["category_breakdown"],
        "monthly_trend":      row["monthly_trend"],
        "top_spenders":       row["top_spenders"],
        "company_currency":   company_currency,
    }
