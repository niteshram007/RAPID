import { createPendingAuth, getPendingAuthProfile } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import { clearEmailOtpChallenge, verifyEmailOtpChallenge } from "@/lib/email-otp";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { findUserById, readStore, writeStore } from "@/lib/rbac-store";
import { createTotpSecret } from "@/lib/security";

import { redirectFromRequest } from "../_shared";

export async function POST(request: Request) {
  const formData = await request.formData();
  const token = String(formData.get("token") ?? "");
  const mode = String(formData.get("mode") ?? "onboarding").trim().toLowerCase();
  const purpose =
    mode === "totp-reset"
      ? "totp-reset"
      : mode === "account-recovery"
        ? "account-recovery"
        : "onboarding";
  const pendingAuth = await getPendingAuthProfile();
  const rateLimit = checkRateLimit({
    key: rateLimitKey(request, "email-otp", pendingAuth?.user.email),
    limit: 6,
    windowMs: 10 * 60 * 1000,
  });
  if (!rateLimit.allowed) {
    await recordAuditEvent({
      request,
      userId: pendingAuth?.user.id,
      userEmail: pendingAuth?.user.email,
      userName: pendingAuth?.user.name,
      role: pendingAuth?.role?.id,
      action: "auth.email_otp.verify",
      module: "settings",
      description: "Email OTP verification was rate limited.",
      status: "failure",
      metadata: { purpose },
    });
    return redirectFromRequest(`/login/otp?mode=${purpose}&error=rate-limited`);
  }

  if (!pendingAuth) {
    return redirectFromRequest("/login?error=pending-auth-expired");
  }

  const store = await readStore();
  const user = findUserById(store, pendingAuth.user.id);
  if (!user) {
    return redirectFromRequest("/login?error=pending-auth-expired");
  }

  const verified = await verifyEmailOtpChallenge(user, purpose, token);
  if (!verified) {
    await recordAuditEvent({
      request,
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      role: user.roleId,
      action: "auth.email_otp.verify",
      module: "settings",
      description: "Email OTP verification failed.",
      status: "failure",
      metadata: { purpose },
    });
    return redirectFromRequest(`/login/otp?mode=${purpose}&error=invalid-token`);
  }

  const nowIso = new Date().toISOString();
  clearEmailOtpChallenge(user);

  if (purpose === "onboarding") {
    user.name = user.pendingProfileName || user.name;
    user.mobileNumber = user.pendingMobileNumber || user.mobileNumber;
    user.passwordHash = user.pendingPasswordHash || user.passwordHash;
    user.passwordSalt = user.pendingPasswordSalt || user.passwordSalt;
    user.pendingProfileName = null;
    user.pendingMobileNumber = null;
    user.pendingPasswordHash = null;
    user.pendingPasswordSalt = null;
    user.passwordResetRequired = false;
    user.temporaryPasswordIssuedAt = null;
    user.lastPasswordChangedAt = nowIso;
    user.onboardingCompleted = true;
    user.emailVerifiedAt = nowIso;
    user.mfaRequired = true;
  }

  if (purpose === "account-recovery") {
    user.passwordResetRequired = true;
    user.temporaryPasswordIssuedAt = null;
    user.pendingProfileName = null;
    user.pendingMobileNumber = null;
    user.pendingPasswordHash = null;
    user.pendingPasswordSalt = null;
    user.emailVerifiedAt = user.emailVerifiedAt ?? nowIso;
    user.mfaRequired = true;
  }

  user.totpEnabled = false;
  user.totpSecret = createTotpSecret();
  user.totpSetupRequired = true;
  user.lastTotpVerifiedAt = null;
  user.updatedAt = nowIso;

  await writeStore(store);
  await createPendingAuth(user);
  await recordAuditEvent({
    request,
    userId: user.id,
    userEmail: user.email,
    userName: user.name,
    role: user.roleId,
    action: "auth.email_otp.verify",
    module: "settings",
    description: "Email OTP verification succeeded.",
    metadata: { purpose },
  });
  return redirectFromRequest(
    purpose === "totp-reset"
      ? "/login/totp?mode=reset"
      : purpose === "account-recovery"
        ? "/login/create-password?mode=recovery"
        : "/login/totp?mode=setup",
  );
}
