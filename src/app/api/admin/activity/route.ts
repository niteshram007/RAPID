import { NextRequest, NextResponse } from "next/server";

import { canAccessWorkspaceArea, getSessionProfile } from "@/lib/auth";
import { buildBackendAuthHeaders } from "@/lib/backend-security";

const BACKEND_API_URL = process.env.BACKEND_API_URL ?? "http://127.0.0.1:8000";

export async function GET(request: NextRequest) {
  const session = await getSessionProfile();

  if (!session) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const canViewActivity =
    canAccessWorkspaceArea(session.role, "executive") ||
    canAccessWorkspaceArea(session.role, "admin");

  if (!canViewActivity) {
    return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
  }

  const search = request.nextUrl.searchParams.toString();
  const response = await fetch(
    `${BACKEND_API_URL}/api/admin/activity${search ? `?${search}` : ""}`,
    { cache: "no-store", headers: buildBackendAuthHeaders(session, undefined, request) },
  );

  const body = await response
    .json()
    .catch(() => ({ detail: "Backend request failed." }));
  return NextResponse.json(body, { status: response.status });
}
