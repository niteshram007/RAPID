import { RapidRevenueOverviewPage } from "@/components/rapid-revenue-overview";
import { getRevenueAccessScope, requirePermission } from "@/lib/auth";
import { getRevenueOverviewDataDetailed } from "@/lib/backend-api";
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

export default async function BuhPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requirePermission("view_dashboard");
  const query = await searchParams;
  const requested = readRapidRevenueFiltersFromSearch(toSearchParams(query));
  const scope = getRevenueAccessScope(session);
  const [overview, dashboardSummaryResult] = await Promise.all([
    getRapidRevenueOverview(mergeScopedRevenueFilters(session, requested)),
    getRevenueOverviewDataDetailed(
      mergeScopedRevenueDashboardFilters(
        buildRevenueDashboardFiltersFromSearchParams(query),
        scope,
      ),
    ),
  ]);

  return (
    <RapidRevenueOverviewPage
      eyebrow="BUH"
      title="Business unit workspace"
      description="Review only the entities, verticals, geo heads, and BDMs allocated to your business unit."
      basePath="/buh"
      overview={overview}
      analyticsData={dashboardSummaryResult.payload}
      analyticsMeta={dashboardSummaryResult.meta}
    />
  );
}
