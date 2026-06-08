import { NextRequest, NextResponse } from "next/server";

import { canAccessRevenueWorkspace, getRevenueAccessScope, getSessionProfile } from "@/lib/auth";
import { buildBackendAuthHeaders } from "@/lib/backend-security";
import { recordAuditEvent } from "@/lib/audit";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { hasPermission } from "@/lib/rbac-store";

const BACKEND_API_URL = process.env.BACKEND_API_URL ?? "http://127.0.0.1:8000";

export async function GET(request: NextRequest) {
  const session = await getSessionProfile();

  if (!session) {
    await recordAuditEvent({
      request,
      action: "security.unauthorized_access",
      module: "exports",
      description: "Unauthenticated export attempt.",
      status: "failure",
    });
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  if (
    !hasPermission(session.role, "export_reports") &&
    !hasPermission(session.role, "view_dashboard")
  ) {
    await recordAuditEvent({
      session,
      request,
      action: "security.unauthorized_access",
      module: "exports",
      description: "Export attempt without export permission.",
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

  const backendParams = new URLSearchParams(request.nextUrl.searchParams.toString());
  const hasAdminAccess =
    hasPermission(session.role, "manage_users") || hasPermission(session.role, "manage_roles");

  if (!hasAdminAccess && canAccessRevenueWorkspace(session.role)) {
    const scope = getRevenueAccessScope(session);
    scope.bdms.forEach((value) => backendParams.append("bdms", value));
    scope.practiceHeads.forEach((value) => backendParams.append("practiceHeads", value));
    scope.geoHeads.forEach((value) => backendParams.append("geoHeads", value));
    scope.entities.forEach((value) => backendParams.append("entities", value));
    scope.verticals.forEach((value) => backendParams.append("verticals", value));
  }

  const response = await fetch(
    `${BACKEND_API_URL}/api/admin/masterdata/export?${backendParams.toString()}`,
    {
      cache: "no-store",
      headers: buildBackendAuthHeaders(session, undefined, request),
    },
  );

  if (!response.ok) {
    const body = await response
      .json()
      .catch(() => ({ detail: "Backend request failed." }));
    return NextResponse.json(body, { status: response.status });
  }

  const contentType =
    response.headers.get("content-type") ??
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const disposition =
    response.headers.get("content-disposition") ??
    'attachment; filename="masterdata.xlsx"';
  const buffer = await response.arrayBuffer();
  await recordAuditEvent({
    session,
    request,
    action: "export.masterdata",
    module: "exports",
    description: "Downloaded master data export.",
    metadata: {
      datasetType: backendParams.get("datasetType"),
      financialYear: backendParams.get("financialYear"),
    },
  });

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": disposition,
    },
  });
}
