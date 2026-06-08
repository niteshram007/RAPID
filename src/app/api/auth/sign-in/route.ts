import {
  clearPendingAuth,
  createPendingAuth,
  createSession,
  getDefaultRouteForRole,
} from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import {
  findRoleById,
  findUserByEmail,
  getAssignedRoleIds,
  readStore,
  verifyUserPassword,
} from "@/lib/rbac-store";

import { redirectFromRequest } from "../_shared";

export async function POST(request: Request) {
  await clearPendingAuth();

  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!password) {
    await recordAuditEvent({
      request,
      userEmail: email,
      action: "auth.login",
      module: "dashboard",
      description: "Login failed because password was missing.",
      status: "failure",
    });
    return redirectFromRequest("/login?error=missing-password");
  }
  const rateLimit = checkRateLimit({
    key: rateLimitKey(request, "login", email),
    limit: 5,
    windowMs: 15 * 60 * 1000,
  });
  if (!rateLimit.allowed) {
    await recordAuditEvent({
      request,
      userEmail: email,
      action: "auth.login",
      module: "dashboard",
      description: "Login attempt was rate limited.",
      status: "failure",
    });
    return redirectFromRequest("/login?error=rate-limited");
  }

  const store = await readStore();
  const user = findUserByEmail(store, email);

  if (!user) {
    await recordAuditEvent({
      request,
      userEmail: email,
      action: "auth.login",
      module: "dashboard",
      description: "Login failed due to invalid credentials.",
      status: "failure",
    });
    return redirectFromRequest("/login?error=invalid-credentials");
  }

  if (!user.active) {
    await recordAuditEvent({
      request,
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      role: user.roleId,
      action: "auth.login",
      module: "dashboard",
      description: "Inactive user attempted to sign in.",
      status: "failure",
    });
    return redirectFromRequest("/login?error=inactive-user");
  }

  if (!user.adminCreated) {
    await recordAuditEvent({
      request,
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      role: user.roleId,
      action: "auth.login",
      module: "dashboard",
      description: "User without admin-created access attempted to sign in.",
      status: "failure",
    });
    return redirectFromRequest("/login?error=no-access");
  }

  if (!user.onboardingCompleted || !user.passwordHash || !user.passwordSalt) {
    return redirectFromRequest(`/login/setup?email=${encodeURIComponent(user.email)}`);
  }

  const validPassword = await verifyUserPassword(user, password);
  if (!validPassword) {
    await recordAuditEvent({
      request,
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      role: user.roleId,
      action: "auth.login",
      module: "dashboard",
      description: "Login failed due to invalid credentials.",
      status: "failure",
    });
    return redirectFromRequest("/login?error=invalid-credentials");
  }

  const availableRoles = getAssignedRoleIds(user)
    .map((roleId) => findRoleById(store, roleId))
    .filter((role): role is NonNullable<typeof role> => Boolean(role));
  const primaryRole = availableRoles[0];
  if (!primaryRole) {
    return redirectFromRequest("/login?error=missing-role");
  }

  if (user.passwordResetRequired) {
    await createPendingAuth(user);
    return redirectFromRequest("/login/create-password");
  }

  if (user.mfaRequired || user.totpEnabled || user.totpSetupRequired) {
    await createPendingAuth(user);
    return redirectFromRequest("/login/totp");
  }

  await createSession(user, primaryRole.id);
  await recordAuditEvent({
    request,
    userId: user.id,
    userEmail: user.email,
    userName: user.name,
    role: primaryRole.id,
    action: "auth.login",
    module: "dashboard",
    description: "User signed in successfully.",
  });
  if (availableRoles.length > 1) {
    return redirectFromRequest("/login/select-role");
  }
  return redirectFromRequest(getDefaultRouteForRole(primaryRole));
}
