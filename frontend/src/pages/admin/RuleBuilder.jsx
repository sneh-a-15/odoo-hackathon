import { useEffect, useState } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import client from "../../api/client";
import { Input, Button, Badge, useToast } from "../../components/ui/UICore";

// ─── Validation schema ─────────────────────────────────────────────────────────

const stepSchema = z.object({
  approver_user_id:   z.string().uuid("Select a valid approver"),
  step_order:         z.number().int().min(1).optional(),
  is_manager_approver: z.boolean().default(false),
});

const schema = z
  .object({
    name:                 z.string().min(2, "Rule name must be at least 2 characters"),
    rule_type:            z.enum(["percentage", "key_approver", "hybrid"]),
    percentage_threshold: z.coerce
      .number()
      .min(1, "Must be between 1 and 100")
      .max(100, "Must be between 1 and 100")
      .optional()
      .nullable(),
    key_approver_id:      z.string().uuid("Select a valid approver").optional().nullable(),
    steps:                z.array(stepSchema).min(1, "Add at least one approval step"),
  })
  .superRefine((data, ctx) => {
    if (
      (data.rule_type === "percentage" || data.rule_type === "hybrid") &&
      (data.percentage_threshold == null || isNaN(data.percentage_threshold))
    ) {
      ctx.addIssue({
        path: ["percentage_threshold"],
        code: z.ZodIssueCode.custom,
        message: "Threshold is required for this rule type",
      });
    }
    if (
      (data.rule_type === "key_approver" || data.rule_type === "hybrid") &&
      !data.key_approver_id
    ) {
      ctx.addIssue({
        path: ["key_approver_id"],
        code: z.ZodIssueCode.custom,
        message: "Key approver is required for this rule type",
      });
    }
    
    const managerApprovers = data.steps.filter(s => s.is_manager_approver).length;
    if (managerApprovers > 1) {
      ctx.addIssue({
        path: ["steps"],
        code: z.ZodIssueCode.custom,
        message: "Only one step can be assigned as the Manager approver.",
      });
    }
  });

// ─── Rule type config ──────────────────────────────────────────────────────────

const RULE_TYPES = [
  {
    value:       "percentage",
    label:       "Percentage Threshold",
    description: "Auto-approves when enough approvers approve (e.g. 60%)",
    badge:       "pending",
  },
  {
    value:       "key_approver",
    label:       "Key Approver",
    description: "Always routes to a specific designated approver",
    badge:       "success",
  },
  {
    value:       "hybrid",
    label:       "Hybrid",
    description: "Combines percentage threshold with a fixed key approver",
    badge:       "trial",
  },
];

// ─── Sub-components ────────────────────────────────────────────────────────────

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
        style={{ ...styles.select, borderColor: error ? "#ef4444" : "#2d3448" }}
        {...props}
      >
        {children}
      </select>
      {error  && <span style={styles.fieldError}>⊙ {error}</span>}
      {helper && !error && <span style={styles.fieldHelper}>{helper}</span>}
    </div>
  );
}

function SectionLabel({ children }) {
  return <p style={styles.sectionLabel}>{children}</p>;
}

function Divider() {
  return <div style={{ borderTop: "1px solid #1e2330", margin: "4px 0" }} />;
}

// Toggle pill for is_manager_approver
function Toggle({ value, onChange, label, disabled }) {
  return (
    <button
      type="button"
      onClick={() => { if (!disabled) onChange(!value); }}
      style={{
        display:        "inline-flex",
        alignItems:     "center",
        gap:            8,
        background:     "transparent",
        border:         "none",
        cursor:         disabled ? "not-allowed" : "pointer",
        padding:        0,
        color:          disabled ? "#4b5563" : (value ? "#a78bfa" : "#64748b"),
        fontSize:       13,
        fontWeight:     500,
        whiteSpace:     "nowrap",
        userSelect:     "none",
        opacity:        disabled ? 0.6 : 1,
      }}
    >
      <span style={{
        width:        36,
        height:       20,
        borderRadius: 10,
        background:   value ? "rgba(139,92,246,0.35)" : "#1e2330",
        border:       `1px solid ${value ? "#7c3aed" : "#2d3448"}`,
        position:     "relative",
        transition:   "background 0.2s, border-color 0.2s",
        flexShrink:   0,
        opacity:      disabled && !value ? 0.5 : 1,
      }}>
        <span style={{
          position:   "absolute",
          top:        2,
          left:       value ? 17 : 2,
          width:      14,
          height:     14,
          borderRadius: "50%",
          background:   value ? (disabled ? "#7e6cac" : "#a78bfa") : "#4b5563",
          transition: "left 0.2s, background 0.2s",
        }} />
      </span>
      {label}
    </button>
  );
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function RuleBuilder() {
  const toast = useToast();

  const [approvers,       setApprovers]       = useState([]);
  const [approversLoading, setApproversLoading] = useState(true);
  const [existingRuleId,  setExistingRuleId]  = useState(null);
  const [loadingRule,     setLoadingRule]     = useState(true);

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      name:                 "",
      rule_type:            "percentage",
      percentage_threshold: null,
      key_approver_id:      null,
      steps:                [{ approver_user_id: "", step_order: 1, is_manager_approver: false }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "steps" });

  const watchedRuleType = watch("rule_type");
  const needsThreshold  = watchedRuleType === "percentage" || watchedRuleType === "hybrid";
  const needsApprover   = watchedRuleType === "key_approver" || watchedRuleType === "hybrid";

  const stepsWatch = watch("steps");
  const hasManagerIndex = stepsWatch?.findIndex(s => s.is_manager_approver) ?? -1;

  // ── Fetch approvers (managers + admins) and existing rule ──────────────────
  useEffect(() => {
    let cancelled = false;
    
    Promise.all([
      client.get("/api/v1/users"),
      client.get("/api/v1/approval-rules")
    ])
      .then(([usersRes, rulesRes]) => {
        if (cancelled) return;
        setApprovers((usersRes.data ?? []).filter((u) => u.role === "manager" || u.role === "admin"));
        
        if (rulesRes.data && rulesRes.data.length > 0) {
          const rule = rulesRes.data[0];
          setExistingRuleId(rule.id);
          reset({
            name: rule.name,
            rule_type: rule.rule_type,
            percentage_threshold: rule.percentage_threshold,
            key_approver_id: rule.key_approver_id,
            steps: rule.steps.length > 0 ? rule.steps.map(s => ({
              approver_user_id: s.approver_user_id,
              step_order: s.step_order,
              is_manager_approver: s.is_manager_approver,
            })) : [{ approver_user_id: "", step_order: 1, is_manager_approver: false }],
          });
        }
      })
      .catch((err) => toast.error("Failed to load data", err.message))
      .finally(() => { 
        if (!cancelled) { 
          setApproversLoading(false); 
          setLoadingRule(false); 
        } 
      });
      
    return () => { cancelled = true; };
  }, [reset, toast]);

  // ── Submit ─────────────────────────────────────────────────────────────────
  const onSubmit = async (data) => {
    // Re-index step_order to be contiguous (1, 2, 3 …) regardless of what the user entered
    const payload = {
      name:                 data.name,
      rule_type:            data.rule_type,
      percentage_threshold: needsThreshold  ? data.percentage_threshold : null,
      key_approver_id:      needsApprover   ? data.key_approver_id      : null,
      steps: data.steps.map((step, idx) => ({
        approver_user_id:    step.approver_user_id,
        step_order:          idx + 1,
        is_manager_approver: step.is_manager_approver ?? false,
      })),
    };

    try {
      if (existingRuleId) {
        await client.patch(`/api/v1/approval-rules/${existingRuleId}`, payload);
        toast.success("Rule updated!", `"${payload.name}" is now the active rule.`);
      } else {
        const res = await client.post("/api/v1/approval-rules", payload);
        setExistingRuleId(res.data.id);
        toast.success("Rule created!", `"${payload.name}" is now the active rule.`);
      }
    } catch (err) {
      toast.error("Failed to save rule", err.message);
    }
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const addStep = () =>
    append({ approver_user_id: "", step_order: fields.length + 1, is_manager_approver: false });

  const selectedRuleType = RULE_TYPES.find((r) => r.value === watchedRuleType);

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={styles.page}>

      {/* ── Page header ────────────────────────────────────────────────────── */}
      <div style={styles.pageHeader}>
        <div>
          <h1 style={styles.pageTitle}>Approval Rule Builder</h1>
          <p style={styles.pageSubtitle}>
            Define multi-step approval chains that automatically trigger based on expense criteria.
          </p>
        </div>
        {selectedRuleType && (
          <Badge variant={selectedRuleType.badge}>
            {selectedRuleType.label}
          </Badge>
        )}
      </div>

      {existingRuleId && (
        <div style={{ background: "rgba(234,179,8,0.1)", border: "1px solid rgba(234,179,8,0.2)", padding: "12px 16px", borderRadius: 8, marginBottom: 24, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ color: "#eab308", fontWeight: 700, fontSize: 16 }}>⚠</span>
          <span style={{ fontSize: 13, color: "#fef08a", lineHeight: 1.5 }}>
            <strong>Active Rule Loaded</strong> — You are editing the company's single active approval rule. Any changes saved here will immediately overwrite the current rule.
          </span>
        </div>
      )}

      {loadingRule && (
        <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>Loading your rule configuration...</div>
      )}

      {!loadingRule && (
        <form onSubmit={handleSubmit(onSubmit)} noValidate style={{ display: "flex", flexDirection: "column", gap: 24 }}>

        {/* ── Section 1: Basic info ───────────────────────────────────────── */}
        <section style={styles.card}>
          <SectionLabel>1 — Rule Identity</SectionLabel>
          <Divider />
          <div style={{ ...styles.grid, marginTop: 20 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <Input
                label="Rule name"
                placeholder="e.g. Senior Manager Sign-off"
                required
                error={errors.name?.message}
                {...register("name")}
              />
            </div>

            {/* Rule type cards */}
            <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={styles.fieldLabel}>
                Rule type <span style={{ color: "#ef4444", marginLeft: 3 }}>*</span>
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                {RULE_TYPES.map((rt) => {
                  const active = watchedRuleType === rt.value;
                  return (
                    <label
                      key={rt.value}
                      style={{
                        ...styles.ruleTypeCard,
                        borderColor: active ? "#7c3aed" : "#2d3448",
                        background:  active ? "rgba(124,58,237,0.08)" : "#0f1117",
                        cursor:      "pointer",
                      }}
                    >
                      <input
                        type="radio"
                        value={rt.value}
                        style={{ display: "none" }}
                        {...register("rule_type")}
                      />
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: active ? "#c4b5fd" : "#f1f5f9" }}>
                          {rt.label}
                        </span>
                        <span style={{
                          width: 14, height: 14, borderRadius: "50%",
                          border: `2px solid ${active ? "#7c3aed" : "#4b5563"}`,
                          background: active ? "#7c3aed" : "transparent",
                          flexShrink: 0,
                          display: "inline-block",
                        }} />
                      </div>
                      <span style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>
                        {rt.description}
                      </span>
                    </label>
                  );
                })}
              </div>
              {errors.rule_type && (
                <span style={styles.fieldError}>⊙ {errors.rule_type.message}</span>
              )}
            </div>
          </div>
        </section>

        {/* ── Section 2: Conditional rule config ─────────────────────────── */}
        {(needsThreshold || needsApprover) && (
          <section style={styles.card}>
            <SectionLabel>2 — Rule Configuration</SectionLabel>
            <Divider />
            <div style={{ ...styles.grid, marginTop: 20 }}>

              {needsThreshold && (
                <Input
                  label="Percentage threshold (%)"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={100}
                  placeholder="e.g. 75"
                  required
                  helper="Expense auto-approves when this % of approvers have approved."
                  error={errors.percentage_threshold?.message}
                  {...register("percentage_threshold")}
                />
              )}

              {needsApprover && (
                <SelectField
                  label="Key approver"
                  required
                  error={errors.key_approver_id?.message}
                  helper="This person will always be included in the approval chain."
                  disabled={approversLoading}
                  {...register("key_approver_id")}
                >
                  <option value="">
                    {approversLoading ? "Loading approvers…" : "Select key approver…"}
                  </option>
                  {approvers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name} — {u.role} ({u.email})
                    </option>
                  ))}
                </SelectField>
              )}

            </div>
          </section>
        )}

        {/* ── Section 3: Approval steps ───────────────────────────────────── */}
        <section style={styles.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <SectionLabel>{needsThreshold || needsApprover ? "3" : "2"} — Approval Steps</SectionLabel>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={addStep}
              disabled={approversLoading}
            >
              + Add step
            </Button>
          </div>
          <Divider />

          {errors.steps?.root && (
            <div style={{ ...styles.fieldError, marginTop: 12 }}>
              ⊙ {errors.steps.root.message ?? errors.steps.message}
            </div>
          )}
          {typeof errors.steps?.message === "string" && (
            <div style={{ ...styles.fieldError, marginTop: 12 }}>
              ⊙ {errors.steps.message}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
            {fields.map((field, index) => (
              <div key={field.id} style={styles.stepRow}>

                {/* Step number badge */}
                <div style={styles.stepNumber}>{index + 1}</div>

                {/* Approver select */}
                <div style={{ flex: 2, minWidth: 0 }}>
                  <SelectField
                    label="Approver"
                    required
                    error={errors.steps?.[index]?.approver_user_id?.message}
                    disabled={approversLoading}
                    {...register(`steps.${index}.approver_user_id`)}
                  >
                    <option value="">
                      {approversLoading ? "Loading…" : "Select approver…"}
                    </option>
                    {approvers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name} ({u.role})
                      </option>
                    ))}
                  </SelectField>
                </div>

                {/* Is manager approver toggle */}
                <div style={{ display: "flex", flexDirection: "column", gap: 4, justifyContent: "flex-end", paddingBottom: 2 }}>
                  <label style={{ ...styles.fieldLabel, marginBottom: 4 }}>Manager approver</label>
                  <Controller
                    control={control}
                    name={`steps.${index}.is_manager_approver`}
                    render={({ field: f }) => {
                      const isDisabled = hasManagerIndex !== -1 && hasManagerIndex !== index;
                      return (
                        <Toggle
                          value={f.value}
                          onChange={f.onChange}
                          label={f.value ? "Yes" : "No"}
                          disabled={isDisabled}
                        />
                      );
                    }}
                  />
                </div>

                {/* Remove button */}
                <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 2 }}>
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    disabled={fields.length === 1}
                    style={{
                      background:   "transparent",
                      border:       "1px solid #2d3448",
                      borderRadius: 6,
                      color:        fields.length === 1 ? "#2d3448" : "#ef4444",
                      cursor:       fields.length === 1 ? "not-allowed" : "pointer",
                      padding:      "6px 10px",
                      fontSize:     16,
                      lineHeight:   1,
                      transition:   "color 0.15s, border-color 0.15s",
                    }}
                    title="Remove step"
                  >
                    ×
                  </button>
                </div>

              </div>
            ))}
          </div>

          {/* Step order note */}
          {fields.length > 1 && (
            <p style={{ margin: "14px 0 0", fontSize: 12, color: "#4b5563" }}>
              ↑ Step order is determined by position. Drag-to-reorder coming soon.
              <code style={{ marginLeft: 6, color: "#64748b" }}>step_order</code> values will be auto-assigned 1–{fields.length} on submit.
            </p>
          )}
        </section>

        <div style={styles.formFooter}>
          <span style={styles.requiredNote}>* Required fields</span>
          <div style={{ display: "flex", gap: 10 }}>
            <Button type="submit" loading={isSubmitting}>
              {existingRuleId ? "Update rule" : "Create rule"}
            </Button>
          </div>
        </div>

      </form>
      )}
    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = {
  page: {
    minHeight:      "100%",
    background:     "#0d1117",
    padding:        "40px 32px",
    fontFamily:     "sans-serif",
    maxWidth:       900,
    margin:         "0 auto",
    display:        "flex",
    flexDirection:  "column",
    gap:            0,
  },
  pageHeader: {
    display:        "flex",
    alignItems:     "flex-start",
    justifyContent: "space-between",
    gap:            16,
    marginBottom:   32,
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
  card: {
    background:   "#151924",
    border:       "1px solid #1e2330",
    borderRadius: 10,
    padding:      "20px 24px 24px",
    marginBottom: 24,
  },
  sectionLabel: {
    margin:          0,
    fontSize:        11,
    fontWeight:      600,
    letterSpacing:   "0.08em",
    color:           "#64748b",
    textTransform:   "uppercase",
  },
  grid: {
    display:             "grid",
    gridTemplateColumns: "1fr 1fr",
    gap:                 18,
  },
  fieldLabel: {
    fontSize:      11,
    fontWeight:    600,
    letterSpacing: "0.08em",
    color:         "#94a3b8",
    textTransform: "uppercase",
  },
  select: {
    width:                 "100%",
    boxSizing:             "border-box",
    background:            "#151924",
    border:                "1px solid #2d3448",
    borderRadius:          6,
    padding:               "10px 14px",
    color:                 "#f1f5f9",
    fontSize:              14,
    outline:               "none",
    cursor:                "pointer",
    appearance:            "none",
    backgroundImage:       `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
    backgroundRepeat:      "no-repeat",
    backgroundPosition:    "right 14px center",
    paddingRight:          36,
  },
  fieldError: {
    color:     "#ef4444",
    fontSize:  12,
    display:   "flex",
    alignItems: "center",
    gap:       4,
  },
  fieldHelper: {
    color:    "#64748b",
    fontSize: 12,
  },
  ruleTypeCard: {
    borderRadius: 8,
    border:       "1px solid #2d3448",
    padding:      "14px 16px",
    transition:   "border-color 0.15s, background 0.15s",
    userSelect:   "none",
  },
  stepRow: {
    display:        "grid",
    gridTemplateColumns: "32px 1fr auto auto",
    gap:            14,
    alignItems:     "flex-start",
    background:     "#0f1117",
    border:         "1px solid #1e2330",
    borderRadius:   8,
    padding:        "14px 16px",
  },
  stepNumber: {
    width:          28,
    height:         28,
    borderRadius:   "50%",
    background:     "rgba(124,58,237,0.15)",
    border:         "1px solid rgba(124,58,237,0.3)",
    color:          "#a78bfa",
    fontSize:       12,
    fontWeight:     700,
    display:        "flex",
    alignItems:     "center",
    justifyContent: "center",
    flexShrink:     0,
    marginTop:      22,   // aligns with select input top edge
  },
  formFooter: {
    display:        "flex",
    justifyContent: "space-between",
    alignItems:     "center",
    gap:            10,
    paddingTop:     4,
  },
  requiredNote: {
    fontSize: 12,
    color:    "#4b5563",
  },
};