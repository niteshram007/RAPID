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
    uploadBatchId?: string;
    skipValidationErrors?: boolean;
    saveManualReviewRows?: boolean;
    updatedBy?: string;
  };
  const uploadBatchId = String(payload.uploadBatchId ?? "").trim();
  if (!uploadBatchId) {
    return NextResponse.json({ detail: "uploadBatchId is required." }, { status: 400 });
  }

  const response = await fetch(`${BACKEND_API_URL}/api/budget/confirm-save`, {
    method: "POST",
    headers: buildBackendAuthHeaders(
      session,
      { "content-type": "application/json" },
      request,
    ),
    body: JSON.stringify({
      uploadBatchId,
      skipValidationErrors: payload.skipValidationErrors ?? true,
      saveManualReviewRows: payload.saveManualReviewRows ?? true,
      updatedBy: payload.updatedBy || session.email || session.name,
    }),
    cache: "no-store",
  });

  const body = await response.json().catch(() => ({ detail: "Backend request failed." }));
  return NextResponse.json(body, { status: response.status });
}
