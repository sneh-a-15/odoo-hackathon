import { createContext, useContext, useState, useCallback, forwardRef } from "react";

// ─── Toast Context ────────────────────────────────────────────────────────────

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((type, title, message) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const remove = (id) => setToasts((prev) => prev.filter((t) => t.id !== id));

  const success = (title, message) => addToast("success", title, message);
  const error = (title, message) => addToast("error", title, message);
  const warning = (title, message) => addToast("warning", title, message);
  const info = (title, message) => addToast("info", title, message);

  return (
    <ToastContext.Provider value={{ success, error, warning, info }}>
      {children}
      <div style={{
        position: "fixed", bottom: 24, right: 24,
        display: "flex", flexDirection: "column", gap: 10, zIndex: 9999, width: 380,
      }}>
        {toasts.map((t) => (
          <Toast key={t.id} toast={t} onClose={() => remove(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}

const toastStyles = {
  success: { border: "#22c55e", icon: "✓", iconBg: "#22c55e", iconColor: "#fff" },
  error:   { border: "#ef4444", icon: "✕", iconBg: "#ef4444", iconColor: "#fff" },
  warning: { border: "#f59e0b", icon: "⚠", iconBg: "#f59e0b", iconColor: "#fff" },
  info:    { border: "#8b5cf6", icon: "i", iconBg: "#8b5cf6", iconColor: "#fff" },
};

function Toast({ toast, onClose }) {
  const s = toastStyles[toast.type];
  return (
    <div style={{
      background: "#1e2330", borderRadius: 8,
      borderLeft: `4px solid ${s.border}`,
      padding: "14px 16px", display: "flex", alignItems: "flex-start",
      gap: 12, boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
      animation: "slideIn 0.2s ease",
    }}>
      <span style={{
        width: 22, height: 22, borderRadius: "50%",
        background: s.iconBg, color: s.iconColor,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 1,
      }}>{s.icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ color: "#f1f5f9", fontWeight: 600, fontSize: 14 }}>{toast.title}</div>
        {toast.message && <div style={{ color: "#94a3b8", fontSize: 13, marginTop: 2 }}>{toast.message}</div>}
      </div>
      <button onClick={onClose} style={{
        background: "#2d3448", border: "none", borderRadius: 4,
        color: "#94a3b8", cursor: "pointer", padding: "2px 7px", fontSize: 13,
      }}>×</button>
    </div>
  );
}

// ─── Input ────────────────────────────────────────────────────────────────────

export const Input = forwardRef(function Input(
  { label, error, helper, className = "", ...props }, ref
) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {label && (
        <label style={{
          fontSize: 11, fontWeight: 600, letterSpacing: "0.08em",
          color: "#94a3b8", textTransform: "uppercase",
        }}>
          {label}
          {props.required && <span style={{ color: "#ef4444", marginLeft: 3 }}>*</span>}
        </label>
      )}
      <div style={{ position: "relative" }}>
        <input
          ref={ref}
          {...props}
          style={{
            width: "100%", boxSizing: "border-box",
            background: "#151924", border: `1px solid ${error ? "#ef4444" : "#2d3448"}`,
            borderRadius: 6, padding: "10px 14px",
            color: props.disabled ? "#4b5563" : "#f1f5f9",
            fontSize: 14, outline: "none", transition: "border-color 0.15s",
          }}
          onFocus={(e) => {
            e.target.style.borderColor = error ? "#ef4444" : "#7c3aed";
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            e.target.style.borderColor = error ? "#ef4444" : "#2d3448";
            props.onBlur?.(e);
          }}
        />
        {error && (
          <span style={{
            position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
            color: "#ef4444", fontSize: 16,
          }}>⊙</span>
        )}
      </div>
      {error && <span style={{ color: "#ef4444", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>⊙ {error}</span>}
      {helper && !error && <span style={{ color: "#64748b", fontSize: 12 }}>{helper}</span>}
    </div>
  );
});

// ─── Button ───────────────────────────────────────────────────────────────────

export function Button({
  children, variant = "default", size = "md",
  loading = false, disabled = false, icon, ...props
}) {
  const sizes = { sm: "8px 14px", md: "10px 20px", lg: "13px 28px" };
  const fontSizes = { sm: 13, md: 14, lg: 15 };

  const variants = {
    default: { background: "#f1f5f9", color: "#0f172a", border: "none" },
    danger:  { background: "transparent", color: "#f1f5f9", border: "1px solid #ef4444" },
    outline: { background: "transparent", color: "#f1f5f9", border: "1px solid #2d3448" },
    ghost:   { background: "transparent", color: "#94a3b8", border: "none" },
  };

  const v = variants[variant] || variants.default;
  const isDisabled = disabled || loading;

  return (
    <button
      {...props}
      disabled={isDisabled}
      style={{
        ...v,
        padding: sizes[size] || sizes.md,
        fontSize: fontSizes[size] || fontSizes.md,
        borderRadius: 6, fontWeight: 600, cursor: isDisabled ? "not-allowed" : "pointer",
        opacity: isDisabled ? 0.45 : 1,
        display: "inline-flex", alignItems: "center", gap: 6,
        transition: "opacity 0.15s, background 0.15s",
        whiteSpace: "nowrap",
      }}
    >
      {loading && (
        <span style={{
          width: 14, height: 14, border: "2px solid currentColor",
          borderTopColor: "transparent", borderRadius: "50%",
          display: "inline-block", animation: "spin 0.7s linear infinite",
        }} />
      )}
      {icon && !loading && <span>{icon}</span>}
      {children}
    </button>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────

export function Badge({ children, variant = "neutral" }) {
  const variants = {
    success: { background: "rgba(34,197,94,0.15)", color: "#22c55e", dot: "#22c55e" },
    pending: { background: "rgba(139,92,246,0.15)", color: "#8b5cf6", dot: "#8b5cf6" },
    trial:   { background: "rgba(245,158,11,0.15)", color: "#f59e0b", dot: "#f59e0b" },
    neutral: { background: "rgba(100,116,139,0.15)", color: "#94a3b8", dot: "#94a3b8" },
    error:   { background: "rgba(239,68,68,0.15)", color: "#ef4444", dot: "#ef4444" },
  };

  const v = variants[variant] || variants.neutral;

  return (
    <span style={{
      background: v.background, color: v.color,
      borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: 500,
      display: "inline-flex", alignItems: "center", gap: 5,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: "50%",
        background: v.dot, display: "inline-block",
      }} />
      {children}
    </span>
  );
}

// ─── DataTable ────────────────────────────────────────────────────────────────

export function DataTable({
  columns = [], data = [], loading = false,
  emptyMessage = "No records found", onRowClick,
}) {
  return (
    <div style={{
      background: "#151924", borderRadius: 10,
      border: "1px solid #1e2330", overflow: "hidden",
    }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #1e2330" }}>
            {columns.map((col) => (
              <th key={col.key} style={{
                padding: "10px 16px", textAlign: col.align || "left",
                fontSize: 11, fontWeight: 600, letterSpacing: "0.08em",
                color: "#64748b", textTransform: "uppercase",
              }}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr
              key={row.id ?? i}
              onClick={() => onRowClick?.(row)}
              style={{
                borderBottom: "1px solid #1a2035",
                cursor: onRowClick ? "pointer" : "default",
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "#1a2035"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
            >
              {columns.map((col) => (
                <td key={col.key} style={{
                  padding: "13px 16px", textAlign: col.align || "left",
                  color: col.key === columns[0].key ? "#f1f5f9" : "#94a3b8",
                  fontWeight: col.key === columns[0].key ? 600 : 400,
                  fontSize: 14,
                }}>
                  {col.render ? col.render(row[col.key], row) : row[col.key] ?? "—"}
                </td>
              ))}
            </tr>
          ))}

          {loading && Array.from({ length: 1 }).map((_, i) => (
            <tr key={`skeleton-${i}`} style={{ borderBottom: "1px solid #1a2035" }}>
              {columns.map((col) => (
                <td key={col.key} style={{ padding: "13px 16px" }}>
                  <div style={{
                    height: 12, borderRadius: 4,
                    background: "linear-gradient(90deg, #1e2330 25%, #252d40 50%, #1e2330 75%)",
                    backgroundSize: "200% 100%",
                    animation: "shimmer 1.5s infinite",
                    width: `${40 + Math.random() * 40}%`,
                  }} />
                </td>
              ))}
            </tr>
          ))}

          {!loading && data.length === 0 && (
            <tr>
              <td colSpan={columns.length} style={{
                padding: 32, textAlign: "center", color: "#4b5563", fontSize: 14,
              }}>
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div style={{
        padding: "8px 16px", borderTop: "1px solid #1e2330",
        color: "#4b5563", fontSize: 12,
      }}>
        {data.length} record{data.length !== 1 ? "s" : ""}
        {loading ? " · 1 loading" : ""}
      </div>
    </div>
  );
}

// ─── Global styles ─────────────────────────────────────────────────────────────

const styleTag = document.createElement("style");
styleTag.textContent = `
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes slideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
  @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
  input::placeholder { color: #4b5563; }
  input:disabled { cursor: not-allowed; }
`;
document.head.appendChild(styleTag);