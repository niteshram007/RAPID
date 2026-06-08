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
    rowNumber?: number;
    selectedMapping?: Record<string, unknown>;
    overwriteExisting?: boolean;
  };

  const uploadBatchId = String(payload.uploadBatchId ?? "").trim();
  const rowNumber = Number(payload.rowNumber ?? 0);
  if (!uploadBatchId || !Number.isFinite(rowNumber) || rowNumber <= 0) {
    return NextResponse.json(
      { detail: "uploadBatchId and rowNumber are required." },
      { status: 400 },
    );
  }
  if (!payload.selectedMapping || typeof payload.selectedMapping !== "object") {
    return NextResponse.json({ detail: "selectedMapping is required." }, { status: 400 });
  }

  const response = await fetch(`${BACKEND_API_URL}/api/budget/manual-map`, {
    method: "POST",
    headers: buildBackendAuthHeaders(
      session,
      { "content-type": "application/json" },
      request,
    ),
    body: JSON.stringify({
      uploadBatchId,
      rowNumber,
      selectedMapping: payload.selectedMapping,
      overwriteExisting: Boolean(payload.overwriteExisting),
    }),
    cache: "no-store",
  });

  const body = await response.json().catch(() => ({ detail: "Backend request failed." }));
  return NextResponse.json(body, { status: response.status });
}
