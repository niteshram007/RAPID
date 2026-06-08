const SHARED_WORKSPACE_QUERY_KEYS = [
  "dashboardTimeframe",
  "dashboardMonth",
  "dashboardQuarter",
  "financialYear",
  "financialYears",
  "periodFrom",
  "periodTo",
  "customerNames",
  "msps",
  "rowUs",
  "salesRegions",
  "entities",
  "strategicAccounts",
  "dealTypes",
  "eeennns",
  "projectNames",
  "practiceHeads",
  "bdms",
  "geoHeads",
  "verticals",
  "horizontals",
] as const;

type SearchParamsLike = Pick<URLSearchParams, "getAll">;

export function buildSharedWorkspaceSearch(searchParams: SearchParamsLike) {
  const next = new URLSearchParams();
  for (const key of SHARED_WORKSPACE_QUERY_KEYS) {
    for (const value of searchParams.getAll(key)) {
      const normalized = value.trim();
      if (normalized) {
        next.append(key, normalized);
      }
    }
  }
  return next;
}

export function appendSharedWorkspaceSearch(
  href: string,
  searchParams: SearchParamsLike,
) {
  const [pathname, existingQuery = ""] = href.split("?");
  const next = new URLSearchParams(existingQuery);
  const shared = buildSharedWorkspaceSearch(searchParams);
  for (const key of SHARED_WORKSPACE_QUERY_KEYS) {
    next.delete(key);
    for (const value of shared.getAll(key)) {
      next.append(key, value);
    }
  }
  const query = next.toString();
  return query ? `${pathname}?${query}` : pathname;
}
