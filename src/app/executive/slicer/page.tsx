import { LazyBirdeyeAnalyticsKiosk } from "@/components/workspace-lazy-components";
import { requirePermission } from "@/lib/auth";

export default async function ExecutiveSlicerPage() {
  await requirePermission("view_dashboard");

  return <LazyBirdeyeAnalyticsKiosk />;
}

