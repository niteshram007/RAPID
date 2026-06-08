"use server";

import { redirect } from "next/navigation";

import {
  clearPendingAuth,
  clearSession,
  createPendingAuth,
  createSession,
  getDefaultRouteForRole,
  getPendingAuthProfile,
} from "@/lib/auth";
import {
  findRoleById,
  findUserById,
  findUserByEmail,
  readStore,
  verifyUserPassword,
  writeStore,
} from "@/lib/rbac-store";
import {
  createTotpSecret,
  hashPassword,
  validatePasswordPolicy,
  validateTotpToken,
} from "@/lib/security";

export async function signInAction(formData: FormData) {
  await clearPendingAuth();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const store = await readStore();
  const user = findUserByEmail(store, email);

  if (!user) {
    redirect("/login?error=invalid-credentials");
  }

  if (!user.active) {
    redirect("/login?error=inactive-user");
  }

  const validPassword = await verifyUserPassword(user, password);

  if (!validPassword) {
    redirect("/login?error=invalid-credentials");
  }

  const role = findRoleById(store, user.roleId);

  if (!role) {
    redirect("/login?error=missing-role");
  }

  if (user.passwordResetRequired) {
    await createPendingAuth(user);
    redirect("/login/create-password");
  }

  if (user.mfaRequired) {
    await createPendingAuth(user);
    redirect("/login/totp");
  }

  await createSession(user);
  redirect(getDefaultRouteForRole(role));
}

export async function setFirstPasswordAction(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const pendingAuth = await getPendingAuthProfile();

  if (!pendingAuth) {
    redirect("/login?error=pending-auth-expired");
  }

  const { user, role } = pendingAuth;

  if (!user.passwordResetRequired) {
    if (user.mfaRequired && !user.totpEnabled) {
      redirect("/login/totp");
    }

    await clearPendingAuth();
    await createSession(user);
    redirect(getDefaultRouteForRole(role));
  }

  if (!password || !confirmPassword) {
    redirect("/login/create-password?error=missing-password");
  }

  if (password !== confirmPassword) {
    redirect("/login/create-password?error=password-mismatch");
  }

  if (await verifyUserPassword(user, password)) {
    redirect("/login/create-password?error=same-as-temp");
  }

  if (validatePasswordPolicy(password)) {
    redirect("/login/create-password?error=weak-password");
  }

  const store = await readStore();
  const nextUser = findUserById(store, user.id);

  if (!nextUser) {
    redirect("/login?error=pending-auth-expired");
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

  if (nextUser.mfaRequired && !nextUser.totpEnabled) {
    redirect("/login/totp");
  }

  await clearPendingAuth();
  await createSession(nextUser);
  redirect(getDefaultRouteForRole(findRoleById(store, nextUser.roleId)));
}

export async function verifyTotpAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const pendingAuth = await getPendingAuthProfile();

  if (!pendingAuth) {
    redirect("/login?error=pending-auth-expired");
  }

  const { user } = pendingAuth;

  if (user.passwordResetRequired) {
    redirect("/login/create-password");
  }

  const store = await readStore();
  const nextUser = findUserById(store, user.id);

  if (!nextUser) {
    redirect("/login?error=pending-auth-expired");
  }

  if (nextUser.passwordResetRequired) {
    redirect("/login/create-password");
  }

  if (!nextUser.totpSecret) {
    redirect("/login/totp?error=invalid-token");
  }

  const validToken = validateTotpToken({
    email: nextUser.email,
    secret: nextUser.totpSecret,
    token,
  });

  if (!validToken) {
    redirect("/login/totp?error=invalid-token");
  }

  nextUser.totpEnabled = true;
  nextUser.totpSetupRequired = false;
  nextUser.lastTotpVerifiedAt = null;
  nextUser.updatedAt = new Date().toISOString();

  await writeStore(store);

  await clearPendingAuth();
  await createSession(nextUser);

  redirect(getDefaultRouteForRole(findRoleById(store, nextUser.roleId)));
}

export async function cancelPendingSignInAction() {
  await clearPendingAuth();
  redirect("/login");
}

export async function cancelPendingTotpAction() {
  await cancelPendingSignInAction();
}

export async function signOutAction() {
  await clearPendingAuth();
  await clearSession();
  redirect("/");
}
