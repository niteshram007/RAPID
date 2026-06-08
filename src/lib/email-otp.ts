import { randomInt } from "crypto";

import type { EmailOtpPurpose, UserRecord } from "@/lib/rbac-store";
import { sendPlatformEmail } from "@/lib/mailer";
import { hashPassword, verifyPassword } from "@/lib/security";

const DEFAULT_EMAIL_OTP_MINUTES = 10;
const EMAIL_OTP_MINUTES = Math.max(
  Number(process.env.RAPID_EMAIL_OTP_MINUTES ?? DEFAULT_EMAIL_OTP_MINUTES),
  5,
);

export function getEmailOtpLifetimeMinutes() {
  return EMAIL_OTP_MINUTES;
}

export function normalizeEmailOtpToken(token: string) {
  return token.replace(/\D+/g, "").slice(0, 6);
}

function buildEmailOtpCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function buildEmailOtpExpiry() {
  return new Date(Date.now() + EMAIL_OTP_MINUTES * 60_000).toISOString();
}

function buildEmailOtpSubject(purpose: EmailOtpPurpose) {
  if (purpose === "totp-reset") {
    return "RAPID authenticator reset verification code";
  }
  if (purpose === "account-recovery") {
    return "RAPID account recovery verification code";
  }
  return "RAPID account verification code";
}

function buildEmailOtpMessage(options: {
  user: UserRecord;
  purpose: EmailOtpPurpose;
  code: string;
}) {
  const intro =
    options.purpose === "totp-reset"
      ? "Use this one-time code to confirm your Microsoft Authenticator reset request."
      : options.purpose === "account-recovery"
        ? "Use this one-time code to confirm your RAPID password and authenticator recovery request."
        : "Use this one-time code to confirm your RAPID account setup.";

  const text = [
    `Hello ${options.user.pendingProfileName || options.user.name},`,
    "",
    intro,
    "",
    `Verification code: ${options.code}`,
    `This code expires in ${EMAIL_OTP_MINUTES} minutes.`,
    "",
    "If you did not request this action, please report it to the IT team immediately.",
  ].join("\n");

  const html = [
    `<p>Hello ${options.user.pendingProfileName || options.user.name},</p>`,
    `<p>${intro}</p>`,
    `<p style="font-size:28px;font-weight:700;letter-spacing:0.25em;">${options.code}</p>`,
    `<p>This code expires in ${EMAIL_OTP_MINUTES} minutes.</p>`,
    "<p>If you did not request this action, please report it to the IT team immediately.</p>",
  ].join("");

  return { text, html };
}

export async function issueEmailOtpChallenge(
  user: UserRecord,
  purpose: EmailOtpPurpose,
) {
  const code = buildEmailOtpCode();
  const hashed = await hashPassword(code);
  const nowIso = new Date().toISOString();

  user.pendingEmailOtpHash = hashed.hash;
  user.pendingEmailOtpSalt = hashed.salt;
  user.pendingEmailOtpExpiresAt = buildEmailOtpExpiry();
  user.pendingEmailOtpPurpose = purpose;
  user.pendingEmailOtpSentAt = nowIso;
  user.updatedAt = nowIso;

  const message = buildEmailOtpMessage({ user, purpose, code });
  await sendPlatformEmail({
    to: user.email,
    subject: buildEmailOtpSubject(purpose),
    text: message.text,
    html: message.html,
  });
}

export async function verifyEmailOtpChallenge(
  user: UserRecord,
  purpose: EmailOtpPurpose,
  token: string,
) {
  const normalizedToken = normalizeEmailOtpToken(token);

  if (
    !normalizedToken ||
    !user.pendingEmailOtpHash ||
    !user.pendingEmailOtpSalt ||
    !user.pendingEmailOtpExpiresAt ||
    user.pendingEmailOtpPurpose !== purpose
  ) {
    return false;
  }

  const expiresAt = new Date(user.pendingEmailOtpExpiresAt);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
    return false;
  }

  return verifyPassword({
    password: normalizedToken,
    passwordHash: user.pendingEmailOtpHash,
    passwordSalt: user.pendingEmailOtpSalt,
  });
}

export function clearEmailOtpChallenge(user: UserRecord) {
  user.pendingEmailOtpHash = null;
  user.pendingEmailOtpSalt = null;
  user.pendingEmailOtpExpiresAt = null;
  user.pendingEmailOtpPurpose = null;
  user.pendingEmailOtpSentAt = null;
}
