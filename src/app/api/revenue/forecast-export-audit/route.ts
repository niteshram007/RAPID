import { NextRequest, NextResponse } from "next/server";

import { getSessionProfile } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { hasPermission } from "@/lib/rbac-store";

export async function POST(request: NextRequest) {
  const session = await getSessionProfile();
  if (!session) {
    await recordAuditEvent({
      request,
      action: "security.unauthorized_access",
      module: "exports",
      description: "Unauthenticated forecast export attempt.",
      status: "failure",
    });
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(session.role, "export_reports")) {
    await recordAuditEvent({
      session,
      request,
      action: "security.unauthorized_access",
      module: "exports",
      description: "Forecast export attempt without export permission.",
      status: "failure",
    });
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

  const payload = (await request.json().catch(() => ({}))) as {
    segment?: string;
    rows?: number;
  };
  await recordAuditEvent({
    session,
    request,
    action: "export.forecast",
    module: "exports",
    description: "Downloaded forecast workbook.",
    metadata: {
      segment: String(payload.segment ?? "all"),
      rows: Number(payload.rows ?? 0),
    },
  });
  return NextResponse.json({ status: "logged" });
}
