import nodemailer from "nodemailer";

type PlatformEmail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

let transporterCache: nodemailer.Transporter | null = null;

function getSmtpConfig() {
  const host = String(process.env.SMTP_HOST ?? "").trim();
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = String(process.env.SMTP_USER ?? "").trim();
  const pass = String(process.env.SMTP_PASS ?? "").trim();

  if (!host || !user || !pass || !Number.isFinite(port)) {
    return null;
  }

  return {
    host,
    port,
    secure: port === 465,
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS ?? 15_000),
    greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS ?? 15_000),
    socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS ?? 30_000),
    auth: {
      user,
      pass,
    },
  };
}

function getTransporter() {
  if (transporterCache) {
    return transporterCache;
  }

  const config = getSmtpConfig();
  if (!config) {
    throw new Error("SMTP is not configured for RAPID email delivery.");
  }

  transporterCache = nodemailer.createTransport({
    ...config,
    tls: {
      rejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED === "false" ? false : true,
    },
  });

  return transporterCache;
}

function resetTransporter() {
  transporterCache?.close();
  transporterCache = null;
}

function isRetryableMailError(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /ECONNRESET|ETIMEDOUT|ESOCKET|EPIPE/i.test(code) ||
    /ECONNRESET|timed out|socket|connection/i.test(message);
}

async function sendWithTransporter(config: NonNullable<ReturnType<typeof getSmtpConfig>>, message: PlatformEmail) {
  const transporter = getTransporter();
  await transporter.sendMail({
    from: process.env.SMTP_FROM?.trim() || config.auth.user,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}

export async function sendPlatformEmail(message: PlatformEmail) {
  const config = getSmtpConfig();
  if (!config) {
    throw new Error("SMTP is not configured for RAPID email delivery.");
  }

  try {
    await sendWithTransporter(config, message);
  } catch (error) {
    if (!isRetryableMailError(error)) {
      throw error;
    }
    resetTransporter();
    await sendWithTransporter(config, message);
  }
}
