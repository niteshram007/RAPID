import { NextRequest, NextResponse } from "next/server";

import { getSessionProfile } from "@/lib/auth";
import { buildBackendAuthHeaders } from "@/lib/backend-security";
import { hasPermission } from "@/lib/rbac-store";

const BACKEND_API_URL = process.env.BACKEND_API_URL ?? "http://127.0.0.1:8000";

type TrendSummaryResponse = {
  rows?: unknown[];
  count?: number;
  lastUpdated?: string | null;
  financialYears?: string[];
  resolvedFinancialYear?: string | null;
  budgetFallbackApplied?: boolean;
  budgetSourceFinancialYear?: string | null;
  detail?: string;
};

async function fetchTrendSummary(
  request: NextRequest,
  financialYear: string | null,
  session: NonNullable<Awaited<ReturnType<typeof getSessionProfile>>>,
) {
  const search = new URLSearchParams(request.nextUrl.searchParams.toString());
  if (financialYear) {
    search.set("financialYear", financialYear);
  } else {
    search.delete("financialYear");
  }
  const response = await fetch(`${BACKEND_API_URL}/api/trends/summary?${search.toString()}`, {
    cache: "no-store",
    headers: buildBackendAuthHeaders(session, undefined, request),
  });
  const body = (await response.json().catch(() => ({}))) as TrendSummaryResponse;
  return { response, body };
}

function resolveRequestedFinancialYear(search: URLSearchParams) {
  const direct = search.get("financialYear")?.trim();
  if (direct) {
    return direct;
  }
  return search.getAll("financialYears").map((value) => value.trim()).find(Boolean) ?? null;
}

async function resolveLatestFinancialYear(
  request: NextRequest,
  session: NonNullable<Awaited<ReturnType<typeof getSessionProfile>>>,
) {
  const search = new URLSearchParams(request.nextUrl.searchParams.toString());
  search.delete("financialYear");
  search.delete("financialYears");
  const response = await fetch(`${BACKEND_API_URL}/api/trends/filters?${search.toString()}`, {
    cache: "no-store",
    headers: buildBackendAuthHeaders(session, undefined, request),
  });
  const payload = (await response.json().catch(() => null)) as
    | { financialYears?: string[] }
    | null;
  if (!response.ok || !payload || !Array.isArray(payload.financialYears)) {
    return null;
  }
  const years = payload.financialYears
    .map((year) => String(year ?? "").trim())
    .filter(Boolean);
  return years.at(-1) ?? null;
}

export async function GET(request: NextRequest) {
  const session = await getSessionProfile();
  if (!session) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(session.role, "view_dashboard")) {
    return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
  }

  const requestedFinancialYear = resolveRequestedFinancialYear(request.nextUrl.searchParams);
  const financialYear = requestedFinancialYear || (await resolveLatestFinancialYear(request, session));

  const initial = await fetchTrendSummary(request, financialYear, session);
  if (!initial.response.ok) {
    return NextResponse.json(initial.body, { status: initial.response.status });
  }

  const initialRows = Array.isArray(initial.body.rows) ? initial.body.rows : [];
  if (initialRows.length > 0) {
    return NextResponse.json({
      ...initial.body,
      resolvedFinancialYear: financialYear,
      budgetFallbackApplied: false,
      budgetSourceFinancialYear: financialYear,
    });
  }

  await fetch(`${BACKEND_API_URL}/api/trends/refresh`, {
    method: "POST",
    cache: "no-store",
    headers: buildBackendAuthHeaders(
      session,
      {
        "Content-Type": "application/json",
      },
      request,
    ),
    body: JSON.stringify({ financialYear }),
  }).catch(() => null);

  const refreshed = await fetchTrendSummary(request, financialYear, session);
  if (!refreshed.response.ok) {
    return NextResponse.json(refreshed.body, { status: refreshed.response.status });
  }

  const refreshedRows = Array.isArray(refreshed.body.rows) ? refreshed.body.rows : [];
  if (refreshedRows.length > 0) {
    return NextResponse.json({
      ...refreshed.body,
      resolvedFinancialYear: financialYear,
      budgetFallbackApplied: false,
      budgetSourceFinancialYear: financialYear,
    });
  }

  const fallbackFinancialYear = await resolveLatestFinancialYear(request, session);
  if (financialYear && fallbackFinancialYear && fallbackFinancialYear !== financialYear) {
    const fallback = await fetchTrendSummary(request, fallbackFinancialYear, session);
    if (fallback.response.ok) {
      const fallbackRows = Array.isArray(fallback.body.rows) ? fallback.body.rows : [];
      if (fallbackRows.length > 0) {
        return NextResponse.json({
          ...fallback.body,
          resolvedFinancialYear: financialYear,
          budgetFallbackApplied: true,
          budgetSourceFinancialYear: fallbackFinancialYear,
        });
      }
    }
  }

  return NextResponse.json({
    ...refreshed.body,
    resolvedFinancialYear: financialYear,
    budgetFallbackApplied: false,
    budgetSourceFinancialYear: financialYear,
  });
}
