import { NextRequest, NextResponse } from "next/server";

import {
  canAccessWorkspaceArea,
  getRevenueAccessScope,
  getSessionProfile,
} from "@/lib/auth";
import { buildBackendAuthHeaders } from "@/lib/backend-security";
import { hasPermission } from "@/lib/rbac-store";

const BACKEND_API_URL = process.env.BACKEND_API_URL ?? "http://127.0.0.1:8000";

function canEditScopedWorkingDays(roleId: string | undefined) {
  return roleId === "bdm" || roleId === "practice-head";
}

export async function GET(request: NextRequest) {
  const session = await getSessionProfile();
  if (!session) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(session.role, "view_dashboard")) {
    return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
  }

  const scope = getRevenueAccessScope(session);
  const search = new URLSearchParams(request.nextUrl.searchParams.toString());
  search.delete("bdms");
  search.delete("practiceHeads");
  search.delete("geoHeads");
  scope.bdms.forEach((value) => search.append("bdms", value));
  scope.practiceHeads.forEach((value) => search.append("practiceHeads", value));
  scope.geoHeads.forEach((value) => search.append("geoHeads", value));

  const response = await fetch(
    `${BACKEND_API_URL}/api/revenue/customer-working-days?${search.toString()}`,
    { cache: "no-store", headers: buildBackendAuthHeaders(session, undefined, request) },
  );
  const body = await response
    .json()
    .catch(() => ({ detail: "Backend request failed." }));
  return NextResponse.json(body, { status: response.status });
}

export async function POST(request: NextRequest) {
  const session = await getSessionProfile();
  if (!session) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }
  const canEdit =
    canEditScopedWorkingDays(session.role?.id) ||
    canAccessWorkspaceArea(session.role, "admin");
  if (!canEdit) {
    return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
  }

  const scope = getRevenueAccessScope(session);
  const raw = (await request.json().catch(() => ({}))) as {
    rows?: unknown[];
    updatedBy?: string;
  };
  const payload = {
    rows: Array.isArray(raw.rows) ? raw.rows : [],
    updatedBy: raw.updatedBy ?? `${session.role?.id ?? "workspace"}-working-days`,
  };

  const response = await fetch(`${BACKEND_API_URL}/api/revenue/customer-working-days`, {
    method: "POST",
    headers: buildBackendAuthHeaders(session, {
      "Content-Type": "application/json",
    }, request),
    cache: "no-store",
    body: JSON.stringify({
      ...payload,
      bdms: scope.bdms,
      practiceHeads: scope.practiceHeads,
      geoHeads: scope.geoHeads,
    }),
  });

  const body = await response
    .json()
    .catch(() => ({ detail: "Backend request failed." }));
  return NextResponse.json(body, { status: response.status });
}
