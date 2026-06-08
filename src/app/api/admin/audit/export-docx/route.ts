import { NextRequest, NextResponse } from "next/server";

import { getSessionProfile } from "@/lib/auth";
import { buildBackendAuthHeaders } from "@/lib/backend-security";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { hasPermission } from "@/lib/rbac-store";

const BACKEND_API_URL = process.env.BACKEND_API_URL ?? "http://127.0.0.1:8000";

export async function GET(request: NextRequest) {
  const session = await getSessionProfile();
  if (!session) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(session.role, "manage_users")) {
    return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
  }

  const rateLimit = checkRateLimit({
    key: rateLimitKey(request, "export", session.userId),
    limit: 20,
    windowMs: 10 * 60 * 1000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { detail: "Too many export requests. Please wait and try again." },
      { status: 429 },
    );
  }

  const search = request.nextUrl.searchParams.toString();
  const response = await fetch(
    `${BACKEND_API_URL}/api/admin/audit/export-docx${search ? `?${search}` : ""}`,
    {
      cache: "no-store",
      headers: buildBackendAuthHeaders(session, undefined, request),
    },
  );

  const data = await response.arrayBuffer();
  const headers = new Headers();
  headers.set(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );
  headers.set("Content-Disposition", 'attachment; filename="audit_logs.docx"');
  return new NextResponse(data, { status: response.status, headers });
}
