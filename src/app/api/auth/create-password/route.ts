import {
  clearPendingAuth,
  createSession,
  getDefaultRouteForRole,
  getPendingAuthProfile,
} from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { createTotpSecret, hashPassword, validatePasswordPolicy } from "@/lib/security";
import { findRoleById, findUserById, verifyUserPassword, readStore, writeStore } from "@/lib/rbac-store";

import { redirectFromRequest } from "../_shared";

export async function POST(request: Request) {
  const formData = await request.formData();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const mode = String(formData.get("mode") ?? "").trim().toLowerCase();
  const totpRedirect = mode === "recovery" ? "/login/totp?mode=reset" : "/login/totp";
  const pendingAuth = await getPendingAuthProfile();
  const rateLimit = checkRateLimit({
    key: rateLimitKey(request, "create-password", pendingAuth?.user.email),
    limit: 5,
    windowMs: 15 * 60 * 1000,
  });
  if (!rateLimit.allowed) {
    await recordAuditEvent({
      request,
      userId: pendingAuth?.user.id,
      userEmail: pendingAuth?.user.email,
      userName: pendingAuth?.user.name,
      role: pendingAuth?.role?.id,
      action: "auth.password_update",
      module: "settings",
      description: "Password update was rate limited.",
      status: "failure",
    });
    return redirectFromRequest("/login/create-password?error=rate-limited");
  }

  if (!pendingAuth) {
    return redirectFromRequest("/login?error=pending-auth-expired");
  }

  const { user, role } = pendingAuth;

  if (!user.passwordResetRequired) {
    if (user.mfaRequired && !user.totpEnabled) {
      return redirectFromRequest(totpRedirect);
    }

    await clearPendingAuth();
    await createSession(user);
    return redirectFromRequest(getDefaultRouteForRole(role));
  }

  if (!password || !confirmPassword) {
    return redirectFromRequest("/login/create-password?error=missing-password");
  }

  if (password !== confirmPassword) {
    return redirectFromRequest("/login/create-password?error=password-mismatch");
  }

  if (await verifyUserPassword(user, password)) {
    return redirectFromRequest("/login/create-password?error=same-as-temp");
  }

  if (validatePasswordPolicy(password)) {
    return redirectFromRequest("/login/create-password?error=weak-password");
  }

  const store = await readStore();
  const nextUser = findUserById(store, user.id);
  if (!nextUser) {
    return redirectFromRequest("/login?error=pending-auth-expired");
  }

  const hashedPassword = await hashPassword(password);
  const now = new Date().toISOString();

  nextUser.passwordHash = hashedPassword.hash;
  nextUser.passwordSalt = hashedPassword.salt;
  nextUser.passwordResetRequired = false;
  nextUser.temporaryPasswordIssuedAt = null;
  nextUser.lastPasswordChangedAt = now;
  nextUser.updatedAt = now;

  if (nextUser.mfaRequired && !nextUser.totpEnabled) {
    nextUser.totpSecret = nextUser.totpSecret ?? createTotpSecret();
    nextUser.totpSetupRequired = !nextUser.totpEnabled;
  }

  await writeStore(store);
  await recordAuditEvent({
    request,
    userId: nextUser.id,
    userEmail: nextUser.email,
    userName: nextUser.name,
    role: nextUser.roleId,
    action: "auth.password_update",
    module: "settings",
    description: "User password was updated.",
  });

  if (nextUser.mfaRequired && !nextUser.totpEnabled) {
    return redirectFromRequest(totpRedirect);
  }

  await clearPendingAuth();
  await createSession(nextUser);
  return redirectFromRequest(getDefaultRouteForRole(findRoleById(store, nextUser.roleId)));
}
