import { NextRequest, NextResponse } from "next/server";

import { canAccessRevenueWorkspace, getRevenueAccessScope, getSessionProfile } from "@/lib/auth";
import { getRevenueDashboardDataDetailed } from "@/lib/backend-api";
import { hasPermission } from "@/lib/rbac-store";

function intersectScopeValues(requested: string[], allowed: string[]) {
  if (allowed.length === 0) {
    return requested;
  }
  if (requested.length === 0) {
    return allowed;
  }

  const normalizedAllowed = new Map<string, string>();
  for (const value of allowed) {
    const key = value.trim().toLowerCase();
    if (!key || normalizedAllowed.has(key)) {
      continue;
    }
    normalizedAllowed.set(key, value);
  }

  const merged: string[] = [];
  for (const value of requested) {
    const key = value.trim().toLowerCase();
    const canonical = normalizedAllowed.get(key);
    if (canonical) {
      merged.push(canonical);
    }
  }

  return Array.from(new Set(merged));
}

export async function GET(request: NextRequest) {
  const session = await getSessionProfile();

  if (!session) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(session.role, "view_dashboard") || !canAccessRevenueWorkspace(session.role)) {
    return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
  }

  const search = request.nextUrl.searchParams;
  const scope = getRevenueAccessScope(session);
  const scopedPractices =
    scope.practiceHeads.length > 0
      ? intersectScopeValues(search.getAll("practices"), scope.practiceHeads)
      : search.getAll("practices");
  const scopedGeoHeads =
    scope.geoHeads.length > 0
      ? intersectScopeValues(search.getAll("geoHeads"), scope.geoHeads)
      : search.getAll("geoHeads");
  const scopedBdms =
    scope.bdms.length > 0
      ? intersectScopeValues(search.getAll("bdms"), scope.bdms)
      : search.getAll("bdms");
  const scopedEntities =
    scope.entities.length > 0
      ? intersectScopeValues(search.getAll("entities"), scope.entities)
      : search.getAll("entities");
  const scopedVerticals =
    scope.verticals.length > 0
      ? intersectScopeValues(search.getAll("verticals"), scope.verticals)
      : search.getAll("verticals");
  const result = await getRevenueDashboardDataDetailed({
    financialYear: search.get("financialYear"),
    financialYears: search.getAll("financialYears"),
    region: search.get("region"),
    practiceHead: search.get("practiceHead"),
    geoHead: search.get("geoHead"),
    customerName: search.get("customerName"),
    dealType: search.get("dealType"),
    businessType: search.get("businessType"),
    geographies: search.getAll("geographies"),
    practices: scopedPractices,
    geoHeads: scopedGeoHeads,
    bdms: scopedBdms,
    entities: scopedEntities,
    verticals: scopedVerticals,
    accounts: search.getAll("accounts"),
    dealTypes: search.getAll("dealTypes"),
    businessTypes: search.getAll("businessTypes"),
    periodFrom: search.get("periodFrom"),
    periodTo: search.get("periodTo"),
    comparisonMode: search.get("comparisonMode") as
      | "absolute"
      | "percentage"
      | null,
    comparisonMetric: search.get("comparisonMetric") as
      | "budget_vs_actual"
      | "actual_vs_forecast"
      | "budget_vs_forecast"
      | null,
    comparisonPeriod: search.get("comparisonPeriod") as "qoq" | "yoy" | null,
    comparePrevious: search.get("comparePrevious") === "true",
    breakdownDimension: search.get("breakdownDimension") as
      | "region"
      | "practice_head"
      | "bdm"
      | "customer_name"
      | null,
    whatIfPct: search.get("whatIfPct")
      ? Number(search.get("whatIfPct"))
      : null,
  });
  const payload = result.payload;
  const reason = payload.meta?.reason;
  const statusCode =
    payload.meta?.statusCode ??
    (reason === "unauthorized"
      ? 401
      : reason === "forbidden"
        ? 403
        : payload.meta?.dataState === "fallback"
          ? 503
          : 200);
  return NextResponse.json(payload, { status: statusCode });
}
