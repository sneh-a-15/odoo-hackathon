import { BrowserRouter } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input, Button, Badge, DataTable, useToast } from "@/components/ui/UICore";

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Minimum 8 characters required"),
});

function TestPage() {
  const { success, error } = useToast();

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data) => {
    await new Promise((r) => setTimeout(r, 1500)); // simulate API
    success("Logged in!", "Welcome back.");
  };

  const columns = [
    { key: "name", header: "Name" },
    { key: "email", header: "Email" },
    { key: "role", header: "Role" },
    {
      key: "status", header: "Status", align: "center",
      render: (v) => (
        <Badge variant={v === "active" ? "success" : v === "pending" ? "pending" : "neutral"}>
          {v}
        </Badge>
      ),
    },
  ];

  const data = [
    { id: 1, name: "Sneha", email: "sneha@test.com", role: "Admin", status: "active" },
    { id: 2, name: "John", email: "john@test.com", role: "Developer", status: "pending" },
    { id: 3, name: "Carol", email: "carol@test.com", role: "Analyst", status: "inactive" },
  ];

  return (
    <div style={{ background: "#0f1117", minHeight: "100vh", padding: "40px", fontFamily: "sans-serif" }}>
      <div style={{ maxWidth: 860, margin: "0 auto", display: "flex", flexDirection: "column", gap: 40 }}>

        {/* Section 1 - Inputs */}
        <section>
          <p style={{ color: "#64748b", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>1 — Input Field</p>
          <div style={{ background: "#151924", borderRadius: 10, padding: 24, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Input label="Email Address" type="email" defaultValue="alice@odoo.com" required helper="Used for login and notifications." />
            <Input label="Password" type="password" defaultValue="abc" required error="Password must be at least 8 characters" />
            <Input label="Full Name" defaultValue="Jane Doe" />
            <Input label="Company ID" placeholder="ORG-00412" disabled helper="Auto-assigned by system." />
          </div>
        </section>

        {/* Section 2 - Buttons */}
        <section>
          <p style={{ color: "#64748b", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>2 — Button</p>
          <div style={{ background: "#151924", borderRadius: 10, padding: 24, display: "flex", flexWrap: "wrap", gap: 12 }}>
            <Button>Save changes</Button>
            <Button variant="outline">Cancel</Button>
            <Button variant="outline">Learn more</Button>
            <Button variant="danger">🗑 Delete record</Button>
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
            <Button loading>Saving...</Button>
            <Button disabled>Disabled</Button>
          </div>
        </section>

        {/* Section 3 - DataTable */}
        <section>
          <p style={{ color: "#64748b", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>3 — Data Table</p>
          <DataTable columns={columns} data={data} loading emptyMessage="No users found" onRowClick={(r) => success("Row clicked", r.name)} />
        </section>

        {/* Section 4 - Login Form */}
        <section>
          <p style={{ color: "#64748b", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>4 — Login Form</p>
          <div style={{ background: "#151924", borderRadius: 10, padding: 24, maxWidth: 400 }}>
            <form onSubmit={handleSubmit(onSubmit)} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Input label="Email" type="email" error={errors.email?.message} {...register("email")} />
              <Input label="Password" type="password" error={errors.password?.message} {...register("password")} />
              <Button loading={isSubmitting} type="submit">Sign in</Button>
            </form>
          </div>
        </section>

        {/* Section 5 - Toasts */}
        <section>
          <p style={{ color: "#64748b", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>5 — Toasts</p>
          <div style={{ background: "#151924", borderRadius: 10, padding: 24, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Button onClick={() => success("Record saved", "User was created successfully.")}>Success</Button>
            <Button onClick={() => error("Something went wrong", "Email is already registered.")}>Error</Button>
            <Button onClick={() => useToast().warning?.("Session expiring", "You'll be logged out in 5 minutes.")}>Warning</Button>
          </div>
        </section>

      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <TestPage />
    </BrowserRouter>
  );
}