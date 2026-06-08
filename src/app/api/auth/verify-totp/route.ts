import {
  clearPendingAuth,
  createSession,
  getDefaultRouteForRole,
  getPendingAuthProfile,
} from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { validateTotpToken } from "@/lib/security";
import {
  findRoleById,
  findUserById,
  getAssignedRoleIds,
  readStore,
  writeStore,
} from "@/lib/rbac-store";

import { redirectFromRequest } from "../_shared";

export async function POST(request: Request) {
  const formData = await request.formData();
  const token = String(formData.get("token") ?? "");
  const pendingAuth = await getPendingAuthProfile();
  const rateLimit = checkRateLimit({
    key: rateLimitKey(request, "totp", pendingAuth?.user.email),
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
      action: "auth.totp.verify",
      module: "dashboard",
      description: "TOTP verification was rate limited.",
      status: "failure",
    });
    return redirectFromRequest("/login/totp?error=rate-limited");
  }

  if (!pendingAuth) {
    return redirectFromRequest("/login?error=pending-auth-expired");
  }

  const { user } = pendingAuth;

  if (user.pendingEmailOtpPurpose) {
    return redirectFromRequest(`/login/otp?mode=${user.pendingEmailOtpPurpose}`);
  }

  if (!user.onboardingCompleted) {
    return redirectFromRequest(`/login/setup?email=${encodeURIComponent(user.email)}`);
  }

  if (user.passwordResetRequired) {
    return redirectFromRequest("/login/create-password");
  }

  const store = await readStore();
  const nextUser = findUserById(store, user.id);
  if (!nextUser) {
    return redirectFromRequest("/login?error=pending-auth-expired");
  }

  if (nextUser.pendingEmailOtpPurpose) {
    return redirectFromRequest(`/login/otp?mode=${nextUser.pendingEmailOtpPurpose}`);
  }

  if (!nextUser.onboardingCompleted) {
    return redirectFromRequest(`/login/setup?email=${encodeURIComponent(nextUser.email)}`);
  }

  if (nextUser.passwordResetRequired) {
    return redirectFromRequest("/login/create-password");
  }

  if (!nextUser.totpSecret) {
    return redirectFromRequest("/login/totp?error=invalid-token");
  }

  const validToken = validateTotpToken({
    email: nextUser.email,
    secret: nextUser.totpSecret,
    token,
  });

  if (!validToken) {
    await recordAuditEvent({
      request,
      userId: nextUser.id,
      userEmail: nextUser.email,
      userName: nextUser.name,
      role: nextUser.roleId,
      action: "auth.totp.verify",
      module: "dashboard",
      description: "TOTP verification failed.",
      status: "failure",
    });
    return redirectFromRequest("/login/totp?error=invalid-token");
  }

  nextUser.totpEnabled = true;
  nextUser.totpSetupRequired = false;
  nextUser.lastTotpVerifiedAt = null;
  nextUser.updatedAt = new Date().toISOString();

  await writeStore(store);

  await clearPendingAuth();
  const availableRoles = getAssignedRoleIds(nextUser)
    .map((roleId) => findRoleById(store, roleId))
    .filter((role): role is NonNullable<typeof role> => Boolean(role));
  const primaryRole = availableRoles[0];
  if (!primaryRole) {
    return redirectFromRequest("/login?error=missing-role");
  }
  await createSession(nextUser, primaryRole.id);
  await recordAuditEvent({
    request,
    userId: nextUser.id,
    userEmail: nextUser.email,
    userName: nextUser.name,
    role: primaryRole.id,
    action: "auth.totp.verify",
    module: "dashboard",
    description: "TOTP verification succeeded.",
  });
  if (availableRoles.length > 1) {
    return redirectFromRequest("/login/select-role");
  }
  return redirectFromRequest(getDefaultRouteForRole(primaryRole));
}
