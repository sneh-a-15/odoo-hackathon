import { useEffect, useState, useRef, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import client from "../../api/client";
import { DataTable, Button, Badge, useToast } from "../../components/ui/UICore";

// ─── Constants ─────────────────────────────────────────────────────────────────

const DECISION_BADGE = {
  approved: "success",
  rejected: "error",
  pending:  "pending",
};

// ─── Zod schema (comment required only on rejection) ──────────────────────────

function buildSchema(decision) {
  return z.object({
    comment: decision === "rejected"
      ? z.string().min(10, "Rejection reason must be at least 10 characters")
      : z.string().optional(),
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(amount, currency = "USD") {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style:                 "currency",
    currency:              currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

// ─── Textarea field ────────────────────────────────────────────────────────────

function TextareaField({ label, error, helper, required, ...props }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {label && (
        <label style={styles.fieldLabel}>
          {label}
          {required && <span style={{ color: "#ef4444", marginLeft: 3 }}>*</span>}
        </label>
      )}
      <textarea
        rows={4}
        style={{
          ...styles.textarea,
          borderColor: error ? "#ef4444" : focused ? "#7c3aed" : "#2d3448",
        }}
        onFocus={() => setFocused(true)}
        onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
        {...props}
      />
      {error  && <span style={styles.fieldError}>⊙ {error}</span>}
      {helper && !error && <span style={styles.fieldHelper}>{helper}</span>}
    </div>
  );
}

// ─── Detail row (label + value pair inside drawer) ────────────────────────────

function DetailRow({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: "#64748b", textTransform: "uppercase" }}>
        {label}
      </span>
      <span style={{ fontSize: 14, color: "#f1f5f9", fontWeight: 500 }}>{children}</span>
    </div>
  );
}

// ─── Drawer ────────────────────────────────────────────────────────────────────

function Drawer({ expense, onClose, onDecision }) {
  const toast = useToast();
  const overlayRef = useRef(null);

  // Which button was last clicked drives the validation schema
  const [pendingDecision, setPendingDecision] = useState(null);
  const [submitting, setSubmitting]           = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(buildSchema(pendingDecision)),
    defaultValues: { comment: "" },
  });

  // Re-validate when decision changes
  useEffect(() => { reset({ comment: "" }); }, [pendingDecision, reset]);

  // Close on overlay click
  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose();
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const submit = useCallback(async (decision) => {
    // Trigger validation by submitting the form programmatically
    handleSubmit(async (data) => {
      setSubmitting(true);
      try {
        await client.post(`/api/v1/approvals/${expense.expense_id}/decide`, {
          decision,
          comment: data.comment || null,
        });
        toast.success(
          decision === "approved" ? "Expense approved ✓" : "Expense rejected",
          `"${expense.title}" has been ${decision}.`
        );
        onDecision(expense.expense_id);
        onClose();
      } catch (err) {
        toast.error("Decision failed", err.message);
      } finally {
        setSubmitting(false);
      }
    })();
  }, [expense, handleSubmit, onDecision, onClose, toast]);

  if (!expense) return null;

  const hasConversion =
    expense.converted_amount != null &&
    expense.converted_amount !== expense.amount;

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      style={styles.overlay}
    >
      {/* Drawer panel */}
      <div style={styles.drawer} role="dialog" aria-modal="true" aria-label="Review expense">

        {/* ── Drawer header ─────────────────────────────────────────────── */}
        <div style={styles.drawerHeader}>
          <div>
            <p style={styles.drawerEyebrow}>Expense Review</p>
            <h2 style={styles.drawerTitle}>{expense.title}</h2>
          </div>
          <button onClick={onClose} style={styles.closeBtn} aria-label="Close">×</button>
        </div>

        <div style={styles.drawerBody}>

          {/* ── Expense details ───────────────────────────────────────────── */}
          <section style={styles.detailsCard}>
            <p style={styles.sectionLabel}>Expense Details</p>
            <div style={styles.detailsGrid}>
              <DetailRow label="Submitted by">{expense.submitted_by ?? "—"}</DetailRow>
              <DetailRow label="Step progress">
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  Step {expense.current_step} of {expense.step_total}
                  <span style={{
                    display:        "inline-flex",
                    gap:            3,
                  }}>
                    {Array.from({ length: expense.step_total }).map((_, i) => (
                      <span
                        key={i}
                        style={{
                          width:        20,
                          height:       4,
                          borderRadius: 2,
                          background:   i < expense.current_step ? "#7c3aed" : "#2d3448",
                        }}
                      />
                    ))}
                  </span>
                </span>
              </DetailRow>
              <DetailRow label="Amount">
                <span style={{ fontSize: 20, fontWeight: 700, color: "#f1f5f9", letterSpacing: "-0.3px" }}>
                  {formatCurrency(expense.amount, expense.currency ?? "USD")}
                </span>
              </DetailRow>
              {hasConversion && (
                <DetailRow label="Converted (USD)">
                  <span style={{ color: "#a78bfa" }}>
                    {formatCurrency(expense.converted_amount, "USD")}
                  </span>
                </DetailRow>
              )}
              {expense.category && (
                <DetailRow label="Category">
                  <Badge variant="neutral">{expense.category}</Badge>
                </DetailRow>
              )}
              {expense.expense_date && (
                <DetailRow label="Date">
                  {new Date(expense.expense_date).toLocaleDateString("en-GB", {
                    day: "2-digit", month: "short", year: "numeric",
                  })}
                </DetailRow>
              )}
              {expense.description && (
                <div style={{ gridColumn: "1 / -1" }}>
                  <DetailRow label="Description">
                    <span style={{ color: "#94a3b8", lineHeight: 1.6, fontSize: 13 }}>
                      {expense.description}
                    </span>
                  </DetailRow>
                </div>
              )}
            </div>
          </section>

          {/* ── Decision form ─────────────────────────────────────────────── */}
          <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <p style={styles.sectionLabel}>Your Decision</p>

            <TextareaField
              label="Comment"
              placeholder={
                pendingDecision === "rejected"
                  ? "Required: explain the reason for rejection…"
                  : "Optional: add a note for the submitter…"
              }
              required={pendingDecision === "rejected"}
              error={errors.comment?.message}
              {...register("comment")}
            />

            {pendingDecision === "rejected" && (
              <div style={styles.rejectionWarning}>
                <span style={{ fontSize: 14 }}>⚠</span>
                A comment explaining the rejection is required and will be visible to the submitter.
              </div>
            )}

            {/* Action buttons */}
            <div style={styles.decisionButtons}>
              <Button
                variant="outline"
                style={{ flex: 1, justifyContent: "center", borderColor: "#ef4444", color: "#ef4444" }}
                loading={submitting && pendingDecision === "rejected"}
                disabled={submitting}
                onClick={() => { setPendingDecision("rejected"); setTimeout(() => submit("rejected"), 0); }}
              >
                ✕ Reject
              </Button>
              <Button
                style={{ flex: 1, justifyContent: "center", background: "#22c55e", color: "#fff" }}
                loading={submitting && pendingDecision === "approved"}
                disabled={submitting}
                onClick={() => { setPendingDecision("approved"); setTimeout(() => submit("approved"), 0); }}
              >
                ✓ Approve
              </Button>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function ApprovalQueue() {
  const toast = useToast();

  const [queue,            setQueue]            = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [selectedExpense,  setSelectedExpense]  = useState(null);

  // ── Fetch queue on mount ───────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    client.get("/api/v1/approvals/queue")
      .then((res) => { if (!cancelled) setQueue(res.data ?? []); })
      .catch((err) => toast.error("Failed to load queue", err.message))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // ── Optimistic removal after decision ─────────────────────────────────────
  const handleDecision = useCallback((expenseId) => {
    setQueue((prev) => prev.filter((e) => e.expense_id !== expenseId));
  }, []);

  // ── Table columns ──────────────────────────────────────────────────────────
  const columns = [
    {
      key:    "title",
      header: "Title",
      render: (v, row) => (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ color: "#f1f5f9", fontWeight: 600, fontSize: 14 }}>{v}</span>
          {row.category && (
            <span style={{ color: "#64748b", fontSize: 12 }}>{row.category}</span>
          )}
        </div>
      ),
    },
    {
      key:    "submitted_by",
      header: "Submitted By",
      render: (v) => (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            width:          28,
            height:         28,
            borderRadius:   "50%",
            background:     "rgba(124,58,237,0.2)",
            border:         "1px solid rgba(124,58,237,0.3)",
            display:        "inline-flex",
            alignItems:     "center",
            justifyContent: "center",
            fontSize:       11,
            fontWeight:     700,
            color:          "#a78bfa",
            flexShrink:     0,
          }}>
            {(v ?? "?")[0].toUpperCase()}
          </span>
          <span style={{ color: "#94a3b8", fontSize: 14 }}>{v ?? "—"}</span>
        </div>
      ),
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
              ≈ {formatCurrency(row.converted_amount, "USD")} USD
            </span>
          )}
        </div>
      ),
    },
    {
      key:    "current_step",
      header: "Step Progress",
      render: (v, row) => (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ color: "#94a3b8", fontSize: 13 }}>
            Step {v} of {row.step_total}
          </span>
          <div style={{ display: "flex", gap: 3 }}>
            {Array.from({ length: row.step_total ?? 1 }).map((_, i) => (
              <div
                key={i}
                style={{
                  width:        24,
                  height:       4,
                  borderRadius: 2,
                  background:   i < v ? "#7c3aed" : "#2d3448",
                  transition:   "background 0.2s",
                }}
              />
            ))}
          </div>
        </div>
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
          onClick={(e) => { e.stopPropagation(); setSelectedExpense(row); }}
        >
          Review →
        </Button>
      ),
    },
  ];

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      <div style={styles.page}>

        {/* ── Page header ──────────────────────────────────────────────────── */}
        <div style={styles.pageHeader}>
          <div>
            <h1 style={styles.pageTitle}>Approval Queue</h1>
            <p style={styles.pageSubtitle}>
              Review and action pending expense submissions assigned to you.
            </p>
          </div>
          <div style={styles.queueBadge}>
            <span style={{
              width:        8,
              height:       8,
              borderRadius: "50%",
              background:   queue.length > 0 ? "#f59e0b" : "#22c55e",
              display:      "inline-block",
            }} />
            {loading ? "Loading…" : queue.length === 0 ? "All clear" : `${queue.length} pending`}
          </div>
        </div>

        {/* ── Empty state ───────────────────────────────────────────────────── */}
        {!loading && queue.length === 0 && (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>✓</div>
            <p style={styles.emptyTitle}>Queue is clear</p>
            <p style={styles.emptySubtitle}>
              No expenses are pending your approval right now. Check back later.
            </p>
          </div>
        )}

        {/* ── Queue table ───────────────────────────────────────────────────── */}
        {(loading || queue.length > 0) && (
          <DataTable
            columns={columns}
            data={queue}
            loading={loading}
            emptyMessage="No pending approvals."
            onRowClick={(row) => setSelectedExpense(row)}
          />
        )}

      </div>

      {/* ── Drawer ───────────────────────────────────────────────────────────── */}
      {selectedExpense && (
        <Drawer
          expense={selectedExpense}
          onClose={() => setSelectedExpense(null)}
          onDecision={handleDecision}
        />
      )}
    </>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = {
  page: {
    minHeight:     "100vh",
    background:    "#0d1117",
    padding:       "40px 32px",
    fontFamily:    "sans-serif",
    maxWidth:      1000,
    margin:        "0 auto",
    display:       "flex",
    flexDirection: "column",
    gap:           28,
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
  queueBadge: {
    display:     "inline-flex",
    alignItems:  "center",
    gap:         7,
    background:  "rgba(100,116,139,0.12)",
    color:       "#94a3b8",
    borderRadius: 20,
    padding:     "5px 14px",
    fontSize:    13,
    fontWeight:  500,
    whiteSpace:  "nowrap",
  },
  emptyState: {
    display:        "flex",
    flexDirection:  "column",
    alignItems:     "center",
    justifyContent: "center",
    gap:            12,
    padding:        "64px 32px",
    background:     "#151924",
    border:         "1px solid #1e2330",
    borderRadius:   10,
    textAlign:      "center",
  },
  emptyIcon: {
    width:          52,
    height:         52,
    borderRadius:   "50%",
    background:     "rgba(34,197,94,0.12)",
    border:         "1px solid rgba(34,197,94,0.25)",
    color:          "#22c55e",
    fontSize:       22,
    display:        "flex",
    alignItems:     "center",
    justifyContent: "center",
    fontWeight:     700,
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
    maxWidth: 340,
  },

  // ── Drawer ──────────────────────────────────────────────────────────────────
  overlay: {
    position:        "fixed",
    inset:           0,
    background:      "rgba(0,0,0,0.6)",
    backdropFilter:  "blur(2px)",
    zIndex:          1000,
    display:         "flex",
    justifyContent:  "flex-end",
  },
  drawer: {
    width:          "min(520px, 95vw)",
    height:         "100%",
    background:     "#151924",
    borderLeft:     "1px solid #1e2330",
    boxShadow:      "-8px 0 40px rgba(0,0,0,0.5)",
    display:        "flex",
    flexDirection:  "column",
    overflowY:      "auto",
    animation:      "slideInRight 0.22s ease",
  },
  drawerHeader: {
    display:        "flex",
    justifyContent: "space-between",
    alignItems:     "flex-start",
    padding:        "24px 24px 20px",
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
    fontSize:      18,
    fontWeight:    700,
    color:         "#f1f5f9",
    letterSpacing: "-0.2px",
    maxWidth:      360,
  },
  closeBtn: {
    background:   "#1e2330",
    border:       "none",
    borderRadius: 6,
    color:        "#94a3b8",
    cursor:       "pointer",
    width:        32,
    height:       32,
    fontSize:     20,
    lineHeight:   "1",
    display:      "flex",
    alignItems:   "center",
    justifyContent: "center",
    flexShrink:   0,
  },
  drawerBody: {
    padding:       "24px",
    display:       "flex",
    flexDirection: "column",
    gap:           24,
    flex:          1,
  },
  detailsCard: {
    background:   "#0f1117",
    border:       "1px solid #1e2330",
    borderRadius: 8,
    padding:      "16px 18px 20px",
  },
  detailsGrid: {
    display:             "grid",
    gridTemplateColumns: "1fr 1fr",
    gap:                 "16px 24px",
    marginTop:           14,
  },
  sectionLabel: {
    margin:        0,
    fontSize:      11,
    fontWeight:    600,
    letterSpacing: "0.08em",
    color:         "#64748b",
    textTransform: "uppercase",
  },
  rejectionWarning: {
    display:      "flex",
    alignItems:   "flex-start",
    gap:          10,
    background:   "rgba(239,68,68,0.07)",
    border:       "1px solid rgba(239,68,68,0.2)",
    borderRadius: 8,
    padding:      "10px 14px",
    fontSize:     13,
    color:        "#fca5a5",
    lineHeight:   1.5,
  },
  decisionButtons: {
    display: "flex",
    gap:     12,
  },

  // ── Form elements ───────────────────────────────────────────────────────────
  fieldLabel: {
    fontSize:      11,
    fontWeight:    600,
    letterSpacing: "0.08em",
    color:         "#94a3b8",
    textTransform: "uppercase",
  },
  textarea: {
    width:       "100%",
    boxSizing:   "border-box",
    background:  "#0f1117",
    border:      "1px solid #2d3448",
    borderRadius: 6,
    padding:     "10px 14px",
    color:       "#f1f5f9",
    fontSize:    14,
    outline:     "none",
    resize:      "vertical",
    fontFamily:  "sans-serif",
    lineHeight:  1.5,
    transition:  "border-color 0.15s",
  },
  fieldError: {
    color:      "#ef4444",
    fontSize:   12,
    display:    "flex",
    alignItems: "center",
    gap:        4,
  },
  fieldHelper: {
    color:    "#64748b",
    fontSize: 12,
  },
};

// ─── Inject drawer animation ───────────────────────────────────────────────────

const styleTag = document.createElement("style");
styleTag.textContent = `
  @keyframes slideInRight {
    from { opacity: 0; transform: translateX(32px); }
    to   { opacity: 1; transform: translateX(0); }
  }
`;
document.head.appendChild(styleTag);
