import { NextRequest, NextResponse } from "next/server";

import { getSessionProfile } from "@/lib/auth";
import { buildBackendAuthHeaders } from "@/lib/backend-security";

const BACKEND_API_URL = process.env.BACKEND_API_URL ?? "http://127.0.0.1:8000";

export async function POST(request: NextRequest) {
  const session = await getSessionProfile();
  if (!session) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => ({}))) as {
    sessionId?: string;
    path?: string;
    metadata?: Record<string, unknown>;
  };
  const sessionId = String(payload.sessionId ?? "").trim();
  if (!sessionId) {
    return NextResponse.json({ detail: "sessionId is required." }, { status: 400 });
  }

  const response = await fetch(`${BACKEND_API_URL}/api/workspace/activity/close`, {
    method: "POST",
    headers: buildBackendAuthHeaders(session, {
      "Content-Type": "application/json",
    }, request),
    cache: "no-store",
    body: JSON.stringify({
      sessionId,
      userId: session.userId,
      userName: session.name,
      userEmail: session.email,
      roleId: session.role?.id ?? "",
      roleName: session.role?.name ?? "",
      path: String(payload.path ?? "/").trim() || "/",
      metadata: payload.metadata ?? {},
    }),
  });

  const body = await response.json().catch(() => ({ detail: "Backend request failed." }));
  return NextResponse.json(body, { status: response.status });
}
