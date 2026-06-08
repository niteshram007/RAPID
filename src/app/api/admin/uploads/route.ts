import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { getDefaultRouteForRole, getSessionProfile } from "@/lib/auth";
import { buildBackendAuthHeaders } from "@/lib/backend-security";
import { recordAuditEvent } from "@/lib/audit";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { hasPermission } from "@/lib/rbac-store";

const BACKEND_API_URL = process.env.BACKEND_API_URL ?? "http://127.0.0.1:8000";
const UPLOAD_TIMEOUT_MS = Math.max(
  Number(process.env.BACKEND_UPLOAD_TIMEOUT_MS ?? 15 * 60 * 1000),
  30_000,
);
export const runtime = "nodejs";

function resolveReturnPath(value: FormDataEntryValue | null) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw.startsWith("/admin/upload")) {
    return "/admin/upload";
  }
  return raw;
}

function resolveRequestOrigin(request: NextRequest) {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = request.headers.get("host")?.trim();
  const protocol = forwardedProto || request.nextUrl.protocol.replace(":", "") || "https";
  const resolvedHost = forwardedHost || host || request.nextUrl.host;
  if (resolvedHost) {
    return `${protocol}://${resolvedHost}`;
  }
  return request.nextUrl.origin;
}

function buildRedirect(request: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, resolveRequestOrigin(request)), { status: 303 });
}

function deriveTimeframeSelection(value: string) {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}$/.test(trimmed)) {
    return null;
  }

  const [yearPart, monthPart] = trimmed.split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return null;
  }

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const uploadMonth = monthNames[month - 1] ?? "";
  const fiscalStartYear = month >= 4 ? year : year - 1;
  const fiscalEndYear = fiscalStartYear + 1;
  return {
    financialYear: `${fiscalStartYear}-${fiscalEndYear}`,
    uploadMonth,
  };
}

function revalidateWorkspacePaths() {
  revalidatePath("/admin");
  revalidatePath("/admin/forecast");
  revalidatePath("/admin/master-data");
  revalidatePath("/admin/users");
  revalidatePath("/admin/upload");
  revalidatePath("/admin/upload/budget");
  revalidatePath("/admin/upload/actuals");
  revalidatePath("/admin/upload/global-revenue");
  revalidatePath("/executive");
  revalidatePath("/executive/slicer");
  revalidatePath("/executive/master-data");
  revalidatePath("/bdm");
  revalidatePath("/bdm/slicer");
  revalidatePath("/bdm/analytics-kiosk");
  revalidatePath("/bdm/master-data");
  revalidatePath("/geo-head");
  revalidatePath("/geo-head/slicer");
  revalidatePath("/geo-head/analytics-kiosk");
  revalidatePath("/geo-head/master-data");
  revalidatePath("/practice-head");
  revalidatePath("/practice-head/slicer");
  revalidatePath("/practice-head/analytics-kiosk");
  revalidatePath("/practice-head/master-data");
}

export async function POST(request: NextRequest) {
  const session = await getSessionProfile();
  if (!session) {
    await recordAuditEvent({
      request,
      action: "security.unauthorized_access",
      module: "budget upload",
      description: "Unauthenticated upload attempt.",
      status: "failure",
    });
    return buildRedirect(request, "/login");
  }

  if (!hasPermission(session.role, "upload_data")) {
    await recordAuditEvent({
      session,
      request,
      action: "security.unauthorized_access",
      module: "budget upload",
      description: "Upload attempt without upload_data permission.",
      status: "failure",
    });
    return buildRedirect(request, getDefaultRouteForRole(session.role));
  }

  const rateLimit = checkRateLimit({
    key: rateLimitKey(request, "upload", session.userId),
    limit: 10,
    windowMs: 15 * 60 * 1000,
  });
  if (!rateLimit.allowed) {
    await recordAuditEvent({
      session,
      request,
      action: "security.rate_limited",
      module: "budget upload",
      description: "Upload API rate limit reached.",
      status: "failure",
    });
    return buildRedirect(request, "/admin/upload?error=rate-limited");
  }

  const formData = await request.formData();
  const selectedTimeframe = String(formData.get("timeframeMonth") ?? "").trim();
  const selectedFinancialYear = String(formData.get("financialYear") ?? "").trim();
  const selectedUploadMonth = String(formData.get("uploadMonth") ?? "").trim();
  const derivedTimeframe = deriveTimeframeSelection(selectedTimeframe);
  const financialYear = selectedFinancialYear || derivedTimeframe?.financialYear || "";
  const datasetType = String(formData.get("datasetType") ?? "financial_workbook")
    .trim()
    .toLowerCase();
  const workbook = formData.get("workbook");
  const uploadMonth = selectedUploadMonth || derivedTimeframe?.uploadMonth || "";
  const returnPath = resolveReturnPath(formData.get("returnPath"));

  if (
    !(workbook instanceof File) ||
    workbook.size === 0 ||
    !financialYear ||
    !datasetType
  ) {
    return buildRedirect(request, `${returnPath}?error=missing-upload-fields`);
  }

  if (datasetType === "global_revenue" && !uploadMonth) {
    return buildRedirect(request, `${returnPath}?error=missing-upload-fields`);
  }

  const payload = new FormData();
  payload.append("financial_year", financialYear);
  payload.append("dataset_type", datasetType);
  payload.append("workbook", workbook);
  payload.append("actor_user_id", session.userId);
  payload.append("actor_name", session.name);
  payload.append("actor_role", session.role?.id ?? "");
  if (uploadMonth) {
    payload.append("upload_month", uploadMonth);
  }

  try {
    const response = await fetch(`${BACKEND_API_URL}/api/admin/uploads`, {
      method: "POST",
      body: payload,
      cache: "no-store",
      headers: buildBackendAuthHeaders(session, undefined, request),
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { detail?: string } | null;
      const detail = encodeURIComponent(String(body?.detail ?? "backend-request-failed").slice(0, 240));
      const message = String(body?.detail ?? "").toLowerCase();

      if (message.includes("financial year")) {
        return buildRedirect(
          request,
          `${returnPath}?error=invalid-financial-year${detail ? `&detail=${detail}` : ""}`,
        );
      }

      if (
        message.includes("excel") ||
        message.includes("workbook") ||
        message.includes("file") ||
        message.includes("csv") ||
        message.includes("formula")
      ) {
        return buildRedirect(
          request,
          `${returnPath}?error=invalid-upload-file${detail ? `&detail=${detail}` : ""}`,
        );
      }

      return buildRedirect(
        request,
        `${returnPath}?error=upload-failed${detail ? `&detail=${detail}` : ""}`,
      );
    }
  } catch (error) {
    const detail =
      error instanceof Error ? encodeURIComponent(error.message.slice(0, 240)) : "backend-request-failed";
    return buildRedirect(
      request,
      `${returnPath}?error=upload-failed${detail ? `&detail=${detail}` : ""}`,
    );
  }

  revalidateWorkspacePaths();
  return buildRedirect(request, `${returnPath}?status=upload-complete`);
}
