import { createPendingAuth } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import { issueEmailOtpChallenge } from "@/lib/email-otp";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { findUserByEmail, readStore, writeStore } from "@/lib/rbac-store";
import { hashPassword, validatePasswordPolicy } from "@/lib/security";

import { redirectFromRequest } from "../_shared";

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const fullName = String(formData.get("fullName") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!email || !fullName || !password || !confirmPassword) {
    return redirectFromRequest(`/login/setup?email=${encodeURIComponent(email)}&error=missing-fields`);
  }

  const rateLimit = checkRateLimit({
    key: rateLimitKey(request, "onboarding-otp", email),
    limit: 3,
    windowMs: 15 * 60 * 1000,
  });
  if (!rateLimit.allowed) {
    await recordAuditEvent({
      request,
      userEmail: email,
      action: "auth.onboarding.start",
      module: "users",
      description: "Onboarding OTP request was rate limited.",
      status: "failure",
    });
    return redirectFromRequest(`/login/setup?email=${encodeURIComponent(email)}&error=rate-limited`);
  }

  if (password !== confirmPassword) {
    return redirectFromRequest(`/login/setup?email=${encodeURIComponent(email)}&error=password-mismatch`);
  }

  const passwordPolicyError = validatePasswordPolicy(password);
  if (passwordPolicyError) {
    return redirectFromRequest(`/login/setup?email=${encodeURIComponent(email)}&error=weak-password`);
  }

  const store = await readStore();
  const user = findUserByEmail(store, email);

  if (!user || !user.active || !user.adminCreated) {
    await recordAuditEvent({
      request,
      userEmail: email,
      action: "auth.onboarding.start",
      module: "users",
      description: "Onboarding attempted without a valid invite.",
      status: "failure",
    });
    return redirectFromRequest("/login/setup?error=invite-required");
  }

  if (user.onboardingCompleted && user.passwordHash && user.passwordSalt) {
    return redirectFromRequest(`/login?status=account-ready&email=${encodeURIComponent(email)}`);
  }

  const hashedPassword = await hashPassword(password);
  const nowIso = new Date().toISOString();

  user.pendingProfileName = fullName;
  user.pendingPasswordHash = hashedPassword.hash;
  user.pendingPasswordSalt = hashedPassword.salt;
  user.onboardingStartedAt = nowIso;
  user.updatedAt = nowIso;

  try {
    await issueEmailOtpChallenge(user, "onboarding");
  } catch (error) {
    const detail =
      error instanceof Error ? encodeURIComponent(error.message.slice(0, 180)) : "";
    return redirectFromRequest(
      `/login/setup?email=${encodeURIComponent(email)}&error=otp-delivery-failed${detail ? `&detail=${detail}` : ""}`,
    );
  }

  await writeStore(store);
  await createPendingAuth(user);
  await recordAuditEvent({
    request,
    userId: user.id,
    userEmail: user.email,
    userName: fullName,
    role: user.roleId,
    action: "auth.onboarding.start",
    module: "users",
    description: "Onboarding OTP was requested.",
  });
  return redirectFromRequest("/login/otp?mode=onboarding&status=otp-sent");
}
