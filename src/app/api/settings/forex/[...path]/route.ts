import { NextRequest, NextResponse } from "next/server";

import { canAccessRevenueWorkspace, getSessionProfile } from "@/lib/auth";
import { buildBackendAuthHeaders } from "@/lib/backend-security";
import { hasPermission } from "@/lib/rbac-store";

const BACKEND_API_URL = process.env.BACKEND_API_URL ?? "http://127.0.0.1:8000";

export async function GET(request: NextRequest) {
  const session = await getSessionProfile();

  if (!session) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  if (
    !hasPermission(session.role, "manage_users") &&
    !canAccessRevenueWorkspace(session.role)
  ) {
    return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
  }

  const path = request.nextUrl.pathname.replace("/api/settings/forex/", "");
  const endpoint = `${BACKEND_API_URL}/api/settings/forex/${path}${
    request.nextUrl.search ? request.nextUrl.search : ""
  }`;

  const response = await fetch(endpoint, {
    cache: "no-store",
    headers: buildBackendAuthHeaders(session, undefined, request),
  });

  const body = await response
    .json()
    .catch(() => ({ detail: "Backend request failed." }));

  return NextResponse.json(body, { status: response.status });
}
