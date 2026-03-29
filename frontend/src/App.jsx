import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, Receipt, FilePlus, Users, Settings, ClipboardList, LogOut, Menu, X } from "lucide-react";

import client, { tokenStorage } from "./api/client";
import Login from "./pages/Login";
import Register from "./pages/Register";
import UserManagement from "./pages/admin/UserManagement";
import SubmitExpense from "./pages/employee/SubmitExpense";
import ExpenseList from "./pages/employee/ExpenseList";
import RuleBuilder from "./pages/admin/RuleBuilder";
import ApprovalQueue from "./pages/manager/ApprovalQueue";
import Dashboard from "./pages/Dashboard";

// ─── Sidebar animation keyframe injection ──────────────────────────────────────
const _styleTag = document.createElement("style");
_styleTag.textContent = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

  *, *::before, *::after { box-sizing: border-box; }

  body { margin: 0; font-family: 'Inter', sans-serif; background: #0d1117; }

  .nav-link {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 12px;
    border-radius: 8px;
    color: #64748b;
    text-decoration: none;
    font-size: 13.5px;
    font-weight: 500;
    transition: background 0.15s, color 0.15s;
    user-select: none;
    position: relative;
  }
  .nav-link svg { flex-shrink: 0; transition: color 0.15s; }
  .nav-link:hover { background: rgba(255,255,255,0.05); color: #cbd5e1; }
  .nav-link.active {
    background: rgba(124,58,237,0.14);
    color: #c4b5fd;
    font-weight: 600;
  }
  .nav-link.active svg { color: #a78bfa; }
  .nav-link.active::before {
    content: '';
    position: absolute;
    left: 0; top: 20%; bottom: 20%;
    width: 3px;
    border-radius: 0 2px 2px 0;
    background: #7c3aed;
  }

  .sidebar-nav-section {
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #334155;
    padding: 4px 12px;
    margin-top: 8px;
  }

  @keyframes fadeSlideIn {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .dash-fade { animation: fadeSlideIn 0.4s ease both; }

  @keyframes shimmer {
    0%   { background-position: -400px 0; }
    100% { background-position: 400px 0; }
  }
  .skeleton {
    background: linear-gradient(90deg, #1e2330 25%, #252c3d 50%, #1e2330 75%);
    background-size: 800px 100%;
    animation: shimmer 1.6s infinite;
    border-radius: 6px;
  }
`;
document.head.appendChild(_styleTag);

// ─── Auth Context ──────────────────────────────────────────────────────────────

const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

// Helpers to persist user info alongside the token
const userStorage = {
  get:   () => { try { return JSON.parse(localStorage.getItem("user_info")); } catch { return null; } },
  set:   (u) => localStorage.setItem("user_info", JSON.stringify(u)),
  clear: () => localStorage.removeItem("user_info"),
};

function AuthProvider({ children }) {
  const [token, setToken] = useState(() => tokenStorage.get());
  const [user, setUser]   = useState(() => userStorage.get());

  // If localStorage has a token but no full_name (stale data from before the
  // backend fix), silently refresh user info from /auth/me.
  useEffect(() => {
    if (token && user && !user.full_name) {
      client.get("/api/v1/auth/me")
        .then((res) => {
          const refreshed = { ...user, ...res.data };
          userStorage.set(refreshed);
          setUser(refreshed);
        })
        .catch(() => { /* silently ignore — token might be expired */ });
    }
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback((newToken, userInfo) => {
    tokenStorage.set(newToken);
    userStorage.set(userInfo);
    setToken(newToken);
    setUser(userInfo);
  }, []);

  const logout = useCallback(() => {
    tokenStorage.clear();
    userStorage.clear();
    setToken(null);
    setUser(null);
  }, []);

  const isAuthenticated = Boolean(token);
  const role = user?.role ?? null;

  return (
    <AuthContext.Provider value={{ token, user, role, isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Route Guards ──────────────────────────────────────────────────────────────

/** Redirects to /login if not authenticated. */
function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

/** Redirects to /dashboard if already logged in. */
function GuestRoute({ children }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Navigate to="/dashboard" replace /> : children;
}

/** Redirects to /dashboard if user's role is not in the allowed list. */
function RoleRoute({ allowed, children }) {
  const { isAuthenticated, role } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!allowed.includes(role)) return <Navigate to="/dashboard" replace />;
  return children;
}

// ─── Role badge colours ────────────────────────────────────────────────────────
const ROLE_PILL = {
  admin:    { bg: "rgba(239,68,68,0.12)",   color: "#f87171",  label: "Admin"    },
  manager:  { bg: "rgba(245,158,11,0.12)",  color: "#fbbf24",  label: "Manager"  },
  employee: { bg: "rgba(34,197,94,0.12)",   color: "#4ade80",  label: "Employee" },
};

// ─── Avatar initials ──────────────────────────────────────────────────────────
function Avatar({ name, size = 32 }) {
  const initials = (name || "U")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: "linear-gradient(135deg,#7c3aed,#a855f7)",
      color: "#fff", display: "flex", alignItems: "center",
      justifyContent: "center", fontSize: size * 0.38,
      fontWeight: 700, flexShrink: 0, letterSpacing: "-0.5px",
    }}>
      {initials}
    </div>
  );
}

// ─── Layout Wrapper ────────────────────────────────────────────────────────────

function Layout() {
  const { logout, user } = useAuth();
  const role = user?.role || "employee";
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const rolePill = ROLE_PILL[role] || ROLE_PILL.employee;

  const NavSection = ({ label }) => (
    <div className="sidebar-nav-section">{label}</div>
  );

  const sidebarContent = (
    <>
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 4px", marginBottom: 32 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 9,
          background: "linear-gradient(135deg,#7c3aed,#a855f7)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 800, fontSize: 14, color: "#fff",
          boxShadow: "0 4px 14px rgba(124,58,237,0.35)",
          flexShrink: 0,
        }}>EF</div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9", letterSpacing: "-0.3px", lineHeight: 1.1 }}>
            ExpenseFlow
          </div>
          <div style={{ fontSize: 10, fontWeight: 500, color: "#475569", letterSpacing: "0.05em", textTransform: "uppercase" }}>
            WORKSPACE
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
        <NavSection label="Overview" />
        <NavLink to="/dashboard" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
          <LayoutDashboard size={16} /> Dashboard
        </NavLink>

        {(role === "employee" || role === "manager" || role === "admin") && (
          <>
            <NavSection label="Expenses" />
            <NavLink to="/expenses" end className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
              <Receipt size={16} />
              {role === "employee" ? "My Expenses" : "Company Expenses"}
            </NavLink>
          </>
        )}

        {(role === "employee") && (
          <NavLink to="/expenses/submit" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
            <FilePlus size={16} /> Submit Expense
          </NavLink>
        )}

        {(role === "manager" || role === "admin") && (
          <>
            <NavSection label="Approvals" />
            <NavLink to="/manager/queue" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
              <ClipboardList size={16} /> Approval Queue
            </NavLink>
          </>
        )}

        {role === "admin" && (
          <>
            <NavSection label="Administration" />
            <NavLink to="/admin/users" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
              <Users size={16} /> User Management
            </NavLink>
            <NavLink to="/admin/rules" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
              <Settings size={16} /> Approval Rules
            </NavLink>
          </>
        )}
      </nav>

      {/* User Profile Card */}
      <div style={{
        marginTop: "auto",
        borderTop: "1px solid #1a2235",
        paddingTop: 16,
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 8px", borderRadius: 10,
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.04)",
          marginBottom: 10,
        }}>
          <Avatar name={user?.full_name} size={34} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 13, fontWeight: 600, color: "#e2e8f0",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {user?.full_name || "User"}
            </div>
            <div style={{
              fontSize: 11, color: "#475569",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              marginTop: 1,
            }}>
              {user?.email || "—"}
            </div>
          </div>
          {/* Role pill */}
          <span style={{
            background: rolePill.bg, color: rolePill.color,
            fontSize: 9.5, fontWeight: 700,
            letterSpacing: "0.06em", textTransform: "uppercase",
            padding: "3px 7px", borderRadius: 20, flexShrink: 0,
          }}>
            {rolePill.label}
          </span>
        </div>

        {/* Sign-out button */}
        <SignOutButton onClick={logout} />
      </div>
    </>
  );

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", backgroundColor: "#0d1117", fontFamily: "'Inter', sans-serif" }}>

      {/* ── Desktop Sidebar ─────────────────────────────────────────────────── */}
      <aside style={{
        width: 230, flexShrink: 0,
        background: "#0f131a",
        borderRight: "1px solid #1a2235",
        display: "flex", flexDirection: "column",
        padding: "20px 14px",
        overflowY: "auto",
      }}>
        {sidebarContent}
      </aside>

      {/* ── Mobile sidebar overlay ───────────────────────────────────────────── */}
      {mobileSidebarOpen && (
        <div
          onClick={() => setMobileSidebarOpen(false)}
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.6)", backdropFilter: "blur(3px)",
            zIndex: 40,
          }}
        />
      )}
      <div style={{
        position: "fixed", top: 0, left: 0, bottom: 0,
        width: 230,
        background: "#0f131a",
        borderRight: "1px solid #1a2235",
        display: "flex", flexDirection: "column",
        padding: "20px 14px",
        transform: mobileSidebarOpen ? "translateX(0)" : "translateX(-100%)",
        transition: "transform 0.25s cubic-bezier(0.4,0,0.2,1)",
        zIndex: 50, overflowY: "auto",
      }}>
        <button
          onClick={() => setMobileSidebarOpen(false)}
          style={{
            position: "absolute", top: 14, right: 14,
            background: "transparent", border: "none",
            color: "#64748b", cursor: "pointer", padding: 4,
          }}
        >
          <X size={18} />
        </button>
        {sidebarContent}
      </div>

      {/* ── Main area ─────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Mobile top-bar */}
        <header style={{
          display: "none",
          alignItems: "center", gap: 12,
          padding: "12px 20px",
          borderBottom: "1px solid #1a2235",
          background: "#0f131a",
          "@media (max-width: 768px)": { display: "flex" },
        }}>
          <button
            onClick={() => setMobileSidebarOpen(true)}
            style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer" }}
          >
            <Menu size={20} />
          </button>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9" }}>ExpenseFlow</span>
        </header>

        {/* Page content */}
        <main style={{
          flex: 1, overflowY: "auto",
          padding: "36px 40px",
          background: "#0d1117",
          color: "#f1f5f9",
        }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

// ─── Sign-out button (isolated for clean hover state) ─────────────────────────

function SignOutButton({ onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: "100%",
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 12px",
        background: hovered ? "rgba(239,68,68,0.08)" : "transparent",
        border: `1px solid ${hovered ? "rgba(239,68,68,0.25)" : "#1a2235"}`,
        borderRadius: 8,
        color: hovered ? "#f87171" : "#64748b",
        cursor: "pointer",
        fontSize: 13, fontWeight: 500,
        transition: "all 0.15s",
      }}
    >
      <LogOut size={14} />
      Sign out
    </button>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Guest-only routes */}
          <Route path="/login"    element={<GuestRoute><Login /></GuestRoute>} />
          <Route path="/register" element={<GuestRoute><Register /></GuestRoute>} />

          {/* Protected Area with Sidebar */}
          <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            {/* Dashboard — all authenticated users */}
            <Route path="/dashboard" element={<Dashboard />} />

            {/* Admin-only: manage users, configure approval rules */}
            <Route path="/admin/users" element={<RoleRoute allowed={["admin"]}><UserManagement /></RoleRoute>} />
            <Route path="/admin/rules" element={<RoleRoute allowed={["admin"]}><RuleBuilder /></RoleRoute>} />

            {/* Employee-only: submit expenses */}
            <Route path="/expenses/submit" element={<RoleRoute allowed={["employee"]}><SubmitExpense /></RoleRoute>} />

            {/* View expenses: employee (own) + manager (team) + admin (all) */}
            <Route path="/expenses" element={<RoleRoute allowed={["employee", "manager", "admin"]}><ExpenseList /></RoleRoute>} />

            {/* Approval queue: manager + admin (override) */}
            <Route path="/manager/queue" element={<RoleRoute allowed={["manager", "admin"]}><ApprovalQueue /></RoleRoute>} />
          </Route>

          {/* Default redirect */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
