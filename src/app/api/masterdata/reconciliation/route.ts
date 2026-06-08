import { NextRequest, NextResponse } from "next/server";

import { getSessionProfile } from "@/lib/auth";
import { buildBackendAuthHeaders } from "@/lib/backend-security";
import { buildMasterdataReconciliation } from "@/lib/masterdata-reconciliation";
import { hasPermission } from "@/lib/rbac-store";

const BACKEND_API_URL = process.env.BACKEND_API_URL ?? "http://127.0.0.1:8000";

type MasterdataPayload = {
  rows: Array<Record<string, unknown>>;
  summary?: {
    financialYear?: string | null;
  };
};

async function fetchMasterdataDataset(
  datasetType: "budget" | "global_revenue",
  financialYear: string,
  sessionHeaders: HeadersInit,
) {
  const search = new URLSearchParams({
    datasetType,
    includeMetadata: "true",
    limit: "100000",
  });
  if (financialYear.trim()) {
    search.set("financialYear", financialYear.trim());
  }

  const response = await fetch(`${BACKEND_API_URL}/api/admin/masterdata?${search.toString()}`, {
    cache: "no-store",
    headers: sessionHeaders,
  });

  const payload = (await response.json().catch(() => null)) as MasterdataPayload | { detail?: string } | null;
  if (!response.ok || !payload || !("rows" in payload)) {
    const detail = payload && "detail" in payload ? payload.detail : "Unable to load masterdata.";
    throw new Error(detail || "Unable to load masterdata.");
  }
  return payload;
}

export async function GET(request: NextRequest) {
  const session = await getSessionProfile();

  if (!session) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const canViewMasterdata =
    hasPermission(session.role, "view_dashboard") || hasPermission(session.role, "manage_users");

  if (!canViewMasterdata) {
    return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
  }

  const financialYear = request.nextUrl.searchParams.get("financialYear")?.trim() || "2026-2027";
  const sessionHeaders = buildBackendAuthHeaders(session, undefined, request);

  try {
    const [budget, actual] = await Promise.all([
      fetchMasterdataDataset("budget", financialYear, sessionHeaders),
      fetchMasterdataDataset("global_revenue", financialYear, sessionHeaders),
    ]);

    const payload = buildMasterdataReconciliation({
      financialYear:
        String(budget.summary?.financialYear || actual.summary?.financialYear || financialYear).trim() ||
        financialYear,
      budgetRows: budget.rows,
      actualRows: actual.rows,
    });
    const response = NextResponse.json(payload);
    response.headers.set("Cache-Control", "no-store, max-age=0");
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        detail: error instanceof Error ? error.message : "Unable to build masterdata reconciliation monitor.",
      },
      { status: 500 },
    );
  }
}
