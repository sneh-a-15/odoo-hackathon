import { useState, useCallback, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import client from "../../api/client";
import { Input, Button, useToast } from "../../components/ui/UICore";

// ─── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: "travel",        label: "✈️  Travel" },
  { value: "meals",         label: "🍽️  Meals & Entertainment" },
  { value: "accommodation", label: "🏨  Accommodation" },
  { value: "equipment",     label: "🖥️  Equipment & Supplies" },
  { value: "other",         label: "📎  Other" },
];

const CURRENCIES = ["USD", "EUR", "GBP", "INR", "AUD", "CAD", "SGD", "JPY", "AED", "CHF"];

// Today's date as YYYY-MM-DD for the date field max attribute
const TODAY = new Date().toISOString().split("T")[0];

// ─── Validation schema ─────────────────────────────────────────────────────────

const schema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  amount: z
    .string()
    .min(1, "Amount is required")
    .refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0, "Amount must be greater than 0")
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v.trim()), "Max 2 decimal places allowed"),
  currency: z
    .string()
    .length(3, "Must be a 3-letter currency code")
    .regex(/^[A-Z]{3}$/, "Use uppercase letters, e.g. USD"),
  category: z.enum(
    ["travel", "meals", "accommodation", "equipment", "other"],
    { required_error: "Please select a category" }
  ),
  description: z.string().min(10, "Description must be at least 10 characters"),
  expense_date: z
    .string()
    .min(1, "Date is required")
    .refine((v) => v <= TODAY, "Expense date cannot be in the future"),
});

// ─── Shared SelectField (mirrors UICore Input aesthetics) ──────────────────────

function SelectField({ label, error, helper, required, children, ...props }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {label && (
        <label style={styles.fieldLabel}>
          {label}
          {required && <span style={{ color: "#ef4444", marginLeft: 3 }}>*</span>}
        </label>
      )}
      <select
        style={{
          ...styles.select,
          borderColor: error ? "#ef4444" : "#2d3448",
        }}
        {...props}
      >
        {children}
      </select>
      {error  && <span style={styles.fieldError}>⊙ {error}</span>}
      {helper && !error && <span style={styles.fieldHelper}>{helper}</span>}
    </div>
  );
}

// ─── Textarea field (mirrors UICore Input aesthetics) ─────────────────────────

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
        rows={3}
        style={{
          ...styles.textarea,
          borderColor: error ? "#ef4444" : focused ? "#7c3aed" : "#2d3448",
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        {...props}
      />
      {error  && <span style={styles.fieldError}>⊙ {error}</span>}
      {helper && !error && <span style={styles.fieldHelper}>{helper}</span>}
    </div>
  );
}

// ─── Currency conversion preview ───────────────────────────────────────────────

function useConversionPreview() {
  const [preview, setPreview]   = useState(null);   // { text, loading }
  const debounceRef             = useRef(null);

  const fetchPreview = useCallback(async (amount, currency) => {
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0 || !currency || currency.length !== 3 || currency === "USD") {
      setPreview(null);
      return;
    }

    clearTimeout(debounceRef.current);
    setPreview({ text: "Converting…", loading: true });

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await client.get("/api/v1/currencies/convert", {
          params: { from: currency, to: "USD", amount: parsed },
        });
        const converted = res.data?.converted_amount ?? res.data?.result;
        if (converted != null) {
          setPreview({
            text: `≈ USD ${Number(converted).toFixed(2)}`,
            loading: false,
          });
        } else {
          setPreview(null);
        }
      } catch {
        // Graceful mock fallback — rough estimate shown as approximate
        const mockRate = { EUR: 1.08, GBP: 1.27, INR: 0.012, AUD: 0.65, CAD: 0.74, SGD: 0.74, JPY: 0.0067, AED: 0.27, CHF: 1.13 };
        const rate = mockRate[currency];
        if (rate) {
          setPreview({
            text: `≈ USD ${(parsed * rate).toFixed(2)} (estimated)`,
            loading: false,
          });
        } else {
          setPreview(null);
        }
      }
    }, 500);
  }, []);

  return { preview, fetchPreview, clearPreview: () => setPreview(null) };
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function SubmitExpense() {
  const toast = useToast();
  const { preview, fetchPreview } = useConversionPreview();

  const {
    register,
    handleSubmit,
    watch,
    reset,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { currency: "USD", expense_date: TODAY },
  });

  // Trigger conversion preview on blur of amount or currency
  const handleConversionBlur = () => {
    const { amount, currency } = getValues();
    fetchPreview(amount, currency);
  };

  const onSubmit = async (data) => {
    const payload = {
      ...data,
      amount: parseFloat(data.amount),
    };

    try {
      await client.post("/api/v1/expenses", payload);
      toast.success("Expense submitted!", `"${data.title}" has been sent for review.`);
      reset({ currency: "USD", expense_date: TODAY });
    } catch (err) {
      toast.error("Submission failed", err.message);
    }
  };

  const watchedCurrency = watch("currency");

  return (
    <div style={styles.page}>

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div style={styles.pageHeader}>
        <div>
          <h1 style={styles.pageTitle}>Submit an Expense</h1>
          <p style={styles.pageSubtitle}>
            Fill in the details below. All submitted expenses go to your manager for approval.
          </p>
        </div>
        <div style={styles.badge}>
          <span style={styles.badgeDot} />
          Draft
        </div>
      </div>

      {/* ── Form card ────────────────────────────────────────────────────────── */}
      <section style={styles.card}>
        <p style={styles.sectionLabel}>Expense Details</p>

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <div style={styles.grid}>

            {/* Title — full width */}
            <div style={{ gridColumn: "1 / -1" }}>
              <Input
                label="Expense title"
                placeholder="e.g. Flight to client meeting in Mumbai"
                required
                error={errors.title?.message}
                {...register("title")}
              />
            </div>

            {/* Amount + Currency side by side */}
            <Input
              label="Amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0.01"
              placeholder="0.00"
              required
              error={errors.amount?.message}
              helper={
                preview
                  ? preview.loading
                    ? "Converting…"
                    : preview.text
                  : watchedCurrency !== "USD"
                  ? "Blur to see USD equivalent"
                  : undefined
              }
              {...register("amount", {
                onBlur: handleConversionBlur,
              })}
            />

            <SelectField
              label="Currency"
              required
              error={errors.currency?.message}
              {...register("currency", {
                onBlur: handleConversionBlur,
              })}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
              {/* Allow freeform codes not in the preset list */}
              {!CURRENCIES.includes(watch("currency")) && watch("currency") && (
                <option value={watch("currency")}>{watch("currency")}</option>
              )}
            </SelectField>

            {/* Category */}
            <SelectField
              label="Category"
              required
              error={errors.category?.message}
              {...register("category")}
            >
              <option value="">Select a category…</option>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </SelectField>

            {/* Date */}
            <Input
              label="Expense date"
              type="date"
              required
              max={TODAY}
              error={errors.expense_date?.message}
              {...register("expense_date")}
            />

            {/* Description — full width */}
            <div style={{ gridColumn: "1 / -1" }}>
              <TextareaField
                label="Description"
                placeholder="Provide context: purpose, who was involved, project reference, etc."
                required
                error={errors.description?.message}
                {...register("description")}
              />
            </div>

          </div>

          {/* Form footer */}
          <div style={styles.formFooter}>
            <span style={styles.requiredNote}>* Required fields</span>
            <div style={{ display: "flex", gap: 10 }}>
              <Button type="button" variant="ghost" onClick={() => reset({ currency: "USD", expense_date: TODAY })}>
                Clear form
              </Button>
              <Button type="submit" loading={isSubmitting}>
                Submit expense
              </Button>
            </div>
          </div>
        </form>
      </section>

      {/* ── Info footer ──────────────────────────────────────────────────────── */}
      <div style={styles.infoFooter}>
        <span style={styles.infoIcon}>ℹ</span>
        Submitted expenses are reviewed by your assigned manager. You will be notified once a decision is made.
      </div>

    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = {
  page: {
    minHeight: "100%",
    background: "#0d1117",
    padding: "40px 32px",
    fontFamily: "sans-serif",
    maxWidth: 860,
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: 28,
  },
  pageHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
  },
  pageTitle: {
    margin: 0,
    fontSize: 26,
    fontWeight: 700,
    color: "#f1f5f9",
    letterSpacing: "-0.3px",
  },
  pageSubtitle: {
    margin: "6px 0 0",
    fontSize: 13,
    color: "#64748b",
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    background: "rgba(100,116,139,0.15)",
    color: "#94a3b8",
    borderRadius: 20,
    padding: "4px 12px",
    fontSize: 12,
    fontWeight: 500,
    whiteSpace: "nowrap",
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "#94a3b8",
    display: "inline-block",
  },
  card: {
    background: "#151924",
    border: "1px solid #1e2330",
    borderRadius: 10,
    padding: "24px 24px 20px",
  },
  sectionLabel: {
    margin: "0 0 20px",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.08em",
    color: "#64748b",
    textTransform: "uppercase",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 18,
  },
  fieldLabel: {
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
  textarea: {
    width: "100%",
    boxSizing: "border-box",
    background: "#151924",
    border: "1px solid #2d3448",
    borderRadius: 6,
    padding: "10px 14px",
    color: "#f1f5f9",
    fontSize: 14,
    outline: "none",
    resize: "vertical",
    fontFamily: "sans-serif",
    lineHeight: 1.5,
    transition: "border-color 0.15s",
  },
  fieldError: {
    color: "#ef4444",
    fontSize: 12,
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  fieldHelper: {
    color: "#64748b",
    fontSize: 12,
  },
  formFooter: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    marginTop: 24,
    paddingTop: 18,
    borderTop: "1px solid #1e2330",
  },
  requiredNote: {
    fontSize: 12,
    color: "#4b5563",
  },
  infoFooter: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    background: "rgba(139,92,246,0.08)",
    border: "1px solid rgba(139,92,246,0.2)",
    borderRadius: 8,
    padding: "12px 16px",
    fontSize: 13,
    color: "#94a3b8",
    lineHeight: 1.5,
  },
  infoIcon: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 18,
    height: 18,
    borderRadius: "50%",
    background: "rgba(139,92,246,0.3)",
    color: "#a78bfa",
    fontSize: 11,
    fontWeight: 700,
    flexShrink: 0,
    marginTop: 1,
  },
};
