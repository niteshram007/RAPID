import { RapidRevenueOverviewPage } from "@/components/rapid-revenue-overview";
import { getRevenueAccessScope, requirePermission } from "@/lib/auth";
import { getAdminSettings, getRevenueOverviewDataDetailed } from "@/lib/backend-api";
import { readRapidRevenueFiltersFromSearch } from "@/lib/rapid-revenue";
import {
  getRapidRevenueOverview,
  mergeScopedRevenueFilters,
} from "@/lib/rapid-revenue-server";
import {
  buildRevenueDashboardFiltersFromSearchParams,
  mergeScopedRevenueDashboardFilters,
} from "@/lib/revenue-dashboard-search";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function toSearchParams(query: Record<string, string | string[] | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      value
        .map((entry) => String(entry).trim())
        .filter(Boolean)
        .forEach((entry) => search.append(key, entry));
      continue;
    }
    const normalized = String(value ?? "").trim();
    if (normalized) {
      search.set(key, normalized);
    }
  }
  return search;
}

export default async function PracticeHeadPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requirePermission("view_dashboard");
  const query = await searchParams;
  const requested = readRapidRevenueFiltersFromSearch(toSearchParams(query));
  const scope = getRevenueAccessScope(session);
  const [overview, dashboardSummaryResult, settingsResponse] = await Promise.all([
    getRapidRevenueOverview(mergeScopedRevenueFilters(session, requested)),
    getRevenueOverviewDataDetailed(
      mergeScopedRevenueDashboardFilters(
        buildRevenueDashboardFiltersFromSearchParams(query),
        scope,
      ),
    ),
    getAdminSettings(),
  ]);

  return (
    <RapidRevenueOverviewPage
      eyebrow="Practice Head"
      title="Practice revenue workspace"
      description="Review the active RAPID revenue book for your practice, compare contribution, and open the Excel-style pivot table without exposing other practices."
      basePath="/practice-head"
      overview={overview}
      analyticsData={dashboardSummaryResult.payload}
      analyticsMeta={dashboardSummaryResult.meta}
      showRestrictedRoleBudgets={settingsResponse.settings.showRestrictedRoleBudgets}
    />
  );
}
