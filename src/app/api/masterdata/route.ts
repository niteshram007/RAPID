import { NextRequest, NextResponse } from "next/server";

import {
  canAccessRevenueWorkspace,
  getRevenueAccessScope,
  getSessionProfile,
} from "@/lib/auth";
import { buildBackendAuthHeaders } from "@/lib/backend-security";
import { hasPermission } from "@/lib/rbac-store";

const BACKEND_API_URL = process.env.BACKEND_API_URL ?? "http://127.0.0.1:8000";

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

  const search = new URLSearchParams(request.nextUrl.searchParams.toString());
  if (!search.has("includeMetadata")) {
    search.set("includeMetadata", "false");
  }

  let endpoint = `${BACKEND_API_URL}/api/admin/masterdata?${search.toString()}`;
  if (!hasPermission(session.role, "manage_users") && canAccessRevenueWorkspace(session.role)) {
    const scope = getRevenueAccessScope(session);
    search.delete("bdms");
    search.delete("practiceHeads");
    search.delete("geoHeads");
    search.delete("entities");
    search.delete("verticals");
    scope.bdms.forEach((value) => search.append("bdms", value));
    scope.practiceHeads.forEach((value) => search.append("practiceHeads", value));
    scope.geoHeads.forEach((value) => search.append("geoHeads", value));
    scope.entities.forEach((value) => search.append("entities", value));
    scope.verticals.forEach((value) => search.append("verticals", value));
    endpoint = `${BACKEND_API_URL}/api/revenue/masterdata?${search.toString()}`;
  }

  const response = await fetch(endpoint, {
    cache: "no-store",
    headers: buildBackendAuthHeaders(session, undefined, request),
  });

  const body = await response
    .json()
    .catch(() => ({ detail: "Backend request failed." }));
  return NextResponse.json(body, { status: response.status });
}
