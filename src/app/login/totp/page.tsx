import { ShieldCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth-shell";
import {
  getDefaultRouteForRole,
  getPendingAuthProfile,
  getSessionProfile,
} from "@/lib/auth";
import { createTotpSetup } from "@/lib/security";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const totpMessages = {
  "invalid-token": {
    message: "Invalid verification code. Enter the latest 6-digit code.",
  },
} as const;

function resolveQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function TotpPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const pendingAuth = await getPendingAuthProfile();
  const session = await getSessionProfile();

  if (!pendingAuth && session) {
    redirect(getDefaultRouteForRole(session.role));
  }

  if (!pendingAuth) {
    redirect("/login");
  }

  if (pendingAuth.user.pendingEmailOtpPurpose) {
    redirect(`/login/otp?mode=${pendingAuth.user.pendingEmailOtpPurpose}`);
  }

  if (!pendingAuth.user.onboardingCompleted) {
    redirect(`/login/setup?email=${encodeURIComponent(pendingAuth.user.email)}`);
  }

  if (pendingAuth.user.passwordResetRequired) {
    redirect("/login/create-password");
  }

  const needsSetup =
    pendingAuth.user.mfaRequired &&
    (pendingAuth.user.totpSetupRequired || !pendingAuth.user.totpEnabled);
  const setup =
    needsSetup && pendingAuth.user.totpSecret
      ? await createTotpSetup({
          email: pendingAuth.user.email,
          secret: pendingAuth.user.totpSecret,
        })
      : null;

  const query = await searchParams;
  const mode = resolveQueryValue(query.mode);
  const errorKey = resolveQueryValue(query.error);
  const feedback = errorKey
    ? totpMessages[errorKey as keyof typeof totpMessages]
    : null;

  return (
    <AuthShell
      eyebrow="Verification"
      title="Enter your 6-digit code"
      description={
        setup
          ? mode === "reset"
            ? "Scan the new Microsoft Authenticator QR code, then enter the latest 6-digit code."
            : "Scan the QR code in Microsoft Authenticator, then enter the 6-digit code."
          : "Complete sign-in using your authenticator code."
      }
      panel={
        <article className="auth-panel-card px-6 py-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-950">
                Two-step verification
              </p>
              <p className="text-sm text-slate-600">
                {setup
                  ? mode === "reset"
                    ? "Re-enroll Microsoft Authenticator for this account."
                    : "Enroll Microsoft Authenticator for this account."
                  : "Enter the latest code from your authenticator app."}
              </p>
            </div>
          </div>
          {setup ? (
            <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
              <Image
                src={`data:image/svg+xml;utf8,${encodeURIComponent(setup.qrCodeSvg)}`}
                alt="Scan this QR code with Microsoft Authenticator"
                width={224}
                height={224}
                unoptimized
                className="mx-auto h-56 w-56 rounded-xl border border-slate-100 bg-white p-2"
              />
              <p className="mt-3 text-center text-xs text-slate-500">
                Open Microsoft Authenticator, add account, and scan this QR.
              </p>
            </div>
          ) : null}
        </article>
      }
    >
      {feedback ? (
        <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800">
          {feedback.message}
        </div>
      ) : null}

      <form action="/api/auth/verify-totp" method="post" className="mt-6 space-y-5" autoComplete="off">
        <div>
          <label className="block text-sm font-semibold text-slate-700" htmlFor="token">
            Verification code
          </label>
          <input
            id="token"
            name="token"
            type="password"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="auth-input text-center text-2xl tracking-[0.35em]"
          />
        </div>

        <button type="submit" className="auth-button-primary flex w-full justify-center">
          Verify
        </button>
      </form>

      <form action="/api/auth/cancel-pending" method="post" className="mt-4">
        <button type="submit" className="auth-button-secondary w-full">
          Back
        </button>
      </form>
      <Link href="/login/reset-totp" className="mt-4 block text-center text-sm font-semibold text-slate-700 underline underline-offset-4">
        Forgot or change Microsoft TOTP?
      </Link>
    </AuthShell>
  );
}
