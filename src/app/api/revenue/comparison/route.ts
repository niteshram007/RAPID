import { NextRequest, NextResponse } from "next/server";

import { canAccessRevenueWorkspace, getSessionProfile } from "@/lib/auth";
import {
  readRapidRevenueFiltersFromSearch,
  type RevenueComparisonResponse,
  type RevenueDataMeta,
  type RevenueMetaReason,
} from "@/lib/rapid-revenue";
import {
  getRapidRevenueComparisonDetailed,
  mergeScopedRevenueFilters,
} from "@/lib/rapid-revenue-server";
import { hasPermission } from "@/lib/rbac-store";

const MONTH_SEQUENCE = [
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
  "Jan",
  "Feb",
  "Mar",
] as const;
const FALLBACK_PERIOD_CACHE_TTL_MS = 5 * 60 * 1000;
const fallbackPeriodCache = new Map<
  string,
  {
    periodTo: string;
    financialYear: string;
    expiresAt: number;
  }
>();

function emptyComparisonPayload(financialYear: string, comparisonMonth: string): RevenueComparisonResponse {
  const resolvedMonth = comparisonMonth || "Mar";
  return {
    database: {
      status: "offline",
      message: "Comparison data is unavailable.",
    },
    financialYear,
    comparisonMonth: resolvedMonth,
    resolvedPeriod: {
      financialYear,
      periodFrom: "Apr",
      periodTo: resolvedMonth,
      comparisonMonth: resolvedMonth,
    },
    dataVersion: "",
    scopeMode: "budget_mapped_actuals",
    summary: {
      rowCount: 0,
      budget: 0,
      forecast: 0,
      actual: 0,
      varianceVsBudget: 0,
      varianceVsForecast: 0,
    },
    rows: [],
  };
}

function toResponseWithMeta(
  payload: RevenueComparisonResponse,
  meta: RevenueDataMeta,
): RevenueComparisonResponse {
  const resolvedPeriod = payload.resolvedPeriod ?? meta.resolvedPeriod ?? {
    financialYear: payload.financialYear || "",
    periodFrom: "Apr",
    periodTo: payload.comparisonMonth || "Mar",
    comparisonMonth: payload.comparisonMonth || "Mar",
  };
  return {
    ...payload,
    resolvedPeriod,
    dataVersion: payload.dataVersion ?? "",
    scopeMode: payload.scopeMode ?? "budget_mapped_actuals",
    meta,
  };
}

function buildFallbackScopeKey(filters: ReturnType<typeof mergeScopedRevenueFilters>) {
  const entries = Object.entries(filters)
    .filter(([key]) => key !== "periodFrom" && key !== "periodTo")
    .sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify(entries);
}

function readCachedFallbackPeriod(scopeKey: string) {
  const cached = fallbackPeriodCache.get(scopeKey);
  if (!cached) {
    return null;
  }
  if (cached.expiresAt <= Date.now()) {
    fallbackPeriodCache.delete(scopeKey);
    return null;
  }
  return cached;
}

function writeCachedFallbackPeriod(scopeKey: string, payload: { periodTo: string; financialYear: string }) {
  fallbackPeriodCache.set(scopeKey, {
    ...payload,
    expiresAt: Date.now() + FALLBACK_PERIOD_CACHE_TTL_MS,
  });
}

function hasActualRows(payload: RevenueComparisonResponse) {
  return payload.rows.some((row) => Math.abs(Number(row.actual ?? 0)) > 0);
}

function resolveLatestActualMonth(payload: RevenueComparisonResponse) {
  const byMonth = new Map<string, number>();
  for (const row of payload.rows) {
    const month = String(row.month ?? "").slice(0, 3);
    if (!month) {
      continue;
    }
    byMonth.set(month, (byMonth.get(month) ?? 0) + Number(row.actual ?? 0));
  }
  for (let index = MONTH_SEQUENCE.length - 1; index >= 0; index -= 1) {
    const month = MONTH_SEQUENCE[index];
    if (Math.abs(byMonth.get(month) ?? 0) > 0) {
      return month;
    }
  }
  return null;
}

function resolveFailureMeta(
  reason: RevenueMetaReason,
  financialYear: string,
  comparisonMonth: string,
): RevenueComparisonResponse {
  return toResponseWithMeta(
    emptyComparisonPayload(financialYear, comparisonMonth),
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
  const fallbackComparisonMonth = String(requested.periodTo ?? "Mar").trim().slice(0, 3) || "Mar";
  const session = await getSessionProfile();

  if (!session) {
    return NextResponse.json(
      resolveFailureMeta("unauthorized", fallbackFinancialYear, fallbackComparisonMonth),
      { status: 401 },
    );
  }

  if (
    !hasPermission(session.role, "view_dashboard") ||
    !canAccessRevenueWorkspace(session.role)
  ) {
    return NextResponse.json(
      resolveFailureMeta("forbidden", fallbackFinancialYear, fallbackComparisonMonth),
      { status: 403 },
    );
  }

  const scoped = mergeScopedRevenueFilters(session, requested);
  const fallbackScopeKey = buildFallbackScopeKey(scoped);
  const comparisonResult = await getRapidRevenueComparisonDetailed(scoped);
  const comparisonMeta: RevenueDataMeta = {
    dataState: comparisonResult.meta.dataState,
    reason: comparisonResult.meta.reason,
    lastSuccessAt: comparisonResult.meta.lastSuccessAt ?? null,
  };
  let payload: RevenueComparisonResponse = toResponseWithMeta(
    comparisonResult.payload,
    comparisonMeta,
  );

  if (
    comparisonResult.meta.dataState === "fresh" &&
    !hasActualRows(comparisonResult.payload)
  ) {
    let handledByCachedPeriod = false;
    const cachedFallback = readCachedFallbackPeriod(fallbackScopeKey);
    if (cachedFallback) {
      const cachedAdjustedResult = await getRapidRevenueComparisonDetailed({
        ...scoped,
        periodFrom: "Apr",
        periodTo: cachedFallback.periodTo,
      });
      if (
        cachedAdjustedResult.meta.dataState === "fresh" &&
        hasActualRows(cachedAdjustedResult.payload)
      ) {
        payload = toResponseWithMeta(cachedAdjustedResult.payload, {
          dataState: "fresh",
          reason: "no_data_period",
          autoPeriodAdjusted: true,
          resolvedPeriod: {
            financialYear:
              cachedAdjustedResult.payload.financialYear || cachedFallback.financialYear || scoped.financialYear || "",
            periodFrom: "Apr",
            periodTo: cachedFallback.periodTo,
            comparisonMonth: cachedAdjustedResult.payload.comparisonMonth,
          },
          lastSuccessAt:
            cachedAdjustedResult.meta.lastSuccessAt ??
            comparisonResult.meta.lastSuccessAt ??
            null,
        });
        handledByCachedPeriod = true;
      } else {
        fallbackPeriodCache.delete(fallbackScopeKey);
      }
    }

    if (handledByCachedPeriod) {
      const response = NextResponse.json(payload);
      response.headers.set(
        "Cache-Control",
        "no-store, max-age=0",
      );
      response.headers.set("Pragma", "no-cache");
      response.headers.set("Expires", "0");
      return response;
    }

    const annualResult = await getRapidRevenueComparisonDetailed({
      ...scoped,
      periodFrom: "Apr",
      periodTo: "Mar",
    });
    if (
      annualResult.meta.dataState === "fresh" &&
      hasActualRows(annualResult.payload)
    ) {
      const latestMonth = resolveLatestActualMonth(annualResult.payload);
      if (latestMonth) {
        const fallbackFrom = "Apr";
        const fallbackTo = latestMonth;
        const adjustedResult = await getRapidRevenueComparisonDetailed({
          ...scoped,
          periodFrom: fallbackFrom,
          periodTo: fallbackTo,
        });
        if (
          adjustedResult.meta.dataState === "fresh" &&
          hasActualRows(adjustedResult.payload)
        ) {
          writeCachedFallbackPeriod(fallbackScopeKey, {
            periodTo: fallbackTo,
            financialYear:
              adjustedResult.payload.financialYear || scoped.financialYear || "",
          });
          payload = toResponseWithMeta(adjustedResult.payload, {
            dataState: "fresh",
            reason: "no_data_period",
            autoPeriodAdjusted: true,
            resolvedPeriod: {
              financialYear:
                adjustedResult.payload.financialYear || scoped.financialYear || "",
              periodFrom: fallbackFrom,
              periodTo: fallbackTo,
              comparisonMonth: adjustedResult.payload.comparisonMonth,
            },
            lastSuccessAt:
              adjustedResult.meta.lastSuccessAt ??
              comparisonResult.meta.lastSuccessAt ??
              null,
          });
        }
      }
    }
  }

  const response = NextResponse.json(payload);
  response.headers.set(
    "Cache-Control",
    "no-store, max-age=0",
  );
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}
