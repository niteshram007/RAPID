import { DrillDownFullPage } from "@/components/drilldown/drilldown-full-page";
import { requirePermission } from "@/lib/auth";

export default async function GeoHeadDrillDownPage() {
  await requirePermission("view_dashboard");
  return <DrillDownFullPage />;
}
