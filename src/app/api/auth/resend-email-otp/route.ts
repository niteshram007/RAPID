import { createPendingAuth, getPendingAuthProfile } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import { issueEmailOtpChallenge } from "@/lib/email-otp";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { findUserById, readStore, writeStore } from "@/lib/rbac-store";

import { redirectFromRequest } from "../_shared";

export async function POST(request: Request) {
  const pendingAuth = await getPendingAuthProfile();

  if (!pendingAuth) {
    return redirectFromRequest("/login?error=pending-auth-expired");
  }

  const store = await readStore();
  const user = findUserById(store, pendingAuth.user.id);

  if (!user || !user.pendingEmailOtpPurpose) {
    return redirectFromRequest("/login?error=pending-auth-expired");
  }

  const rateLimit = checkRateLimit({
    key: rateLimitKey(request, "email-otp-resend", user.email),
    limit: 3,
    windowMs: 10 * 60 * 1000,
  });
  if (!rateLimit.allowed) {
    await recordAuditEvent({
      request,
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      role: user.roleId,
      action: "auth.email_otp.resend",
      module: "settings",
      description: "Email OTP resend was rate limited.",
      status: "failure",
      metadata: { purpose: user.pendingEmailOtpPurpose },
    });
    return redirectFromRequest(`/login/otp?mode=${user.pendingEmailOtpPurpose}&error=rate-limited`);
  }

  try {
    await issueEmailOtpChallenge(user, user.pendingEmailOtpPurpose);
  } catch (error) {
    const detail =
      error instanceof Error ? encodeURIComponent(error.message.slice(0, 180)) : "";
    return redirectFromRequest(
      `/login/otp?mode=${user.pendingEmailOtpPurpose}&error=otp-delivery-failed${detail ? `&detail=${detail}` : ""}`,
    );
  }

  await writeStore(store);
  await createPendingAuth(user);
  await recordAuditEvent({
    request,
    userId: user.id,
    userEmail: user.email,
    userName: user.name,
    role: user.roleId,
    action: "auth.email_otp.resend",
    module: "settings",
    description: "Email OTP was resent.",
    metadata: { purpose: user.pendingEmailOtpPurpose },
  });
  return redirectFromRequest(`/login/otp?mode=${user.pendingEmailOtpPurpose}&status=otp-sent`);
}
