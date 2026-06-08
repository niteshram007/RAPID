import { LazyBirdeyeAnalyticsKiosk } from "@/components/workspace-lazy-components";
import { requirePermission } from "@/lib/auth";
import { getAdminSettings } from "@/lib/backend-api";

export default async function BdmAnalyticsKioskPage() {
  await requirePermission("view_dashboard");
  const settingsResponse = await getAdminSettings();

  return (
    <LazyBirdeyeAnalyticsKiosk
      showRestrictedRoleBudgets={settingsResponse.settings.showRestrictedRoleBudgets}
    />
  );
}
