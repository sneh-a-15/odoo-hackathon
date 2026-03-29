import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../App";

import client from "../api/client";
import { Input, Button, useToast } from "../components/ui/UICore";

// ─── Validation schema ─────────────────────────────────────────────────────────

const schema = z
  .object({
    full_name:    z.string().min(2, "Full name must be at least 2 characters"),
    email:        z.string().email("Enter a valid email address"),
    company_name: z.string().min(2, "Company name must be at least 2 characters"),
    country_code: z.string().min(1, "Please select a country"),
    password:     z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/\d/, "Password must contain at least one number"),
    confirm_password: z.string(),
  })
  .refine((d) => d.password === d.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"],
  });

// ─── Country fetcher ───────────────────────────────────────────────────────────

async function fetchCountries() {
  const res = await fetch(
    "https://restcountries.com/v3.1/all?fields=name,currencies,cca2"
  );
  if (!res.ok) throw new Error("Failed to fetch countries");
  const raw = await res.json();

  return raw
    .map((c) => {
      const currencyCode   = Object.keys(c.currencies ?? {})[0] ?? "";
      const currencyName   = c.currencies?.[currencyCode]?.name ?? "";
      return {
        code:         c.cca2,                           // ISO 3166-1 alpha-2
        name:         c.name?.common ?? "Unknown",
        currency_code: currencyCode,
        currency_name: currencyName,
      };
    })
    .filter((c) => c.currency_code)                    // drop countries with no currency
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function Register() {
  const navigate = useNavigate();
  const toast    = useToast();
  const { login } = useAuth();

  const [countries,        setCountries]        = useState([]);
  const [countriesLoading, setCountriesLoading] = useState(true);
  const [selectedCurrency, setSelectedCurrency] = useState("");

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema) });

  // ── Fetch country list on mount ────────────────────────────────────────────
  useEffect(() => {
    fetchCountries()
      .then(setCountries)
      .catch(() => toast.error("Country list unavailable", "Using manual entry as fallback."))
      .finally(() => setCountriesLoading(false));
  }, []);

  // ── Watch country selector → show currency hint ────────────────────────────
  const watchedCountry = watch("country_code");
  useEffect(() => {
    if (!watchedCountry) return;
    const found = countries.find((c) => c.code === watchedCountry);
    setSelectedCurrency(found ? `${found.currency_code} — ${found.currency_name}` : "");
  }, [watchedCountry, countries]);

  // ── Submit ─────────────────────────────────────────────────────────────────
  const onSubmit = async (data) => {
    try {
      const { confirm_password, ...payload } = data;
      const res = await client.post("/api/v1/auth/register", payload);

      login(res.data.access_token);
      toast.success("Account created!", "Welcome to ExpenseFlow.");
      navigate("/dashboard");
    } catch (err) {
      toast.error("Registration failed", err.message);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={styles.page}>
      <div style={styles.card}>

        {/* Header */}
        <div style={styles.header}>
          <div style={styles.logo}>EF</div>
          <h1 style={styles.title}>Create your account</h1>
          <p style={styles.subtitle}>
            Your company workspace is set up automatically on signup.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} style={styles.form} noValidate>

          <div style={styles.row}>
            <Input
              label="Full name"
              placeholder="Jane Smith"
              required
              error={errors.full_name?.message}
              {...register("full_name")}
            />
            <Input
              label="Work email"
              type="email"
              placeholder="jane@acme.com"
              required
              error={errors.email?.message}
              {...register("email")}
            />
          </div>

          <Input
            label="Company name"
            placeholder="Acme Corp"
            required
            error={errors.company_name?.message}
            {...register("company_name")}
          />

          {/* Country selector */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={styles.selectLabel}>
              Country <span style={{ color: "#ef4444", marginLeft: 3 }}>*</span>
            </label>
            <select
              disabled={countriesLoading}
              style={{
                ...styles.select,
                borderColor: errors.country_code ? "#ef4444" : "#2d3448",
              }}
              {...register("country_code")}
            >
              <option value="">
                {countriesLoading ? "Loading countries…" : "Select a country"}
              </option>
              {countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name} ({c.currency_code})
                </option>
              ))}
            </select>
            {errors.country_code && (
              <span style={styles.fieldError}>⊙ {errors.country_code.message}</span>
            )}
            {selectedCurrency && !errors.country_code && (
              <span style={styles.helper}>
                Company default currency: {selectedCurrency}
              </span>
            )}
          </div>

          <div style={styles.row}>
            <Input
              label="Password"
              type="password"
              placeholder="Min 8 chars, 1 number"
              required
              error={errors.password?.message}
              {...register("password")}
            />
            <Input
              label="Confirm password"
              type="password"
              placeholder="Repeat password"
              required
              error={errors.confirm_password?.message}
              {...register("confirm_password")}
            />
          </div>

          <Button
            type="submit"
            loading={isSubmitting}
            disabled={countriesLoading}
            style={{ width: "100%", justifyContent: "center", marginTop: 4 }}
          >
            Create account
          </Button>
        </form>

        {/* Footer */}
        <p style={styles.footer}>
          Already have an account?{" "}
          <Link to="/login" style={styles.link}>
            Sign in
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
    maxWidth: 560,
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
  row: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 14,
  },
  selectLabel: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.08em",
    color: "#94a3b8",
    textTransform: "uppercase",
  },
  select: {
    width: "100%",
    boxSizing: "border-box",
    background: "#151924",
    border: "1px solid #2d3448",
    borderRadius: 6,
    padding: "10px 14px",
    color: "#f1f5f9",
    fontSize: 14,
    outline: "none",
    cursor: "pointer",
    appearance: "none",
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 14px center",
    paddingRight: 36,
  },
  fieldError: {
    color: "#ef4444",
    fontSize: 12,
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  helper: {
    color: "#64748b",
    fontSize: 12,
  },
  footer: {
    textAlign: "center",
    marginTop: 24,
    fontSize: 13,
    color: "#64748b",
  },
  link: {
    color: "#7c3aed",
    textDecoration: "none",
    fontWeight: 600,
  },
};