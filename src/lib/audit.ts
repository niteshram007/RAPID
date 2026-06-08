import type { NextRequest } from "next/server";

import { buildServiceSignatureHeaders } from "@/lib/backend-security";
import type { SessionProfile } from "@/lib/auth";

const BACKEND_API_URL = process.env.BACKEND_API_URL ?? "http://127.0.0.1:8000";

function requestIp(request?: NextRequest | Request | null) {
  if (!request) {
    return "";
  }
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    ""
  );
}

export async function recordAuditEvent(options: {
  session?: SessionProfile | null;
  request?: NextRequest | Request | null;
  userId?: string | null;
  userEmail?: string | null;
  userName?: string | null;
  role?: string | null;
  action: string;
  module: string;
  description: string;
  status?: "success" | "failure";
  metadata?: Record<string, unknown>;
}) {
  const headers = buildServiceSignatureHeaders({
    "Content-Type": "application/json",
  });
  const session = options.session;
  try {
    await fetch(`${BACKEND_API_URL}/api/audit/events`, {
      method: "POST",
      cache: "no-store",
      headers,
      body: JSON.stringify({
        userId: options.userId ?? session?.userId ?? null,
        userEmail: options.userEmail ?? session?.email ?? null,
        userName: options.userName ?? session?.name ?? null,
        role: options.role ?? session?.role?.id ?? session?.roleId ?? null,
        action: options.action,
        module: options.module,
        description: options.description,
        status: options.status ?? "success",
        ipAddress: requestIp(options.request),
        userAgent: options.request?.headers.get("user-agent") ?? "",
        metadata: options.metadata ?? {},
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Audit logging should never block the user workflow.
  }
}
