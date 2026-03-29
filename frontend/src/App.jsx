import { createContext, useContext, useState, useCallback } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import { tokenStorage } from "./api/client";
import Login from "./pages/Login";
import Register from "./pages/Register";
import UserManagement from "./pages/admin/UserManagement";
import SubmitExpense from "./pages/employee/SubmitExpense";
import RuleBuilder from "./pages/admin/RuleBuilder";

//  Auth Context 

const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

function AuthProvider({ children }) {
  // Initialize from localStorage so a page refresh keeps the user logged in
  const [token, setToken] = useState(() => tokenStorage.get());

  const login = useCallback((newToken) => {
    tokenStorage.set(newToken);
    setToken(newToken);
  }, []);

  const logout = useCallback(() => {
    tokenStorage.clear();
    setToken(null);
  }, []);

  const isAuthenticated = Boolean(token);

  return (
    <AuthContext.Provider value={{ token, isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

//  Route Guards 

/** Wraps authenticated routes  redirects to /login if no token. */
function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

/** Wraps guest-only routes  redirects to /dashboard if already logged in. */
function GuestRoute({ children }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Navigate to="/dashboard" replace /> : children;
}

//  Placeholder Dashboard 

function Dashboard() {
  const { logout } = useAuth();

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
        You are successfully authenticated. Build something great 
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

          {/* Protected routes */}
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/admin/users" element={<ProtectedRoute><UserManagement /></ProtectedRoute>} />
          <Route path="/admin/rules" element={<ProtectedRoute><RuleBuilder /></ProtectedRoute>} />
          <Route path="/expenses/submit" element={<ProtectedRoute><SubmitExpense /></ProtectedRoute>} />

          {/* Default redirect */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
