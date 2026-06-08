import { redirect } from "next/navigation";

import { WorkspaceShell } from "@/components/workspace-shell";
import { canAccessWorkspaceArea, getDefaultRouteForRole, requirePermission } from "@/lib/auth";
import { buildWorkspaceNav } from "@/lib/workspace-navigation";
export const dynamic = "force-dynamic";
export const revalidate = 0;


export default async function GeoHeadLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePermission("view_dashboard");

  if (!canAccessWorkspaceArea(session.role, "geo-head")) {
    redirect(getDefaultRouteForRole(session.role));
  }

  return (
    <WorkspaceShell
      session={session}
      variant="macos"
      areaLabel=""
      title=""
      description=""
      navItems={buildWorkspaceNav(session.role, "/geo-head")}
    >
      {children}
    </WorkspaceShell>
  );
}
