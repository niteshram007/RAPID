import { NextRequest, NextResponse } from "next/server";

import { getSessionProfile } from "@/lib/auth";
import { buildBackendAuthHeaders } from "@/lib/backend-security";
import { hasPermission } from "@/lib/rbac-store";

const BACKEND_API_URL = process.env.BACKEND_API_URL ?? "http://127.0.0.1:8000";

export async function POST(request: NextRequest) {
  const session = await getSessionProfile();
  if (!session) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(session.role, "view_dashboard")) {
    return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ detail: "Invalid request body." }, { status: 400 });
  }

  const response = await fetch(`${BACKEND_API_URL}/api/drilldown/details`, {
    method: "POST",
    headers: buildBackendAuthHeaders(
      session,
      { "Content-Type": "application/json" },
      request,
    ),
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const body = await response.json().catch(() => ({ detail: "Backend request failed." }));
  return NextResponse.json(body, { status: response.status });
}

