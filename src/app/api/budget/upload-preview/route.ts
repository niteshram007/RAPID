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

  const formData = await request.formData();
  const financialYear = String(formData.get("financialYear") ?? formData.get("financial_year") ?? "").trim();
  const workbook = formData.get("workbook");
  const overwriteExistingRaw = String(formData.get("overwriteExisting") ?? "false").trim().toLowerCase();
  const overwriteExisting =
    overwriteExistingRaw === "true" || overwriteExistingRaw === "1" || overwriteExistingRaw === "yes";

  if (!financialYear || !(workbook instanceof File) || workbook.size <= 0) {
    return NextResponse.json(
      { detail: "financialYear and workbook are required." },
      { status: 400 },
    );
  }

  const payload = new FormData();
  payload.append("financial_year", financialYear);
  payload.append("workbook", workbook);
  payload.append("overwrite_existing", overwriteExisting ? "true" : "false");

  const response = await fetch(`${BACKEND_API_URL}/api/budget/upload-preview`, {
    method: "POST",
    body: payload,
    headers: buildBackendAuthHeaders(session, undefined, request),
    cache: "no-store",
  });

  const body = await response.json().catch(() => ({ detail: "Backend request failed." }));
  return NextResponse.json(body, { status: response.status });
}
