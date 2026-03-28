import { DataTable, Badge } from "@/components/ui/UICore";

const columns = [
  { key: "name",  header: "Name" },
  { key: "email", header: "Email" },
  {
    key: "status", header: "Status", align: "center",
    render: (v) => (
      <Badge variant={v === "active" ? "success" : "neutral"}>{String(v)}</Badge>
    ),
  },
];

<DataTable
  columns={columns}
  data={users}
  loading={isLoading}
  emptyMessage="No users found"
  onRowClick={(row) => navigate(`/users/${row.id}`)}
/>