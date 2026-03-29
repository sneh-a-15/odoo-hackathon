import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, Receipt, FilePlus, Users, Settings, ClipboardList, LogOut } from "lucide-react";

import client, { tokenStorage } from "./api/client";
import Login from "./pages/Login";
import Register from "./pages/Register";
import UserManagement from "./pages/admin/UserManagement";
import SubmitExpense from "./pages/employee/SubmitExpense";
import ExpenseList from "./pages/employee/ExpenseList";
import RuleBuilder from "./pages/admin/RuleBuilder";
import ApprovalQueue from "./pages/manager/ApprovalQueue";
import Dashboard from "./pages/Dashboard";

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

//  Layout Wrapper 

function Layout() {
  const { logout, user } = useAuth();
  const role = user?.role || "employee";
  
  return (
    <div style={{ display: 'flex', minHeight: '100vh', width: '100%', backgroundColor: '#0d1117', color: '#f1f5f9', textAlign: 'left' }}>
      {/* Sidebar */}
      <aside style={{ background: '#151924', width: '260px', borderRight: '1px solid #1e2330', display: 'flex', flexDirection: 'column', padding: '24px 16px', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '40px', padding: '0 8px' }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #7c3aed, #aa3bff)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16, boxShadow: "0 4px 12px rgba(124,58,237,0.3)" }}>EF</div>
          <span style={{ fontSize: '20px', fontWeight: 700, color: '#f1f5f9', letterSpacing: "-0.5px" }}>ExpenseFlow</span>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
          <NavLink to="/dashboard" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
             <LayoutDashboard size={20} /> Dashboard
          </NavLink>
          
          {(role === "employee" || role === "manager" || role === "admin") && (
            <NavLink to="/expenses" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
               <Receipt size={20} /> My Expenses
            </NavLink>
          )}
          
          {(role === "employee" || role === "manager") && (
             <NavLink to="/expenses/submit" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
                <FilePlus size={20} /> Submit Claim
             </NavLink>
          )}

          {(role === "manager" || role === "admin") && (
             <NavLink to="/manager/queue" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
                <ClipboardList size={20} /> Approvals
             </NavLink>
          )}
          
          {role === "admin" && (
             <>
               <hr style={{ borderColor: '#1e2330', margin: '16px 0', borderBottom: 'none' }} />
               <NavLink to="/admin/users" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
                  <Users size={20} /> Users
               </NavLink>
               <NavLink to="/admin/rules" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
                  <Settings size={20} /> Approval Rules
               </NavLink>
             </>
          )}
        </nav>

        <div style={{ marginTop: 'auto', background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 12, border: "1px solid rgba(255,255,255,0.05)" }}>
          <div style={{ display: "flex", flexDirection: "column", marginBottom: 16 }}>
             <span style={{ color: "#f1f5f9", fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.full_name || "Loading..."}</span>
             <span style={{ color: "#64748b", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.email || "Loading..."}</span>
          </div>
          <button onClick={logout} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: 'transparent', border: '1px solid #1e2330', color: '#94a3b8', cursor: 'pointer', textAlign: 'left', borderRadius: '6px', fontSize: 13, fontWeight: 500, transition: "all 0.2s" }} onMouseOver={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)'; e.currentTarget.style.background = 'rgba(239,68,68,0.05)'; }} onMouseOut={e => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.borderColor = '#1e2330'; e.currentTarget.style.background = 'transparent'; }}>
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main style={{ flex: 1, padding: '32px', overflowY: 'auto' }}>
        <Outlet />
      </main>
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

