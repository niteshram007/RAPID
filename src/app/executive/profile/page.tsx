import { redirect } from "next/navigation";

import { WorkspaceProfilePage } from "@/components/workspace-profile-page";
import {
  canAccessWorkspaceArea,
  getDefaultRouteForRole,
  requirePermission,
} from "@/lib/auth";
import { getAdminActivityOverview, getRevenueWorkingDays } from "@/lib/backend-api";

export default async function ExecutiveProfilePage() {
  const session = await requirePermission("view_dashboard");
  if (!canAccessWorkspaceArea(session.role, "executive")) {
    redirect(getDefaultRouteForRole(session.role));
  }
  const [activityOverview, workingDays] = await Promise.all([
    getAdminActivityOverview(300),
    getRevenueWorkingDays(),
  ]);
  return (
    <WorkspaceProfilePage
      session={session}
      activityOverview={activityOverview}
      workingDays={workingDays}
    />
  );
}
