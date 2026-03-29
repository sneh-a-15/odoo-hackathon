import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import client from "../../api/client";
import { Input, Button, Badge, DataTable, useToast } from "../../components/ui/UICore";

//  Validation schema 

const schema = z.object({
  full_name:  z.string().min(2, "Full name must be at least 2 characters"),
  email:      z.string().email("Enter a valid email address"),
  role:       z.enum(["employee", "manager"], { required_error: "Select a role" }),
  password:   z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/\d/, "Password must contain at least one number"),
  manager_id: z.string().optional(),
});

//  Role badge mapping 

const ROLE_BADGE = {
  admin:    "error",
  manager:  "pending",
  employee: "success",
};

//  Table columns 

const columns = [
  { key: "full_name", header: "Name" },
  { key: "email",     header: "Email" },
  {
    key: "role",
    header: "Role",
    render: (v) => (
      <Badge variant={ROLE_BADGE[v] ?? "neutral"}>
        {v ?? ""}
      </Badge>
    ),
  },
  {
    key: "manager_id",
    header: "Manager ID",
    render: (v) => (
      <span style={{ color: "#64748b", fontSize: 13, fontFamily: "monospace" }}>
        {v ?? ""}
      </span>
    ),
  },
  {
    key: "_actions",
    header: "",
    align: "right",
    render: () => null, // placeholder for future Delete action
  },
];

//  Shared select style (matches UICore aesthetic) 

const selectStyle = (hasError) => ({
  width: "100%",
  boxSizing: "border-box",
  background: "#151924",
  border: `1px solid ${hasError ? "#ef4444" : "#2d3448"}`,
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
});

function SelectField({ label, error, helper, children, required, ...props }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {label && (
        <label style={{
          fontSize: 11, fontWeight: 600, letterSpacing: "0.08em",
          color: "#94a3b8", textTransform: "uppercase",
        }}>
          {label}
          {required && <span style={{ color: "#ef4444", marginLeft: 3 }}>*</span>}
        </label>
      )}
      <select style={selectStyle(!!error)} {...props}>
        {children}
      </select>
      {error  && <span style={{ color: "#ef4444", fontSize: 12 }}> {error}</span>}
      {helper && !error && <span style={{ color: "#64748b", fontSize: 12 }}>{helper}</span>}
    </div>
  );
}

//  Component 

export default function UserManagement() {
  const toast = useToast();

  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema) });

  const watchedRole = watch("role");

  //  Fetch users on mount 
  useEffect(() => {
    let cancelled = false;

    client.get("/api/v1/users")
      .then((res) => { if (!cancelled) setUsers(res.data); })
      .catch((err) => toast.error("Failed to load users", err.message))
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, []);

  //  Submit new user 
  const onSubmit = async (data) => {
    // Strip manager_id if role is manager or field is empty
    const payload = { ...data };
    if (!payload.manager_id || payload.role === "manager") {
      delete payload.manager_id;
    }

    try {
      const res = await client.post("/api/v1/users", payload);
      setUsers((prev) => [res.data, ...prev]); // optimistic prepend
      toast.success("User created", `${res.data.full_name} was added successfully.`);
      reset();
    } catch (err) {
      toast.error("Failed to create user", err.message);
    }
  };

  //  Managers available for the dropdown 
  const managers = users.filter((u) => u.role === "manager" || u.role === "admin");

  //  Render 
  return (
    <div style={styles.page}>

      {/*  Page header  */}
      <div style={styles.pageHeader}>
        <div>
          <h1 style={styles.pageTitle}>User Management</h1>
          <p style={styles.pageSubtitle}>Create accounts and manage team members across your organisation.</p>
        </div>
        <Badge variant={loading ? "neutral" : "success"}>
          {loading ? "Loading" : `${users.length} users`}
        </Badge>
      </div>

      {/*  Create User form  */}
      <section style={styles.card}>
        <p style={styles.sectionLabel}>Create New User</p>

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <div style={styles.grid}>

            <Input
              label="Full name"
              placeholder="Jane Smith"
              required
              error={errors.full_name?.message}
              {...register("full_name")}
            />

            <Input
              label="Email address"
              type="email"
              placeholder="jane@acme.com"
              required
              error={errors.email?.message}
              {...register("email")}
            />

            <SelectField
              label="Role"
              required
              error={errors.role?.message}
              {...register("role")}
            >
              <option value="">Select a role</option>
              <option value="employee">Employee</option>
              <option value="manager">Manager</option>
            </SelectField>

            {/* Manager dropdown  only shown for employees */}
            {watchedRole === "employee" && (
              <SelectField
                label="Manager"
                helper="Optional  assign a direct manager."
                error={errors.manager_id?.message}
                {...register("manager_id")}
              >
                <option value="">No manager assigned</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name} ({m.email})
                  </option>
                ))}
              </SelectField>
            )}

            <Input
              label="Password"
              type="password"
              placeholder="Min 8 chars, 1 number"
              required
              error={errors.password?.message}
              {...register("password")}
            />

          </div>

          <div style={styles.formFooter}>
            <Button type="button" variant="ghost" onClick={() => reset()}>
              Clear form
            </Button>
            <Button type="submit" loading={isSubmitting}>
              + Create user
            </Button>
          </div>
        </form>
      </section>

      {/*  Users table  */}
      <section>
        <p style={styles.sectionLabel}>All Users</p>
        <DataTable
          columns={columns}
          data={users}
          loading={loading}
          emptyMessage="No users yet  create one above."
        />
      </section>

    </div>
  );
}

//  Styles 

const styles = {
  page: {
    minHeight: "100vh",
    background: "#0d1117",
    padding: "40px 32px",
    fontFamily: "sans-serif",
    maxWidth: 960,
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: 32,
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
  card: {
    background: "#151924",
    border: "1px solid #1e2330",
    borderRadius: 10,
    padding: "24px 24px 20px",
  },
  sectionLabel: {
    margin: "0 0 16px",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.08em",
    color: "#64748b",
    textTransform: "uppercase",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
  },
  formFooter: {
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 10,
    marginTop: 20,
    paddingTop: 16,
    borderTop: "1px solid #1e2330",
  },
};
