import { createContext, useContext, useState, useCallback } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import { tokenStorage } from "./api/client";
import Login from "./pages/Login";
import Register from "./pages/Register";
import UserManagement from "./pages/admin/UserManagement";
import SubmitExpense from "./pages/employee/SubmitExpense";
import ExpenseList from "./pages/employee/ExpenseList";
import RuleBuilder from "./pages/admin/RuleBuilder";
import ApprovalQueue from "./pages/manager/ApprovalQueue";

//  Auth Context 

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

//  Route Guards 

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

//  Placeholder Dashboard 

function Dashboard() {
  const { logout, role } = useAuth();

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0d1117",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 24,
      fontFamily: "sans-serif",
    }}>
      <div style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 56,
        height: 56,
        borderRadius: 14,
        background: "#7c3aed",
        color: "#fff",
        fontWeight: 700,
        fontSize: 20,
      }}>
        EF
      </div>

      <h1 style={{
        margin: 0,
        fontSize: 36,
        fontWeight: 700,
        color: "#f1f5f9",
        letterSpacing: "-0.5px",
      }}>
        Welcome to Dashboard
      </h1>

      <p style={{ margin: 0, color: "#64748b", fontSize: 15 }}>
        You are signed in as <span style={{ color: "#a78bfa", fontWeight: 600 }}>{role}</span>
      </p>

      <button
        onClick={logout}
        style={{
          marginTop: 8,
          padding: "10px 24px",
          background: "transparent",
          border: "1px solid #2d3448",
          borderRadius: 6,
          color: "#94a3b8",
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Sign out
      </button>
    </div>
  );
}

//  App 

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Guest-only routes */}
          <Route path="/login"    element={<GuestRoute><Login /></GuestRoute>} />
          <Route path="/register" element={<GuestRoute><Register /></GuestRoute>} />

          {/* Dashboard — all authenticated users */}
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />

          {/* Admin-only: manage users, configure approval rules */}
          <Route path="/admin/users" element={<RoleRoute allowed={["admin"]}><UserManagement /></RoleRoute>} />
          <Route path="/admin/rules" element={<RoleRoute allowed={["admin"]}><RuleBuilder /></RoleRoute>} />

          {/* Employee-only: submit expenses */}
          <Route path="/expenses/submit" element={<RoleRoute allowed={["employee"]}><SubmitExpense /></RoleRoute>} />

          {/* View expenses: employee (own) + manager (team) + admin (all) */}
          <Route path="/expenses" element={<RoleRoute allowed={["employee", "manager", "admin"]}><ExpenseList /></RoleRoute>} />

          {/* Approval queue: manager + admin (override) */}
          <Route path="/manager/queue" element={<RoleRoute allowed={["manager", "admin"]}><ApprovalQueue /></RoleRoute>} />

          {/* Default redirect */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

