import { NextRequest, NextResponse } from "next/server";

import { canAccessRevenueWorkspace, getSessionProfile } from "@/lib/auth";
import {
  readRapidRevenueFiltersFromSearch,
  type RevenueBudgetKioskResponse,
  type RevenueDataMeta,
  type RevenueMetaReason,
} from "@/lib/rapid-revenue";
import {
  getRapidRevenueBudgetKioskDetailed,
  mergeScopedRevenueFilters,
} from "@/lib/rapid-revenue-server";
import { hasPermission } from "@/lib/rbac-store";

function emptyBudgetKioskPayload(
  financialYear: string,
  periodFrom: string,
  periodTo: string,
): RevenueBudgetKioskResponse {
  return {
    database: {
      status: "offline",
      message: "Budget kiosk data is unavailable.",
    },
    financialYear,
    periodFrom,
    periodTo,
    tables: {},
  };
}

function toResponseWithMeta(
  payload: RevenueBudgetKioskResponse,
  meta: RevenueDataMeta,
): RevenueBudgetKioskResponse {
  return {
    ...payload,
    meta,
  };
}

function resolveFailurePayload(
  reason: RevenueMetaReason,
  financialYear: string,
  periodFrom: string,
  periodTo: string,
): RevenueBudgetKioskResponse {
  return toResponseWithMeta(
    emptyBudgetKioskPayload(financialYear, periodFrom, periodTo),
    {
      dataState: "fallback",
      reason,
      lastSuccessAt: null,
    },
  );
}

export async function GET(request: NextRequest) {
  const requested = readRapidRevenueFiltersFromSearch(request.nextUrl.searchParams);
  const fallbackFinancialYear = String(requested.financialYear ?? "").trim();
  const fallbackPeriodFrom = String(requested.periodFrom ?? "Apr").trim().slice(0, 3) || "Apr";
  const fallbackPeriodTo = String(requested.periodTo ?? "Mar").trim().slice(0, 3) || "Mar";
  const session = await getSessionProfile();

  if (!session) {
    return NextResponse.json(
      resolveFailurePayload(
        "unauthorized",
        fallbackFinancialYear,
        fallbackPeriodFrom,
        fallbackPeriodTo,
      ),
      { status: 401 },
    );
  }

  if (
    !hasPermission(session.role, "view_dashboard") ||
    !canAccessRevenueWorkspace(session.role)
  ) {
    return NextResponse.json(
      resolveFailurePayload(
        "forbidden",
        fallbackFinancialYear,
        fallbackPeriodFrom,
        fallbackPeriodTo,
      ),
      { status: 403 },
    );
  }

  const scoped = mergeScopedRevenueFilters(session, requested);
  const result = await getRapidRevenueBudgetKioskDetailed(scoped);
  const payload = toResponseWithMeta(result.payload, {
    dataState: result.meta.dataState,
    reason: result.meta.reason,
    lastSuccessAt: result.meta.lastSuccessAt ?? null,
  });
  return NextResponse.json(payload);
}
