import { WorkspaceProfilePage } from "@/components/workspace-profile-page";
import { requirePermission } from "@/lib/auth";
import { getRevenueWorkingDays } from "@/lib/backend-api";

export default async function GeoHeadProfilePage() {
  const session = await requirePermission("view_dashboard");
  const workingDays = await getRevenueWorkingDays();
  return <WorkspaceProfilePage session={session} workingDays={workingDays} />;
}
