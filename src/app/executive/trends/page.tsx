import { TrendsComparisonDashboard } from "@/components/trends-comparison-dashboard";
import { requirePermission } from "@/lib/auth";

export default async function ExecutiveTrendsPage({
  searchParams: _searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("view_dashboard");
  void _searchParams;
  return <TrendsComparisonDashboard />;
}
