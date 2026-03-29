import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import client from "../api/client";
import { Button, Badge, DataTable, useToast } from "../components/ui/UICore";
import { useAuth } from "../App";

// ─── Status config ─────────────────────────────────────────────────────────────

const ROLE_BADGE = {
  approved: "success",
  rejected: "error",
  pending: "pending",
};

const STATUS_META = {
  pending: {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
    ),
    iconBg: "rgba(139,92,246,0.15)",
    iconColor: "#a78bfa",
    gradient: "linear-gradient(135deg, rgba(124,58,237,0.08) 0%, rgba(139,92,246,0.03) 100%)",
    border: "rgba(124,58,237,0.2)",
    accent: "#7c3aed",
    label: "Pending",
  },
  approved: {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    ),
    iconBg: "rgba(34,197,94,0.15)",
    iconColor: "#4ade80",
    gradient: "linear-gradient(135deg, rgba(34,197,94,0.08) 0%, rgba(16,185,129,0.03) 100%)",
    border: "rgba(34,197,94,0.2)",
    accent: "#22c55e",
    label: "Approved",
  },
  rejected: {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    ),
    iconBg: "rgba(239,68,68,0.15)",
    iconColor: "#f87171",
    gradient: "linear-gradient(135deg, rgba(239,68,68,0.08) 0%, rgba(220,38,38,0.03) 100%)",
    border: "rgba(239,68,68,0.2)",
    accent: "#ef4444",
    label: "Rejected",
  },
};

// ─── Category icon map ─────────────────────────────────────────────────────────

const CATEGORY_ICON = {
  travel:        "✈",
  meals:         "🍽",
  accommodation: "🏨",
  equipment:     "💻",
  other:         "📎",
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatAmount(amount, currency) {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: currency || "USD", minimumFractionDigits: 0,
  }).format(amount);
}

// ─── Skeleton loader ───────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div style={{ background: "#151924", border: "1px solid #1e2330", borderRadius: 14, padding: "20px 24px" }}>
      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
        <div className="skeleton" style={{ width: 48, height: 48, borderRadius: 12, flexShrink: 0 }} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="skeleton" style={{ height: 14, width: "55%" }} />
          <div className="skeleton" style={{ height: 11, width: "35%" }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
          <div className="skeleton" style={{ height: 14, width: 80 }} />
          <div className="skeleton" style={{ height: 22, width: 72, borderRadius: 20 }} />
        </div>
      </div>
    </div>
  );
}

function SkeletonStatCard() {
  return (
    <div style={{ background: "#151924", border: "1px solid #1e2330", borderRadius: 14, padding: "24px" }}>
      <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
        <div className="skeleton" style={{ width: 52, height: 52, borderRadius: 14, flexShrink: 0 }} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="skeleton" style={{ height: 11, width: "60%" }} />
          <div className="skeleton" style={{ height: 30, width: "35%" }} />
        </div>
      </div>
    </div>
  );
}

// ─── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ status, count, loading }) {
  const meta = STATUS_META[status];
  return (
    <div style={{
      background: meta.gradient,
      border: `1px solid ${meta.border}`,
      borderRadius: 14,
      padding: "22px 24px",
      display: "flex", alignItems: "center", gap: 18,
      transition: "transform 0.2s, box-shadow 0.2s",
      cursor: "default",
      boxShadow: "0 2px 16px rgba(0,0,0,0.2)",
    }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = `0 8px 28px rgba(0,0,0,0.28), 0 0 0 1px ${meta.border}`; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 2px 16px rgba(0,0,0,0.2)"; }}
    >
      {/* Icon box */}
      <div style={{
        width: 52, height: 52, borderRadius: 14, flexShrink: 0,
        background: meta.iconBg,
        color: meta.iconColor,
        display: "flex", alignItems: "center", justifyContent: "center",
        border: `1px solid ${meta.iconBg}`,
      }}>
        {meta.icon}
      </div>

      <div>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
          textTransform: "uppercase", color: "#475569", marginBottom: 6,
        }}>
          {meta.label} Claims
        </div>
        <div style={{
          fontSize: 30, fontWeight: 800, letterSpacing: "-1px",
          color: "#f1f5f9", lineHeight: 1,
        }}>
          {loading ? (
            <div className="skeleton" style={{ width: 48, height: 30, borderRadius: 6 }} />
          ) : count}
        </div>
      </div>

      {/* Subtle accent line */}
      <div style={{
        marginLeft: "auto", width: 3, height: 32, borderRadius: 2,
        background: `linear-gradient(to bottom, ${meta.accent}, transparent)`,
        opacity: 0.6, flexShrink: 0,
      }} />
    </div>
  );
}

// ─── Expense row ───────────────────────────────────────────────────────────────

function ExpenseRow({ expense, delay = 0 }) {
  const [hovered, setHovered] = useState(false);
  const catIcon = CATEGORY_ICON[expense.category] || "📎";
  const statusMeta = STATUS_META[expense.status] || STATUS_META.pending;

  return (
    <div
      className="dash-fade"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? "#1a2035" : "#151924",
        border: `1px solid ${hovered ? "#263048" : "#1e2330"}`,
        borderRadius: 12,
        padding: "16px 20px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        gap: 16,
        transition: "background 0.15s, border-color 0.15s",
        animationDelay: `${delay}ms`,
        cursor: "default",
      }}
    >
      {/* Left: Category icon + title + meta */}
      <div style={{ display: "flex", gap: 14, alignItems: "center", minWidth: 0 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 11, flexShrink: 0,
          background: statusMeta.iconBg,
          color: statusMeta.iconColor,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 19, border: `1px solid ${statusMeta.border}`,
        }}>
          {catIcon}
        </div>

        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 14, fontWeight: 600, color: "#e2e8f0",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            maxWidth: 260,
          }}>
            {expense.title}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            <span style={{ fontSize: 12, color: "#475569" }}>
              {formatDate(expense.expense_date)}
            </span>
            <span style={{ fontSize: 10, color: "#334155" }}>•</span>
            <span style={{ fontSize: 12, color: "#475569" }}>
              by{" "}
              <span style={{ color: "#94a3b8", fontWeight: 500 }}>
                {expense.submitted_by_name || "Unknown"}
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* Right: amount + actioned + badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 20, flexShrink: 0 }}>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9", letterSpacing: "-0.3px" }}>
            {formatAmount(expense.amount, expense.currency)}
          </div>
          {(expense.status === "approved" || expense.status === "rejected") && expense.approved_by_names && expense.approved_by_names !== "None" && (
            <div style={{ fontSize: 11, color: "#475569", marginTop: 3 }}>
              via{" "}
              <span style={{ color: "#64748b", fontWeight: 500 }}>
                {expense.approved_by_names}
              </span>
            </div>
          )}
        </div>

        <Badge variant={ROLE_BADGE[expense.status] || "neutral"}>
          <span style={{ textTransform: "capitalize", fontSize: 11 }}>{expense.status}</span>
        </Badge>
      </div>
    </div>
  );
}

// ─── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();

  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // Fetch expenses to calculate summary and show recent
    client.get("/api/v1/expenses")
      .then((res) => {
        if (!cancelled) {
          // Assuming res.data.items contains the list of expenses depending on the backend pagination structure
          const data = res.data.items || res.data || [];
          setExpenses(data);
        }
      })
      .catch((err) => toast.error("Failed to load dashboard data", err.message))
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [toast]);

  // Derived state for Admin summary cards
  const pendingCount  = expenses.filter(e => e.status === "pending").length;
  const approvedCount = expenses.filter(e => e.status === "approved").length;
  const rejectedCount = expenses.filter(e => e.status === "rejected").length;

  // Recent expenses (top 5)
  const recentExpenses = [...expenses]
    .sort((a, b) => new Date(b.expense_date) - new Date(a.expense_date))
    .slice(0, 5);

  // Greeting
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div style={styles.page} className="dash-fade">

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div style={styles.pageHeader}>
        <div>
          <p style={styles.eyebrow}>{greeting}</p>
          <h1 style={styles.pageTitle}>{user?.full_name?.split(" ")[0] || "Welcome"} </h1>
          <p style={styles.pageSubtitle}>
            Here's an overview of expense activity across your workspace.
          </p>
        </div>
        {user?.role === "admin" && (
          <button
            onClick={() => navigate("/admin/rules")}
            style={styles.ctaButton}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#6d28d9"; e.currentTarget.style.boxShadow = "0 6px 24px rgba(124,58,237,0.4)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "#7c3aed"; e.currentTarget.style.boxShadow = "0 4px 14px rgba(124,58,237,0.3)"; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93A10 10 0 0 0 4.93 19.07"/>
            </svg>
            Rules Builder
          </button>
        )}
      </div>

      {/* ── Summary Cards ────────────────────────────────────────────────────── */}
      <div style={styles.statsGrid}>
        {loading ? (
          <>
            <SkeletonStatCard />
            <SkeletonStatCard />
            <SkeletonStatCard />
          </>
        ) : (
          <>
            <StatCard status="pending"  count={pendingCount}  loading={loading} />
            <StatCard status="approved" count={approvedCount} loading={loading} />
            <StatCard status="rejected" count={rejectedCount} loading={loading} />
          </>
        )}
      </div>

      {/* ── Recent Expenses ──────────────────────────────────────────────────── */}
      <section>
        {/* Section header */}
        <div style={styles.sectionHeader}>
          <div>
            <h2 style={styles.sectionTitle}>Recent Expenses</h2>
            <p style={styles.sectionSubtitle}>Latest {Math.min(recentExpenses.length, 5)} submissions</p>
          </div>
          <button
            onClick={() => navigate("/expenses")}
            style={styles.viewAllBtn}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#c4b5fd"; e.currentTarget.style.borderColor = "rgba(124,58,237,0.4)"; e.currentTarget.style.background = "rgba(124,58,237,0.08)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "#7c3aed"; e.currentTarget.style.borderColor = "rgba(124,58,237,0.2)"; e.currentTarget.style.background = "transparent"; }}
          >
            View all →
          </button>
        </div>

        {/* Expense list / skeletons / empty */}
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[0, 1, 2].map((i) => <SkeletonCard key={i} />)}
          </div>
        ) : recentExpenses.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>📭</div>
            <div style={styles.emptyTitle}>No expenses yet</div>
            <div style={styles.emptySubtitle}>
              When expenses are submitted they will appear here.
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {recentExpenses.map((expense, i) => (
              <ExpenseRow key={expense.id} expense={expense} delay={i * 60} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = {
  page: {
    minHeight: "100%",
    padding: "0 0 48px",
    display: "flex",
    flexDirection: "column",
    gap: 36,
    maxWidth: 1080,
    margin: "0 auto",
    fontFamily: "'Inter', sans-serif",
  },

  // Header
  eyebrow: {
    margin: 0,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "#7c3aed",
    marginBottom: 6,
  },
  pageTitle: {
    margin: 0,
    fontSize: 28,
    fontWeight: 800,
    color: "#f1f5f9",
    letterSpacing: "-0.5px",
    lineHeight: 1.2,
  },
  pageSubtitle: {
    margin: "8px 0 0",
    fontSize: 14,
    color: "#475569",
    lineHeight: 1.5,
  },
  pageHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
  },
  ctaButton: {
    display: "inline-flex", alignItems: "center", gap: 7,
    padding: "9px 18px",
    background: "#7c3aed",
    border: "none",
    borderRadius: 8,
    color: "#fff",
    fontSize: 13, fontWeight: 600,
    cursor: "pointer",
    transition: "background 0.15s, box-shadow 0.15s",
    boxShadow: "0 4px 14px rgba(124,58,237,0.3)",
    whiteSpace: "nowrap",
  },

  // Stats
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 16,
  },

  // Section
  sectionHeader: {
    display: "flex", justifyContent: "space-between", alignItems: "flex-start",
    marginBottom: 16,
    flexWrap: "wrap",
    gap: 10,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 17,
    fontWeight: 700,
    color: "#e2e8f0",
    letterSpacing: "-0.2px",
  },
  sectionSubtitle: {
    margin: "3px 0 0",
    fontSize: 12,
    color: "#334155",
  },
  viewAllBtn: {
    background: "transparent",
    border: "1px solid rgba(124,58,237,0.2)",
    borderRadius: 7,
    color: "#7c3aed",
    fontSize: 12, fontWeight: 600,
    padding: "6px 14px",
    cursor: "pointer",
    transition: "all 0.15s",
  },

  // Empty state
  emptyState: {
    display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center",
    padding: "56px 32px",
    background: "#151924",
    border: "1px solid #1e2330",
    borderRadius: 14,
    textAlign: "center",
    gap: 10,
  },
  emptyIcon: { fontSize: 36 },
  emptyTitle: {
    fontSize: 15, fontWeight: 600, color: "#64748b",
  },
  emptySubtitle: {
    fontSize: 13, color: "#334155", maxWidth: 280,
  },
};
