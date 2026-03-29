import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ResponsiveContainer,
  BarChart, Bar,
  AreaChart, Area,
  XAxis, YAxis,
  Tooltip, CartesianGrid,
  Cell,
} from "recharts";

import client from "../api/client";
import { Badge, useToast } from "../components/ui/UICore";
import { useAuth } from "../App";

// ─── Theme tokens ──────────────────────────────────────────────────────────────

const C = {
  page:       "#0d1117",
  card:       "#151924",
  cardAlt:    "#101520",
  border:     "#1e2330",
  borderHi:   "#263048",
  text:       "#f1f5f9",
  textMid:    "#94a3b8",
  textDim:    "#475569",
  textFaint:  "#334155",
  purple:     "#7c3aed",
  purpleHi:   "#a78bfa",
  purpleMid:  "rgba(124,58,237,0.15)",
  green:      "#22c55e",
  greenMid:   "rgba(34,197,94,0.15)",
  red:        "#ef4444",
  redMid:     "rgba(239,68,68,0.15)",
  amber:      "#f59e0b",
  amberMid:   "rgba(245,158,11,0.15)",
  gridLine:   "#1a2236",
  tooltip:    "#0f1623",
};

// ─── Category config ───────────────────────────────────────────────────────────

const CAT_CONFIG = {
  travel:        { color: "#7c3aed", icon: "✈" },
  meals:         { color: "#22c55e", icon: "🍽" },
  accommodation: { color: "#f59e0b", icon: "🏨" },
  equipment:     { color: "#3b82f6", icon: "💻" },
  other:         { color: "#64748b", icon: "📎" },
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmtCurrency(n, currency = "USD", compact = false) {
  if (n == null) return "—";
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency", currency, maximumFractionDigits: 0,
  });
  if (compact && n >= 1000) {
    const parts = formatter.formatToParts(0);
    const symbol = parts.find(p => p.type === 'currency')?.value || '$';
    return symbol + (n / 1000).toFixed(1) + "k";
  }
  return formatter.format(n);
}

function fmtPct(n) {
  if (n == null) return "—";
  return n.toFixed(1) + "%";
}

// ─── Skeleton pulse ────────────────────────────────────────────────────────────

function Sk({ w = "100%", h = 14, r = 6 }) {
  return (
    <div className="skeleton" style={{ width: w, height: h, borderRadius: r }} />
  );
}

// ─── Custom chart tooltip ──────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label, currency = "USD", suffix = "" }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: C.tooltip,
      border: `1px solid ${C.border}`,
      borderRadius: 8,
      padding: "10px 14px",
      fontSize: 13,
      boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
    }}>
      <div style={{ color: C.textMid, marginBottom: 6, fontWeight: 600 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, color: C.text }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.color, display: "inline-block" }} />
          <span style={{ color: C.textMid }}>{p.name}:</span>
          <span style={{ fontWeight: 700 }}>
            {typeof p.value === "number" ? fmtCurrency(p.value, currency) : p.value}{suffix}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── KPI pill card ─────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, accent, icon, loading }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: C.card,
        border: `1px solid ${hov ? C.borderHi : C.border}`,
        borderRadius: 14,
        padding: "20px 22px",
        display: "flex",
        alignItems: "center",
        gap: 16,
        transition: "border-color 0.15s, transform 0.15s, box-shadow 0.15s",
        transform: hov ? "translateY(-2px)" : "none",
        boxShadow: hov ? `0 8px 28px rgba(0,0,0,0.3), inset 0 0 0 1px ${accent}22` : "none",
        cursor: "default",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Glow orb */}
      <div style={{
        position: "absolute", top: -20, right: -20,
        width: 80, height: 80, borderRadius: "50%",
        background: accent,
        opacity: 0.06,
        pointerEvents: "none",
      }} />

      {/* Icon */}
      <div style={{
        width: 46, height: 46, borderRadius: 12, flexShrink: 0,
        background: `${accent}1a`,
        border: `1px solid ${accent}30`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 20,
      }}>
        {icon}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.textDim, marginBottom: 5 }}>
          {label}
        </div>
        {loading ? <Sk w="60%" h={28} r={6} /> : (
          <div style={{ fontSize: 26, fontWeight: 800, color: C.text, letterSpacing: "-0.8px", lineHeight: 1 }}>
            {value}
          </div>
        )}
        {sub && !loading && (
          <div style={{ fontSize: 12, color: C.textDim, marginTop: 4 }}>{sub}</div>
        )}
      </div>

      {/* Accent bar */}
      <div style={{
        width: 3, height: 36, borderRadius: 2, flexShrink: 0,
        background: `linear-gradient(to bottom, ${accent}, ${accent}00)`,
      }} />
    </div>
  );
}

// ─── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, subtitle, children, action }) {
  return (
    <section>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16, gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text, letterSpacing: "-0.2px" }}>{title}</h2>
          {subtitle && <p style={{ margin: "3px 0 0", fontSize: 12, color: C.textFaint }}>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

// ─── Chart card wrapper ────────────────────────────────────────────────────────

function ChartCard({ children, style }) {
  return (
    <div style={{
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 14,
      padding: "20px 20px 12px",
      ...style,
    }}>
      {children}
    </div>
  );
}

// ─── Category bar chart ────────────────────────────────────────────────────────

function CategoryBarChart({ data, loading, currency }) {
  if (loading) {
    return (
      <ChartCard>
        <Sk w="40%" h={13} r={4} />
        <div style={{ marginTop: 20, display: "flex", alignItems: "flex-end", gap: 12, height: 160 }}>
          {[70, 45, 90, 55, 35].map((h, i) => (
            <div key={i} className="skeleton" style={{ flex: 1, height: `${h}%`, borderRadius: "4px 4px 0 0" }} />
          ))}
        </div>
      </ChartCard>
    );
  }

  const chartData = data.map((d) => ({
    name: d.category.charAt(0).toUpperCase() + d.category.slice(1),
    spend: Math.round(d.spend),
    count: d.count,
    pct: d.percentage,
    _raw: d.category,
  }));

  return (
    <ChartCard>
      <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: C.textDim, marginBottom: 16 }}>
        Spend by Category
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData} barCategoryGap="28%" margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={C.gridLine} strokeDasharray="3 3" />
          <XAxis
            dataKey="name"
            tick={{ fill: C.textDim, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: C.textDim, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => fmtCurrency(v, currency, true)}
          />
          <Tooltip
            content={<ChartTooltip currency={currency} />}
            cursor={{ fill: "rgba(255,255,255,0.03)" }}
          />
          <Bar dataKey="spend" name="Spend" radius={[4, 4, 0, 0]} maxBarSize={52}>
            {chartData.map((entry) => (
              <Cell
                key={entry._raw}
                fill={CAT_CONFIG[entry._raw]?.color ?? C.purple}
                fillOpacity={0.85}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Legend pills */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 12px", marginTop: 12 }}>
        {chartData.map((d) => (
          <div key={d._raw} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: C.textDim }}>
            <span style={{
              width: 8, height: 8, borderRadius: 2, flexShrink: 0,
              background: CAT_CONFIG[d._raw]?.color ?? C.purple,
            }} />
            {d.name}
            <span style={{ color: C.textFaint }}>({fmtPct(d.pct)})</span>
          </div>
        ))}
      </div>
    </ChartCard>
  );
}

// ─── Monthly area chart ────────────────────────────────────────────────────────

function MonthlyTrendChart({ data, loading, currency }) {
  if (loading) {
    return (
      <ChartCard>
        <Sk w="45%" h={13} r={4} />
        <div className="skeleton" style={{ marginTop: 20, width: "100%", height: 160, borderRadius: 8 }} />
      </ChartCard>
    );
  }

  return (
    <ChartCard>
      <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: C.textDim, marginBottom: 16 }}>
        Monthly Spend Trend
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.purple} stopOpacity={0.4} />
              <stop offset="100%" stopColor={C.purple} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={C.gridLine} strokeDasharray="3 3" />
          <XAxis
            dataKey="month_label"
            tick={{ fill: C.textDim, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => v?.slice(0, 7) ?? v}
          />
          <YAxis
            tick={{ fill: C.textDim, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => fmtCurrency(v, currency, true)}
          />
          <Tooltip content={<ChartTooltip currency={currency} />} cursor={{ stroke: C.borderHi, strokeWidth: 1 }} />
          <Area
            type="monotone"
            dataKey="spend"
            name="Spend"
            stroke={C.purple}
            strokeWidth={2}
            fill="url(#spendGradient)"
            dot={{ fill: C.purple, r: 3, strokeWidth: 0 }}
            activeDot={{ fill: C.purpleHi, r: 5, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ─── Top spenders leaderboard ──────────────────────────────────────────────────

function TopSpenders({ data, loading, currency }) {
  const max = data.reduce((m, d) => Math.max(m, d.total_spent), 0);

  return (
    <ChartCard style={{ padding: "20px 20px" }}>
      <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: C.textDim, marginBottom: 16 }}>
        Top Spenders
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Sk w={32} h={32} r={999} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                <Sk w="50%" h={11} />
                <Sk w="100%" h={4} r={2} />
              </div>
              <Sk w={56} h={11} r={4} />
            </div>
          ))}
        </div>
      ) : data.length === 0 ? (
        <div style={{ color: C.textFaint, fontSize: 13, textAlign: "center", padding: "20px 0" }}>
          No data available
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {data.map((person, idx) => {
            const barPct = max > 0 ? (person.total_spent / max) * 100 : 0;
            const medals = ["🥇", "🥈", "🥉"];
            return (
              <div key={person.name} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {/* Rank / avatar */}
                <div style={{
                  width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                  background: idx < 3 ? `${C.purple}22` : C.cardAlt,
                  border: `1px solid ${idx < 3 ? `${C.purple}40` : C.border}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: idx < 3 ? 15 : 11, fontWeight: 700,
                  color: idx < 3 ? C.purpleHi : C.textMid,
                }}>
                  {idx < 3 ? medals[idx] : idx + 1}
                </div>

                {/* Name + bar */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, gap: 8 }}>
                    <span style={{
                      fontSize: 13, fontWeight: 600, color: C.text,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                      {person.name}
                    </span>
                    <span style={{ fontSize: 12, color: C.textDim, whiteSpace: "nowrap" }}>
                      {person.expense_count} claim{person.expense_count !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div style={{ height: 4, borderRadius: 2, background: C.border, overflow: "hidden" }}>
                    <div style={{
                      height: "100%", borderRadius: 2,
                      width: `${barPct}%`,
                      background: idx === 0
                        ? `linear-gradient(to right, ${C.purple}, ${C.purpleHi})`
                        : `${C.purple}70`,
                      transition: "width 0.6s ease",
                    }} />
                  </div>
                </div>

                {/* Amount */}
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text, whiteSpace: "nowrap", flexShrink: 0 }}>
                  {fmtCurrency(person.total_spent, currency)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ChartCard>
  );
}

// ─── Status breakdown pills ────────────────────────────────────────────────────

function StatusPills({ kpis, loading }) {
  if (loading) {
    return (
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton" style={{ height: 32, width: 120, borderRadius: 20 }} />
        ))}
      </div>
    );
  }

  const total = kpis.total_expenses || 1;
  const pills = [
    { label: "Pending",  count: kpis.pending_count,  pct: (kpis.pending_count / total) * 100,  color: C.amber,  bg: C.amberMid },
    { label: "Approved", count: kpis.approved_count, pct: (kpis.approved_count / total) * 100, color: C.green,  bg: C.greenMid },
    { label: "Rejected", count: kpis.rejected_count, pct: (kpis.rejected_count / total) * 100, color: C.red,    bg: C.redMid },
  ];

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {pills.map((p) => (
        <div key={p.label} style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          background: p.bg,
          border: `1px solid ${p.color}40`,
          borderRadius: 20,
          padding: "5px 14px 5px 10px",
          fontSize: 12,
        }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.color, flexShrink: 0 }} />
          <span style={{ fontWeight: 600, color: p.color }}>{p.label}</span>
          <span style={{ color: p.color, fontWeight: 800 }}>{p.count}</span>
          <span style={{
            background: `${p.color}20`, color: p.color,
            fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "1px 6px",
          }}>
            {fmtPct(p.pct)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Expense row (unchanged from original) ─────────────────────────────────────

const ROLE_BADGE = { approved: "success", rejected: "error", pending: "pending" };
const CATEGORY_ICON = { travel: "✈", meals: "🍽", accommodation: "🏨", equipment: "💻", other: "📎" };

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function formatAmount(amount, currency) {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD", minimumFractionDigits: 0 }).format(amount);
}

const STATUS_ICON_BG = { pending: "rgba(139,92,246,0.15)", approved: "rgba(34,197,94,0.15)", rejected: "rgba(239,68,68,0.15)" };
const STATUS_ICON_COLOR = { pending: "#a78bfa", approved: "#4ade80", rejected: "#f87171" };
const STATUS_BORDER = { pending: "rgba(124,58,237,0.2)", approved: "rgba(34,197,94,0.2)", rejected: "rgba(239,68,68,0.2)" };

function ExpenseRow({ expense }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? "#1a2035" : C.card,
        border: `1px solid ${hovered ? C.borderHi : C.border}`,
        borderRadius: 12, padding: "15px 18px",
        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14,
        transition: "background 0.15s, border-color 0.15s",
      }}
    >
      <div style={{ display: "flex", gap: 13, alignItems: "center", minWidth: 0 }}>
        <div style={{
          width: 42, height: 42, borderRadius: 10, flexShrink: 0,
          background: STATUS_ICON_BG[expense.status] ?? C.purpleMid,
          color: STATUS_ICON_COLOR[expense.status] ?? C.purpleHi,
          border: `1px solid ${STATUS_BORDER[expense.status] ?? "rgba(124,58,237,0.2)"}`,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
        }}>
          {CATEGORY_ICON[expense.category] || "📎"}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 240 }}>
            {expense.title}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
            <span style={{ fontSize: 11, color: C.textDim }}>{formatDate(expense.expense_date)}</span>
            <span style={{ fontSize: 9, color: C.textFaint }}>•</span>
            <span style={{ fontSize: 11, color: C.textDim }}>
              by <span style={{ color: C.textMid, fontWeight: 500 }}>{expense.submitted_by_name || "Unknown"}</span>
            </span>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{formatAmount(expense.amount, expense.currency)}</div>
          {(expense.status === "approved" || expense.status === "rejected") && expense.approved_by_names && expense.approved_by_names !== "None" && (
            <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>
              via <span style={{ color: "#64748b", fontWeight: 500 }}>{expense.approved_by_names}</span>
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

function SkeletonCard() {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "15px 18px" }}>
      <div style={{ display: "flex", gap: 13, alignItems: "center" }}>
        <div className="skeleton" style={{ width: 42, height: 42, borderRadius: 10, flexShrink: 0 }} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
          <Sk w="52%" h={13} />
          <Sk w="33%" h={10} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 7, alignItems: "flex-end" }}>
          <Sk w={72} h={13} />
          <Sk w={64} h={20} r={20} />
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate  = useNavigate();
  const toast     = useToast();
  const { user }  = useAuth();

  const [summary,  setSummary]  = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [expLoading, setExpLoading] = useState(true);

  // Fetch dashboard summary (analytics)
  useEffect(() => {
    let cancelled = false;
    client.get("/api/v1/dashboard/summary")
      .then((res) => { if (!cancelled) setSummary(res.data); })
      .catch((err) => toast.error("Analytics unavailable", err.message))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Fetch recent expenses for the activity feed
  useEffect(() => {
    let cancelled = false;
    client.get("/api/v1/expenses")
      .then((res) => {
        if (!cancelled) {
          const data = res.data?.items || res.data || [];
          setExpenses(
            [...data]
              .sort((a, b) => new Date(b.expense_date) - new Date(a.expense_date))
              .slice(0, 5)
          );
        }
      })
      .catch(() => {}) // non-critical
      .finally(() => { if (!cancelled) setExpLoading(false); });
    return () => { cancelled = true; };
  }, [user]);

  const kpis     = summary?.kpis ?? {};
  const catData  = summary?.category_breakdown ?? [];
  const monthly  = summary?.monthly_trend ?? [];
  const spenders = summary?.top_spenders ?? [];

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div style={styles.page}>

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div style={styles.pageHeader}>
        <div>
          <p style={styles.eyebrow}>{greeting}</p>
          <h1 style={styles.pageTitle}>{user?.full_name?.split(" ")[0] || "Welcome"}</h1>
          <div style={{ marginTop: 10 }}>
            <StatusPills kpis={kpis} loading={loading} />
          </div>
        </div>
        {user?.role === "admin" && (
          <button
            onClick={() => navigate("/admin/rules")}
            style={styles.ctaButton}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#6d28d9"; e.currentTarget.style.boxShadow = "0 6px 24px rgba(124,58,237,0.45)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = C.purple; e.currentTarget.style.boxShadow = "0 4px 14px rgba(124,58,237,0.3)"; }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="3" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93A10 10 0 0 0 4.93 19.07" />
            </svg>
            Rules Builder
          </button>
        )}
      </div>

      {/* ── KPI cards row ────────────────────────────────────────────────────── */}
      <div style={styles.kpiGrid}>
        <KpiCard
          label="Total Spend"
          value={loading ? null : fmtCurrency(kpis.total_spend, summary?.company_currency)}
          sub={`${kpis.total_expenses ?? "—"} total expenses`}
          accent={C.purple}
          icon="💰"
          loading={loading}
        />
        <KpiCard
          label="Approved Spend"
          value={loading ? null : fmtCurrency(kpis.approved_spend, summary?.company_currency)}
          sub={`${kpis.approved_count ?? "—"} approved`}
          accent={C.green}
          icon="✅"
          loading={loading}
        />
        <KpiCard
          label="Pending Spend"
          value={loading ? null : fmtCurrency(kpis.pending_spend, summary?.company_currency)}
          sub={`${kpis.pending_count ?? "—"} awaiting review`}
          accent={C.amber}
          icon="⏳"
          loading={loading}
        />
        <KpiCard
          label="Approval Rate"
          value={loading ? null : fmtPct(kpis.approval_rate)}
          sub="of all submitted expenses"
          accent={C.green}
          icon="📈"
          loading={loading}
        />
      </div>

      {/* ── Charts row ───────────────────────────────────────────────────────── */}
      <Section title="Spend Analytics" subtitle="Category distribution and monthly trend">
        <div style={styles.chartsRow}>
          <div style={{ flex: "1 1 340px", minWidth: 0 }}>
            <CategoryBarChart data={catData} loading={loading} currency={summary?.company_currency} />
          </div>
          <div style={{ flex: "1 1 300px", minWidth: 0 }}>
            <MonthlyTrendChart data={monthly} loading={loading} currency={summary?.company_currency} />
          </div>
        </div>
      </Section>

      {/* ── Bottom row: top spenders + recent activity ───────────────────────── */}
      <div style={styles.bottomRow}>

        {/* Top spenders */}
        <div style={{ flex: "0 0 320px", minWidth: 0 }}>
          <Section title="Top Spenders" subtitle="By total submitted amount">
            <TopSpenders data={spenders} loading={loading} currency={summary?.company_currency} />
          </Section>
        </div>

        {/* Recent expenses */}
        <div style={{ flex: "1 1 400px", minWidth: 0 }}>
          <Section
            title="Recent Expenses"
            subtitle={`Latest ${expenses.length} submissions`}
            action={
              <button
                onClick={() => navigate("/expenses")}
                style={styles.viewAllBtn}
                onMouseEnter={(e) => { e.currentTarget.style.color = C.purpleHi; e.currentTarget.style.borderColor = `${C.purple}66`; e.currentTarget.style.background = `${C.purple}10`; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = C.purple; e.currentTarget.style.borderColor = `${C.purple}33`; e.currentTarget.style.background = "transparent"; }}
              >
                View all →
              </button>
            }
          >
            {expLoading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[0, 1, 2].map((i) => <SkeletonCard key={i} />)}
              </div>
            ) : expenses.length === 0 ? (
              <div style={styles.emptyState}>
                <div style={{ fontSize: 32 }}>📭</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.textDim }}>No expenses yet</div>
                <div style={{ fontSize: 12, color: C.textFaint }}>Submissions will appear here.</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {expenses.map((e) => <ExpenseRow key={e.id} expense={e} />)}
              </div>
            )}
          </Section>
        </div>

      </div>
    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = {
  page: {
    minHeight: "100%",
    padding: "0 0 56px",
    display: "flex",
    flexDirection: "column",
    gap: 36,
    maxWidth: 1100,
    margin: "0 auto",
    fontFamily: "'Inter', sans-serif",
  },
  pageHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
  },
  eyebrow: {
    margin: 0,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: C.purple,
    marginBottom: 6,
  },
  pageTitle: {
    margin: 0,
    fontSize: 28,
    fontWeight: 800,
    color: C.text,
    letterSpacing: "-0.5px",
    lineHeight: 1.15,
  },
  ctaButton: {
    display: "inline-flex", alignItems: "center", gap: 7,
    padding: "9px 18px",
    background: C.purple,
    border: "none", borderRadius: 8,
    color: "#fff", fontSize: 13, fontWeight: 600,
    cursor: "pointer",
    transition: "background 0.15s, box-shadow 0.15s",
    boxShadow: "0 4px 14px rgba(124,58,237,0.3)",
    whiteSpace: "nowrap",
  },
  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 14,
  },
  chartsRow: {
    display: "flex",
    gap: 14,
    flexWrap: "wrap",
  },
  bottomRow: {
    display: "flex",
    gap: 24,
    flexWrap: "wrap",
    alignItems: "flex-start",
  },
  viewAllBtn: {
    background: "transparent",
    border: "1px solid rgba(124,58,237,0.2)",
    borderRadius: 7,
    color: C.purple,
    fontSize: 12, fontWeight: 600,
    padding: "5px 13px",
    cursor: "pointer",
    transition: "all 0.15s",
  },
  emptyState: {
    display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center",
    padding: "40px 24px",
    background: C.card,
    border: `1px solid ${C.border}`,
    borderRadius: 14,
    textAlign: "center",
    gap: 8,
  },
};
