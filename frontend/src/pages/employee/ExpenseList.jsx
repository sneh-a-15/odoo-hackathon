import { useEffect, useState, useCallback, useRef } from "react";

import client from "../../api/client";
import { DataTable, Badge, Button, useToast } from "../../components/ui/UICore";
import { useAuth } from "../../App";

// ─── Constants ─────────────────────────────────────────────────────────────────

const FILTERS = ["all", "pending", "approved", "rejected"];

const STATUS_BADGE = {
  approved: "success",
  rejected: "error",
  pending:  "pending",
  neutral:  "neutral",
};

const DECISION_COLOR = {
  approved: { bg: "rgba(34,197,94,0.1)",  border: "rgba(34,197,94,0.25)",  text: "#22c55e",  icon: "✓" },
  rejected: { bg: "rgba(239,68,68,0.1)",  border: "rgba(239,68,68,0.25)",  text: "#ef4444",  icon: "✕" },
  pending:  { bg: "rgba(139,92,246,0.1)", border: "rgba(139,92,246,0.25)", text: "#a78bfa",  icon: "…" },
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day:   "2-digit",
    year:  "numeric",
  });
}

function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }) +
    " · " +
    d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function formatCurrency(amount, currency = "USD") {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style:                 "currency",
    currency:              currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

// ─── Filter tab strip ──────────────────────────────────────────────────────────

function FilterTabs({ active, counts, onChange }) {
  return (
    <div style={styles.filterBar}>
      {FILTERS.map((f) => {
        const isActive = active === f;
        return (
          <button
            key={f}
            onClick={() => onChange(f)}
            style={{
              ...styles.filterTab,
              background:   isActive ? "rgba(124,58,237,0.15)" : "transparent",
              color:        isActive ? "#c4b5fd" : "#64748b",
              borderColor:  isActive ? "rgba(124,58,237,0.4)" : "transparent",
            }}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {counts[f] != null && (
              <span style={{
                ...styles.filterCount,
                background: isActive ? "rgba(124,58,237,0.25)" : "#1e2330",
                color:      isActive ? "#c4b5fd" : "#4b5563",
              }}>
                {counts[f]}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Timeline item ─────────────────────────────────────────────────────────────

function TimelineItem({ item, isLast }) {
  const dec = DECISION_COLOR[item.decision] ?? DECISION_COLOR.pending;
  return (
    <div style={{ display: "flex", gap: 14, position: "relative" }}>

      {/* Connector line */}
      {!isLast && (
        <div style={{
          position:   "absolute",
          left:       15,
          top:        32,
          width:      2,
          bottom:     -16,
          background: "#1e2330",
        }} />
      )}

      {/* Step icon */}
      <div style={{
        width:          30,
        height:         30,
        borderRadius:   "50%",
        background:     dec.bg,
        border:         `1px solid ${dec.border}`,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        fontSize:       13,
        fontWeight:     700,
        color:          dec.text,
        flexShrink:     0,
        zIndex:         1,
      }}>
        {dec.icon}
      </div>

      {/* Content */}
      <div style={{ paddingBottom: isLast ? 0 : 20, flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>
              Step {item.step_order ?? "—"}
            </span>
            <Badge variant={STATUS_BADGE[item.decision] ?? "neutral"}>
              {item.decision ?? "pending"}
            </Badge>
          </div>
          <span style={{ fontSize: 11, color: "#4b5563", whiteSpace: "nowrap" }}>
            {formatDateTime(item.decided_at ?? item.created_at)}
          </span>
        </div>

        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#94a3b8" }}>
          <span style={{ color: "#64748b" }}>by </span>
          <span style={{ color: "#c4b5fd", fontWeight: 500 }}>{item.decided_by_name ?? item.decided_by ?? "Approver"}</span>
        </p>

        <div style={{
          marginTop:    8,
          padding:      "10px 12px",
          background:   "rgba(15,17,23,0.8)",
          border:       "1px solid #1e2330",
          borderRadius: 6,
          fontSize:     13,
          color:        item.comment ? "#94a3b8" : "#334155",
          lineHeight:   1.6,
          fontStyle:    item.comment ? "italic" : "normal",
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "#334155", display: "block", marginBottom: 4 }}>
            Comment
          </span>
          {item.comment ? `"${item.comment}"` : "None"}
        </div>
      </div>
    </div>
  );
}

// ─── Detail Drawer ─────────────────────────────────────────────────────────────

function DetailDrawer({ expense, history, historyLoading, onClose }) {
  const overlayRef = useRef(null);

  // Close on overlay backdrop click
  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose();
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const hasConversion =
    expense.converted_amount != null &&
    expense.converted_amount !== expense.amount;

  const completedSteps = history.filter((h) => h.decision).length;
  const totalSteps     = expense.step_total ?? history.length ?? 1;

  return (
    <div ref={overlayRef} onClick={handleOverlayClick} style={styles.overlay}>
      <div style={styles.drawer} role="dialog" aria-modal="true">

        {/* ── Drawer header ──────────────────────────────────────────────── */}
        <div style={styles.drawerHeader}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={styles.drawerEyebrow}>Expense Detail</p>
            <h2 style={styles.drawerTitle}>{expense.title}</h2>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 20, fontWeight: 700, color: "#f1f5f9", letterSpacing: "-0.3px" }}>
                {formatCurrency(expense.amount, expense.currency ?? "USD")}
              </span>
              {hasConversion && (
                <span style={{ fontSize: 13, color: "#64748b" }}>
                  ≈ {formatCurrency(expense.converted_amount, expense.company_currency || "USD")} {expense.company_currency || "USD"}
                </span>
              )}
              <Badge variant={STATUS_BADGE[expense.status] ?? "neutral"}>
                {expense.status ?? "pending"}
              </Badge>
            </div>
          </div>
          <button onClick={onClose} style={styles.closeBtn} aria-label="Close">×</button>
        </div>

        <div style={styles.drawerBody}>

          {/* ── Expense metadata ───────────────────────────────────────────── */}
          <section style={styles.metaCard}>
            <div style={styles.metaGrid}>
              <div style={styles.metaItem}>
                <span style={styles.metaLabel}>Date</span>
                <span style={styles.metaValue}>{formatDate(expense.expense_date)}</span>
              </div>
              <div style={styles.metaItem}>
                <span style={styles.metaLabel}>Category</span>
                <span style={styles.metaValue}>{expense.category ?? "—"}</span>
              </div>
              <div style={styles.metaItem}>
                <span style={styles.metaLabel}>Submitted</span>
                <span style={styles.metaValue}>{formatDate(expense.created_at)}</span>
              </div>
              <div style={styles.metaItem}>
                <span style={styles.metaLabel}>Step progress</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                  <span style={{ fontSize: 13, color: "#f1f5f9", fontWeight: 500 }}>
                    {completedSteps} of {totalSteps}
                  </span>
                  <div style={{ display: "flex", gap: 3 }}>
                    {Array.from({ length: totalSteps }).map((_, i) => (
                      <div key={i} style={{
                        width:        20,
                        height:       4,
                        borderRadius: 2,
                        background:   i < completedSteps ? "#7c3aed" : "#2d3448",
                      }} />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {expense.description && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #1e2330" }}>
                <span style={styles.metaLabel}>Description</span>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "#94a3b8", lineHeight: 1.6 }}>
                  {expense.description}
                </p>
              </div>
            )}
          </section>

          {/* ── Approval timeline ──────────────────────────────────────────── */}
          <section>
            <p style={{ ...styles.sectionLabel, marginBottom: 18 }}>Approval Timeline</p>

            {historyLoading && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {[1, 2].map((i) => (
                  <div key={i} style={{ display: "flex", gap: 14 }}>
                    <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#1e2330" }} />
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ height: 12, width: "40%", borderRadius: 4, background: "#1e2330" }} />
                      <div style={{ height: 10, width: "60%", borderRadius: 4, background: "#1e2330" }} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!historyLoading && history.length === 0 && (
              <div style={styles.timelineEmpty}>
                <span style={{ fontSize: 20 }}>⏳</span>
                <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>
                  No approval actions yet. This expense is awaiting review.
                </p>
              </div>
            )}

            {!historyLoading && history.length > 0 && (
              <div>
                {history.map((item, idx) => (
                  <TimelineItem
                    key={item.id ?? idx}
                    item={item}
                    isLast={idx === history.length - 1}
                  />
                ))}
              </div>
            )}
          </section>

        </div>

        {/* ── Drawer footer ──────────────────────────────────────────────── */}
        <div style={styles.drawerFooter}>
          <Button variant="outline" onClick={onClose} style={{ width: "100%", justifyContent: "center" }}>
            Close
          </Button>
        </div>

      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function ExpenseList() {
  const toast = useToast();
  const { user } = useAuth();
  
  const isAdminOrManager = user?.role === "admin" || user?.role === "manager";

  const [expenses,        setExpenses]        = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [activeFilter,    setActiveFilter]    = useState("all");
  const [selectedExpense, setSelectedExpense] = useState(null);
  const [history,         setHistory]         = useState([]);
  const [historyLoading,  setHistoryLoading]  = useState(false);

  // ── Fetch expense list on mount ───────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    client.get("/api/v1/expenses")
      .then((res) => { if (!cancelled) setExpenses(res.data?.items ?? []); })
      .catch((err) => toast.error("Failed to load expenses", err.message))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // ── Fetch history when an expense is selected ─────────────────────────────
  const openExpense = useCallback(async (expense) => {
    setSelectedExpense(expense);
    setHistory([]);
    setHistoryLoading(true);
    try {
      const res = await client.get(`/api/v1/approvals/${expense.id}/history`);
      setHistory(res.data ?? []);
    } catch (err) {
      toast.error("Could not load timeline", err.message);
    } finally {
      setHistoryLoading(false);
    }
  }, [toast]);

  const closeDrawer = useCallback(() => {
    setSelectedExpense(null);
    setHistory([]);
  }, []);

  // ── Filtered dataset ──────────────────────────────────────────────────────
  const filtered = activeFilter === "all"
    ? expenses
    : expenses.filter((e) => e.status === activeFilter);

  // ── Filter counts ─────────────────────────────────────────────────────────
  const counts = FILTERS.reduce((acc, f) => {
    acc[f] = f === "all"
      ? expenses.length
      : expenses.filter((e) => e.status === f).length;
    return acc;
  }, {});

  // ── Table columns ─────────────────────────────────────────────────────────
  const columns = [
    {
      key:    "expense_date",
      header: "Date",
      render: (v) => (
        <span style={{ color: "#94a3b8", fontSize: 13, whiteSpace: "nowrap" }}>
          {formatDate(v)}
        </span>
      ),
    },
    {
      key:    "title",
      header: "Details",
      render: (v, row) => (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ color: "#f1f5f9", fontWeight: 600, fontSize: 14 }}>{v}</span>
          {row.category && (
            <span style={{ color: "#64748b", fontSize: 12 }}>{row.category}</span>
          )}
        </div>
      ),
    },
    {
      key:    "submitted_by_name",
      header: "Submitted By",
      render: (v) => <span style={{ color: "#f1f5f9", fontSize: 13 }}>{v || "—"}</span>,
    },
    {
      key:    "approved_by_names",
      header: "Actioned By",
      render: (v) => <span style={{ color: "#f1f5f9", fontSize: 13 }}>{v && v !== "None" ? v : "—"}</span>,
    },
    {
      key:    "amount",
      header: "Amount",
      render: (v, row) => (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ color: "#f1f5f9", fontWeight: 600, fontSize: 14 }}>
            {formatCurrency(v, row.currency ?? "USD")}
          </span>
          {row.converted_amount != null && row.converted_amount !== v && (
            <span style={{ color: "#64748b", fontSize: 12 }}>
              ≈ {formatCurrency(row.converted_amount, row.company_currency || "USD")} {row.company_currency || "USD"}
            </span>
          )}
        </div>
      ),
    },
    {
      key:    "status",
      header: "Status",
      render: (v) => (
        <Badge variant={STATUS_BADGE[v] ?? "neutral"}>
          {v ?? "pending"}
        </Badge>
      ),
    },
    {
      key:    "_actions",
      header: "",
      align:  "right",
      render: (_, row) => (
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => { e.stopPropagation(); openExpense(row); }}
        >
          View details →
        </Button>
      ),
    },
  ];

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <div style={styles.page}>

        {/* ── Page header ────────────────────────────────────────────────── */}
        <div style={styles.pageHeader}>
          <div>
            <h1 style={styles.pageTitle}>{isAdminOrManager ? "All Company Expenses" : "My Expenses"}</h1>
            <p style={styles.pageSubtitle}>
              {isAdminOrManager 
                ? "Track and review all expense claims submitted across the company."
                : "Track the status of your submitted expense claims and view their approval history."}
            </p>
          </div>
          <div style={styles.summaryPill}>
            <span style={{ ...styles.summaryDot, background: "#7c3aed" }} />
            {loading ? "Loading…" : `${expenses.length} total`}
          </div>
        </div>

        {/* ── Filter tabs ────────────────────────────────────────────────── */}
        <FilterTabs active={activeFilter} counts={counts} onChange={setActiveFilter} />

        {/* ── Empty state ────────────────────────────────────────────────── */}
        {!loading && filtered.length === 0 && (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>📋</div>
            <p style={styles.emptyTitle}>
              {activeFilter === "all" ? "No expenses yet" : `No ${activeFilter} expenses`}
            </p>
            <p style={styles.emptySubtitle}>
              {activeFilter === "all"
                ? "Submit your first expense to get started."
                : `You have no ${activeFilter} expenses to display.`}
            </p>
          </div>
        )}

        {/* ── Expense table ──────────────────────────────────────────────── */}
        {(loading || filtered.length > 0) && (
          <DataTable
            columns={columns}
            data={filtered}
            loading={loading}
            emptyMessage="No expenses match this filter."
            onRowClick={openExpense}
          />
        )}

      </div>

      {/* ── Detail drawer ──────────────────────────────────────────────────── */}
      {selectedExpense && (
        <DetailDrawer
          expense={selectedExpense}
          history={history}
          historyLoading={historyLoading}
          onClose={closeDrawer}
        />
      )}
    </>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = {
  // Page layout
  page: {
    minHeight:     "100%",
    background:    "#0d1117",
    padding:       "40px 32px",
    fontFamily:    "sans-serif",
    maxWidth:      1040,
    margin:        "0 auto",
    display:       "flex",
    flexDirection: "column",
    gap:           24,
  },
  pageHeader: {
    display:        "flex",
    alignItems:     "flex-start",
    justifyContent: "space-between",
    gap:            16,
  },
  pageTitle: {
    margin:        0,
    fontSize:      26,
    fontWeight:    700,
    color:         "#f1f5f9",
    letterSpacing: "-0.3px",
  },
  pageSubtitle: {
    margin:   "6px 0 0",
    fontSize: 13,
    color:    "#64748b",
  },
  summaryPill: {
    display:      "inline-flex",
    alignItems:   "center",
    gap:          7,
    background:   "rgba(100,116,139,0.12)",
    color:        "#94a3b8",
    borderRadius: 20,
    padding:      "5px 14px",
    fontSize:     13,
    fontWeight:   500,
    whiteSpace:   "nowrap",
  },
  summaryDot: {
    width:        8,
    height:       8,
    borderRadius: "50%",
    display:      "inline-block",
  },

  // Filter tabs
  filterBar: {
    display:      "flex",
    gap:          4,
    background:   "#151924",
    border:       "1px solid #1e2330",
    borderRadius: 8,
    padding:      4,
    alignSelf:    "flex-start",
  },
  filterTab: {
    display:      "inline-flex",
    alignItems:   "center",
    gap:          7,
    padding:      "6px 14px",
    borderRadius: 6,
    border:       "1px solid transparent",
    fontSize:     13,
    fontWeight:   500,
    cursor:       "pointer",
    transition:   "background 0.15s, color 0.15s, border-color 0.15s",
    fontFamily:   "sans-serif",
    whiteSpace:   "nowrap",
  },
  filterCount: {
    borderRadius: 20,
    padding:      "1px 7px",
    fontSize:     11,
    fontWeight:   600,
  },

  // Empty state
  emptyState: {
    display:        "flex",
    flexDirection:  "column",
    alignItems:     "center",
    justifyContent: "center",
    gap:            10,
    padding:        "56px 32px",
    background:     "#151924",
    border:         "1px solid #1e2330",
    borderRadius:   10,
    textAlign:      "center",
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 4,
  },
  emptyTitle: {
    margin:     0,
    fontSize:   16,
    fontWeight: 600,
    color:      "#f1f5f9",
  },
  emptySubtitle: {
    margin:   0,
    fontSize: 13,
    color:    "#64748b",
    maxWidth: 320,
  },

  // Drawer overlay
  overlay: {
    position:       "fixed",
    inset:          0,
    background:     "rgba(0,0,0,0.6)",
    backdropFilter: "blur(2px)",
    zIndex:         1000,
    display:        "flex",
    justifyContent: "flex-end",
  },
  drawer: {
    width:         "min(540px, 96vw)",
    height:        "100%",
    background:    "#151924",
    borderLeft:    "1px solid #1e2330",
    boxShadow:     "-8px 0 40px rgba(0,0,0,0.5)",
    display:       "flex",
    flexDirection: "column",
    animation:     "slideInRight 0.22s ease",
  },
  drawerHeader: {
    display:        "flex",
    justifyContent: "space-between",
    alignItems:     "flex-start",
    gap:            12,
    padding:        "22px 24px 18px",
    borderBottom:   "1px solid #1e2330",
    position:       "sticky",
    top:            0,
    background:     "#151924",
    zIndex:         1,
  },
  drawerEyebrow: {
    margin:        0,
    fontSize:      11,
    fontWeight:    600,
    letterSpacing: "0.08em",
    color:         "#64748b",
    textTransform: "uppercase",
    marginBottom:  4,
  },
  drawerTitle: {
    margin:        0,
    fontSize:      17,
    fontWeight:    700,
    color:         "#f1f5f9",
    letterSpacing: "-0.2px",
    lineHeight:    1.3,
  },
  closeBtn: {
    background:     "#1e2330",
    border:         "none",
    borderRadius:   6,
    color:          "#94a3b8",
    cursor:         "pointer",
    width:          32,
    height:         32,
    fontSize:       20,
    display:        "flex",
    alignItems:     "center",
    justifyContent: "center",
    flexShrink:     0,
    lineHeight:     1,
  },
  drawerBody: {
    padding:       "22px 24px",
    display:       "flex",
    flexDirection: "column",
    gap:           24,
    flex:          1,
    overflowY:     "auto",
  },
  drawerFooter: {
    padding:      "14px 24px",
    borderTop:    "1px solid #1e2330",
    background:   "#151924",
    position:     "sticky",
    bottom:       0,
  },

  // Metadata card inside drawer
  metaCard: {
    background:   "#0f1117",
    border:       "1px solid #1e2330",
    borderRadius: 8,
    padding:      "16px 18px",
  },
  metaGrid: {
    display:             "grid",
    gridTemplateColumns: "1fr 1fr",
    gap:                 "14px 20px",
  },
  metaItem: {
    display:       "flex",
    flexDirection: "column",
    gap:           3,
  },
  metaLabel: {
    fontSize:      11,
    fontWeight:    600,
    letterSpacing: "0.08em",
    color:         "#64748b",
    textTransform: "uppercase",
  },
  metaValue: {
    fontSize:   14,
    color:      "#f1f5f9",
    fontWeight: 500,
  },

  // Section label
  sectionLabel: {
    margin:        0,
    fontSize:      11,
    fontWeight:    600,
    letterSpacing: "0.08em",
    color:         "#64748b",
    textTransform: "uppercase",
  },

  // Timeline empty
  timelineEmpty: {
    display:      "flex",
    alignItems:   "center",
    gap:          12,
    background:   "#0f1117",
    border:       "1px solid #1e2330",
    borderRadius: 8,
    padding:      "16px 18px",
  },
};

// ─── Inject animation ──────────────────────────────────────────────────────────

const _style = document.createElement("style");
_style.textContent = `
  @keyframes slideInRight {
    from { opacity: 0; transform: translateX(28px); }
    to   { opacity: 1; transform: translateX(0); }
  }
`;
document.head.appendChild(_style);