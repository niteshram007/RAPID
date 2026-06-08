import { NextRequest, NextResponse } from "next/server";

import { getSessionProfile } from "@/lib/auth";
import { buildBackendAuthHeaders } from "@/lib/backend-security";
import { hasPermission } from "@/lib/rbac-store";

const BACKEND_API_URL = process.env.BACKEND_API_URL ?? "http://127.0.0.1:8000";

export async function GET(request: NextRequest) {
  const session = await getSessionProfile();
  if (!session) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(session.role, "view_dashboard")) {
    return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
  }

  const response = await fetch(`${BACKEND_API_URL}/api/metrics`, {
    cache: "no-store",
    headers: buildBackendAuthHeaders(session, undefined, request),
  });
  const body = await response.json().catch(() => ({ detail: "Backend request failed." }));
  return NextResponse.json(body, { status: response.status });
}
