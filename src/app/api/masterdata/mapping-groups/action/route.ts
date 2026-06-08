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
  if (!hasPermission(session.role, "upload_data")) {
    return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
  }

  const payload = (await request.json().catch(() => ({}))) as {
    entityType?: "customer" | "project";
    action?: string;
    mappingId?: string;
    standardName?: string;
  };

  const response = await fetch(`${BACKEND_API_URL}/api/admin/masterdata/mapping-groups/action`, {
    method: "POST",
    cache: "no-store",
    headers: buildBackendAuthHeaders(session, { "content-type": "application/json" }, request),
    body: JSON.stringify({
      entityType: payload.entityType,
      action: payload.action,
      mappingId: payload.mappingId,
      standardName: payload.standardName,
      actor: session.email || session.name,
    }),
  });

  const body = await response.json().catch(() => ({ detail: "Backend request failed." }));
  return NextResponse.json(body, { status: response.status });
}
