import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import client from "../api/client";
import { Button, Badge, DataTable, useToast } from "../components/ui/UICore";
import { useAuth } from "../App";

const ROLE_BADGE = {
  approved: "success",
  rejected: "error",
  pending: "pending",
};

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
  const pendingCount = expenses.filter(e => e.status === "pending").length;
  const approvedCount = expenses.filter(e => e.status === "approved").length;
  const rejectedCount = expenses.filter(e => e.status === "rejected").length;

  // Recent expenses (top 5)
  const recentExpenses = [...expenses].sort((a, b) => new Date(b.expense_date) - new Date(a.expense_date)).slice(0, 5);

  // Columns removed since we are using cards now

  return (
    <div style={styles.page}>
      
      {/* Header */}
      <div style={styles.pageHeader}>
        <div>
          <h1 style={styles.pageTitle}>Dashboard</h1>
          <p style={styles.pageSubtitle}>
            Welcome back, {user?.full_name || "User"}. Here is an overview of recent activity.
          </p>
        </div>
        {user?.role === "admin" && (
          <Button variant="default" onClick={() => navigate("/admin/rules")}>
             Rules Builder 
          </Button>
        )}
      </div>

      {/* Summary Cards */}
      <div style={styles.grid}>
        <div style={styles.card}>
          <div style={styles.cardIconPending}>⌛</div>
          <div>
            <div style={styles.cardTitle}>Pending Claims</div>
            <div style={styles.cardValue}>{loading ? "—" : pendingCount}</div>
          </div>
        </div>

        <div style={styles.card}>
          <div style={styles.cardIconApproved}>✓</div>
          <div>
            <div style={styles.cardTitle}>Approved Claims</div>
            <div style={styles.cardValue}>{loading ? "—" : approvedCount}</div>
          </div>
        </div>

        <div style={styles.card}>
          <div style={styles.cardIconRejected}>✕</div>
          <div>
            <div style={styles.cardTitle}>Rejected Claims</div>
            <div style={styles.cardValue}>{loading ? "—" : rejectedCount}</div>
          </div>
        </div>
      </div>

      {/* Recent Expenses Cards */}
      <section>
        <div style={styles.tableHeader}>
           <p style={styles.sectionLabel}>Recent Expenses</p>
           <Button variant="ghost" onClick={() => navigate("/expenses")} style={{ padding: 0, color: "#7c3aed" }}>
              View all →
           </Button>
        </div>
        
        {loading ? (
          <p style={{ color: "#94a3b8" }}>Loading expenses...</p>
        ) : recentExpenses.length === 0 ? (
          <div style={{...styles.card, justifyContent: 'center', color: '#64748b', padding: '40px'}}>No expenses submitted yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {recentExpenses.map(expense => (
              <div key={expense.id} style={{
                background: "#151924", border: "1px solid #1e2330", borderRadius: 12, padding: "20px 24px",
                display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
                transition: "transform 0.2sease, border-color 0.2s", cursor: "default"
              }} onMouseOver={e => e.currentTarget.style.borderColor = '#2d3448'} onMouseOut={e => e.currentTarget.style.borderColor = '#1e2330'}>
                
                {/* Left side: Icon + Title + Meta */}
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(124,58,237,0.1)', color: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 20 }}>
                     {expense.category?.[0]?.toUpperCase() || "E"}
                  </div>
                  <div>
                    <div style={{ color: "#f1f5f9", fontWeight: 600, fontSize: 16 }}>{expense.title}</div>
                    <div style={{ color: "#94a3b8", fontSize: 13, marginTop: 4, display: 'flex', gap: '12px' }}>
                       <span>{expense.expense_date ? new Date(expense.expense_date).toLocaleDateString() : '—'}</span>
                       <span>•</span>
                       <span>Submitted by <strong style={{color:"#f1f5f9"}}>{expense.submitted_by_name || "Unknown"}</strong></span>
                    </div>
                  </div>
                </div>
                
                {/* Right side: Amount + Approver + Status */}
                <div style={{ display: 'flex', gap: '24px', alignItems: 'center', textAlign: 'right' }}>
                  <div>
                    <div style={{ color: "#f1f5f9", fontWeight: 700, fontSize: 16 }}>{expense.currency} {Number(expense.amount).toLocaleString()}</div>
                    <div style={{ color: "#94a3b8", fontSize: 13, marginTop: 4 }}>
                       {(expense.status === 'approved' || expense.status === 'rejected') && expense.approved_by_names !== "None" ? 
                         <span>Actioned by <strong style={{color:"#f1f5f9"}}>{expense.approved_by_names}</strong></span> : 
                         <span style={{ opacity: 0.5 }}>Processing rule...</span>
                       }
                    </div>
                  </div>
                  <div style={{ width: '90px', textAlign: 'right' }}>
                    <Badge variant={ROLE_BADGE[expense.status] || "neutral"}>
                      <span style={{ textTransform: 'capitalize' }}>{expense.status}</span>
                    </Badge>
                  </div>
                </div>

              </div>
            ))}
          </div>
        )}
      </section>

    </div>
  );
}

const styles = {
  page: {
    minHeight: "100%",
    padding: "0 0 40px",
    fontFamily: "sans-serif",
    maxWidth: 1100,
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: 32,
  },
  pageHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  pageTitle: {
    margin: 0,
    fontSize: 26,
    fontWeight: 700,
    color: "#f1f5f9",
    letterSpacing: "-0.3px",
  },
  pageSubtitle: {
    margin: "6px 0 0",
    fontSize: 14,
    color: "#64748b",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 20,
  },
  card: {
    background: "#151924",
    border: "1px solid #1e2330",
    borderRadius: 12,
    padding: "24px",
    display: "flex",
    alignItems: "center",
    gap: 20,
    boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
  },
  cardIconPending: {
    width: 48,
    height: 48,
    borderRadius: 12,
    background: "rgba(139,92,246,0.15)",
    color: "#c084fc",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 20,
  },
  cardIconApproved: {
    width: 48,
    height: 48,
    borderRadius: 12,
    background: "rgba(34,197,94,0.15)",
    color: "#4ade80",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 20,
  },
  cardIconRejected: {
    width: 48,
    height: 48,
    borderRadius: 12,
    background: "rgba(239,68,68,0.15)",
    color: "#f87171",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 20,
  },
  cardTitle: {
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: 6,
  },
  cardValue: {
    color: "#f1f5f9",
    fontSize: 28,
    fontWeight: 700,
    letterSpacing: "-0.5px",
  },
  tableSection: {
    background: "#151924",
    border: "1px solid #1e2330",
    borderRadius: 12,
    padding: "24px",
    boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
  },
  tableHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  sectionLabel: {
    margin: 0,
    fontSize: 16,
    fontWeight: 600,
    color: "#f1f5f9",
  },
};
