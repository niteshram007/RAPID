import { WorkspaceShell } from "@/components/workspace-shell";
import { requirePermission } from "@/lib/auth";
export const dynamic = "force-dynamic";
export const revalidate = 0;


export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requirePermission("manage_users");

  return (
    <WorkspaceShell
      session={session}
      areaLabel=""
      title="Admin command center"
      description="Superuser control surface for people, workbook ingestion, and local-LLM operating settings."
      navItems={[
        { href: "/admin", label: "Overview", icon: "overview", exact: true },
        { href: "/admin/users", label: "Users", icon: "users" },
        { href: "/admin/upload", label: "Upload", icon: "upload" },
        { href: "/admin/master-data", label: "Masterdata", icon: "master" },
        { href: "/admin/forecast", label: "Forecast", icon: "forecast" },
        { href: "/admin/audit", label: "Audit Log", icon: "session" },
        { href: "/admin/settings", label: "Settings", icon: "settings" },
      ]}
    >
      {children}
    </WorkspaceShell>
  );
}
