import { NextRequest, NextResponse } from "next/server";

import { canAccessRevenueWorkspace, getSessionProfile } from "@/lib/auth";
import { buildBackendAuthHeaders } from "@/lib/backend-security";
import { hasPermission } from "@/lib/rbac-store";

const BACKEND_API_URL = process.env.BACKEND_API_URL ?? "http://127.0.0.1:8000";

type VarianceCommentRequest = {
  financialYear?: string;
  comparisonMonth?: string;
  tableId?: string;
  rowLabel?: string;
  variancePercent?: number;
  comment?: string;
};

function parseTableIds(search: URLSearchParams) {
  const values = search
    .getAll("tableIds")
    .map((value) => value.trim())
    .filter(Boolean);
  return Array.from(new Set(values));
}

export async function GET(request: NextRequest) {
  const session = await getSessionProfile();
  if (!session) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(session.role, "view_dashboard") || !canAccessRevenueWorkspace(session.role)) {
    return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
  }

  const financialYear = request.nextUrl.searchParams.get("financialYear")?.trim() ?? "";
  if (!financialYear) {
    return NextResponse.json({ rows: [] });
  }

  const comparisonMonth = request.nextUrl.searchParams.get("comparisonMonth")?.trim() ?? "";
  const tableIds = parseTableIds(request.nextUrl.searchParams);
  const backendParams = new URLSearchParams();
  backendParams.set("financialYear", financialYear);
  if (comparisonMonth) {
    backendParams.set("comparisonMonth", comparisonMonth);
  }
  tableIds.forEach((value) => backendParams.append("tableIds", value));

  const response = await fetch(
    `${BACKEND_API_URL}/api/workspace/revenue-variance-comments?${backendParams.toString()}`,
    {
      cache: "no-store",
      headers: buildBackendAuthHeaders(session, undefined, request),
    },
  );
  const body = await response.json().catch(() => ({ rows: [] }));
  return NextResponse.json(body, { status: response.status });
}

export async function POST(request: NextRequest) {
  const session = await getSessionProfile();
  if (!session) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(session.role, "view_dashboard") || !canAccessRevenueWorkspace(session.role)) {
    return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
  }
  if (session.role?.id !== "bdm" && session.role?.id !== "practice-head") {
    return NextResponse.json(
      { detail: "Only BDM and Practice Head roles can add variance comments." },
      { status: 403 },
    );
  }

  const payload = (await request.json().catch(() => ({}))) as VarianceCommentRequest;
  const financialYear = String(payload.financialYear ?? "").trim();
  const comparisonMonth = String(payload.comparisonMonth ?? "").trim();
  const tableId = String(payload.tableId ?? "").trim();
  const rowLabel = String(payload.rowLabel ?? "").trim();
  const comment = String(payload.comment ?? "");
  const variancePercent = Number(payload.variancePercent ?? 0);

  if (!financialYear || !comparisonMonth || !tableId || !rowLabel) {
    return NextResponse.json(
      { detail: "financialYear, comparisonMonth, tableId, and rowLabel are required." },
      { status: 400 },
    );
  }

  const response = await fetch(`${BACKEND_API_URL}/api/workspace/revenue-variance-comments`, {
    method: "POST",
    cache: "no-store",
    headers: buildBackendAuthHeaders(
      session,
      {
        "Content-Type": "application/json",
      },
      request,
    ),
    body: JSON.stringify({
      financialYear,
      comparisonMonth,
      tableId,
      rowLabel,
      variancePercent: Number.isFinite(variancePercent) ? variancePercent : 0,
      comment,
      authoredBy: session.name ?? session.userId,
      authorRole: session.role?.id ?? "",
    }),
  });

  const body = await response.json().catch(() => ({ detail: "Backend request failed." }));
  return NextResponse.json(body, { status: response.status });
}
