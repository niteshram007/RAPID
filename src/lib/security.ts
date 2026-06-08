import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";

import * as OTPAuth from "otpauth";
import QRCode from "qrcode";

import { TOTP_ISSUER } from "@/lib/branding";

const scrypt = promisify(scryptCallback);
const PASSWORD_KEY_LENGTH = 64;

export async function hashPassword(password: string, salt?: string) {
  const resolvedSalt = salt ?? randomBytes(16).toString("hex");
  const derivedKey = (await scrypt(
    password,
    resolvedSalt,
    PASSWORD_KEY_LENGTH,
  )) as Buffer;

  return {
    hash: derivedKey.toString("hex"),
    salt: resolvedSalt,
  };
}

export async function verifyPassword(options: {
  password: string;
  passwordHash: string;
  passwordSalt: string;
}) {
  const { password, passwordHash, passwordSalt } = options;

  const derivedKey = (await scrypt(
    password,
    passwordSalt,
    PASSWORD_KEY_LENGTH,
  )) as Buffer;
  const storedHash = Buffer.from(passwordHash, "hex");

  if (storedHash.length !== derivedKey.length) {
    return false;
  }

  return timingSafeEqual(storedHash, derivedKey);
}

export function validatePasswordPolicy(password: string) {
  if (password.length < 8) {
    return "Use at least 8 characters.";
  }

  if (!/[A-Z]/.test(password)) {
    return "Include at least one uppercase letter.";
  }

  if (!/[a-z]/.test(password)) {
    return "Include at least one lowercase letter.";
  }

  if (!(/[0-9]/.test(password) || /[^A-Za-z0-9]/.test(password))) {
    return "Include at least one number or symbol.";
  }

  return null;
}

export function createTotpSecret() {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

export function buildTotp(options: { email: string; secret: string }) {
  return new OTPAuth.TOTP({
    issuer: TOTP_ISSUER,
    label: options.email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: options.secret,
  });
}

export function normalizeTotpToken(token: string) {
  return token.replace(/\s+/g, "").trim();
}

export function validateTotpToken(options: { email: string; secret: string; token: string }) {
  const totp = buildTotp({
    email: options.email,
    secret: options.secret,
  });

  return totp.validate({
    token: normalizeTotpToken(options.token),
    window: 1,
  }) !== null;
}

export async function createTotpSetup(options: {
  email: string;
  secret: string;
}) {
  const totp = buildTotp(options);
  const otpauthUri = totp.toString();
  const qrCodeSvg = await QRCode.toString(otpauthUri, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 4,
    width: 360,
    color: {
      dark: "#000000",
      light: "#FFFFFF",
    },
  });

  return {
    secret: options.secret,
    otpauthUri,
    qrCodeSvg,
  };
}
