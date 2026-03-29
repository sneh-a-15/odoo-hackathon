import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../App";

import client from "../api/client";
import { Input, Button, useToast } from "../components/ui/UICore";

// ─── Validation schema ─────────────────────────────────────────────────────────

const schema = z.object({
  email:    z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

// ─── Component ─────────────────────────────────────────────────────────────────

export default function Login() {
  const navigate = useNavigate();
  const toast    = useToast();
  const { login } = useAuth();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema) });

  const onSubmit = async (data) => {
    try {
      // FastAPI OAuth2 expects form-encoded body for /token,
      // but our custom /auth/login accepts JSON — use JSON.
      const res = await client.post("/api/v1/auth/login", data);

      login(res.data.access_token, res.data.user);
      toast.success("Welcome back!", `Logged in as ${res.data.user?.email ?? data.email}`);
      navigate("/dashboard");
    } catch (err) {
      toast.error("Login failed", err.message);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={styles.page}>
      <div style={styles.card}>

        {/* Header */}
        <div style={styles.header}>
          <div style={styles.logo}>EF</div>
          <h1 style={styles.title}>Sign in to ExpenseFlow</h1>
          <p style={styles.subtitle}>
            Manage expense claims and approvals across your team.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} style={styles.form} noValidate>
          <Input
            label="Email address"
            type="email"
            placeholder="jane@acme.com"
            required
            autoComplete="email"
            autoFocus
            error={errors.email?.message}
            {...register("email")}
          />

          <Input
            label="Password"
            type="password"
            placeholder="Your password"
            required
            autoComplete="current-password"
            error={errors.password?.message}
            {...register("password")}
          />

          <Button
            type="submit"
            loading={isSubmitting}
            style={{ width: "100%", justifyContent: "center", marginTop: 4 }}
          >
            Sign in
          </Button>
        </form>

        {/* Divider */}
        <div style={styles.divider}>
          <span style={styles.dividerLine} />
          <span style={styles.dividerText}>or</span>
          <span style={styles.dividerLine} />
        </div>

        {/* Footer */}
        <p style={styles.footer}>
          Don&apos;t have an account?{" "}
          <Link to="/register" style={styles.link}>
            Create one — it&apos;s free
          </Link>
        </p>
      </div>
    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = {
  page: {
    minHeight: "100vh",
    background: "#0d1117",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px 16px",
  },
  card: {
    background: "#151924",
    border: "1px solid #1e2330",
    borderRadius: 12,
    padding: "40px 36px",
    width: "100%",
    maxWidth: 420,
    boxShadow: "0 8px 40px rgba(0,0,0,0.4)",
  },
  header: {
    textAlign: "center",
    marginBottom: 32,
  },
  logo: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 44,
    height: 44,
    borderRadius: 10,
    background: "#7c3aed",
    color: "#fff",
    fontWeight: 700,
    fontSize: 16,
    marginBottom: 16,
  },
  title: {
    margin: 0,
    fontSize: 22,
    fontWeight: 600,
    color: "#f1f5f9",
  },
  subtitle: {
    marginTop: 8,
    fontSize: 13,
    color: "#64748b",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 18,
  },
  divider: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    margin: "24px 0 0",
  },
  dividerLine: {
    flex: 1,
    height: 1,
    background: "#1e2330",
    display: "block",
  },
  dividerText: {
    fontSize: 12,
    color: "#4b5563",
  },
  footer: {
    textAlign: "center",
    marginTop: 16,
    fontSize: 13,
    color: "#64748b",
  },
  link: {
    color: "#7c3aed",
    textDecoration: "none",
    fontWeight: 600,
  },
};