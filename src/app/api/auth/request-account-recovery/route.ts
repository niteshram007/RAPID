import { clearSession, createPendingAuth, getSessionProfile } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import { issueEmailOtpChallenge } from "@/lib/email-otp";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { findUserByEmail, readStore, writeStore } from "@/lib/rbac-store";

import { redirectFromRequest } from "../_shared";

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!email) {
    return redirectFromRequest("/login/recover-account?error=missing-email");
  }

  const rateLimit = checkRateLimit({
    key: rateLimitKey(request, "password-reset", email),
    limit: 3,
    windowMs: 15 * 60 * 1000,
  });
  if (!rateLimit.allowed) {
    await recordAuditEvent({
      request,
      userEmail: email,
      action: "auth.password_reset.request",
      module: "settings",
      description: "Password reset request was rate limited.",
      status: "failure",
    });
    return redirectFromRequest("/login/recover-account?error=rate-limited");
  }

  const store = await readStore();
  const user = findUserByEmail(store, email);

  if (!user || !user.active || !user.adminCreated || !user.onboardingCompleted) {
    await recordAuditEvent({
      request,
      userEmail: email,
      action: "auth.password_reset.request",
      module: "settings",
      description: "Password reset requested for an invalid account.",
      status: "failure",
    });
    return redirectFromRequest("/login/recover-account?error=invalid-account");
  }

  try {
    await issueEmailOtpChallenge(user, "account-recovery");
  } catch (error) {
    const detail =
      error instanceof Error ? encodeURIComponent(error.message.slice(0, 180)) : "";
    return redirectFromRequest(
      `/login/recover-account?error=otp-delivery-failed${detail ? `&detail=${detail}` : ""}`,
    );
  }

  await writeStore(store);
  const session = await getSessionProfile();
  if (session?.userId === user.id) {
    await clearSession();
  }
  await createPendingAuth(user);
  await recordAuditEvent({
    request,
    userId: user.id,
    userEmail: user.email,
    userName: user.name,
    role: user.roleId,
    action: "auth.password_reset.request",
    module: "settings",
    description: "Password reset OTP was requested.",
  });
  return redirectFromRequest("/login/otp?mode=account-recovery&status=otp-sent");
}
