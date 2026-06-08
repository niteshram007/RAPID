import { KeyRound, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth-shell";
import { getPendingAuthProfile, getSessionProfile } from "@/lib/auth";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const recoveryMessages = {
  "missing-email": "Enter the work email for the account you want to recover.",
  "invalid-account": "That account is not eligible for RAPID recovery.",
  "otp-delivery-failed": "RAPID could not send the email verification code.",
} as const;

function resolveQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function RecoverAccountPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const pendingAuth = await getPendingAuthProfile();
  if (pendingAuth?.user.pendingEmailOtpPurpose === "account-recovery") {
    redirect("/login/otp?mode=account-recovery");
  }

  const session = await getSessionProfile();
  const query = await searchParams;
  const errorKey = resolveQueryValue(query.error);
  const detail = resolveQueryValue(query.detail);
  const defaultEmail = session?.email ?? resolveQueryValue(query.email) ?? "";

  return (
    <AuthShell
      eyebrow="Account recovery"
      title="Reset password and Microsoft TOTP."
      description="RAPID will verify your account by email OTP first. After that, you'll set a new password and enroll a fresh Microsoft Authenticator code."
      panel={
        <div className="space-y-4">
          <article className="auth-panel-card px-6 py-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white">
                <KeyRound className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-950">Enterprise recovery</p>
                <p className="text-sm text-slate-600">
                  This flow resets both your sign-in password and Microsoft TOTP.
                </p>
              </div>
            </div>
          </article>

          <article className="auth-panel-card px-6 py-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-950">What happens next</p>
                <p className="text-sm text-slate-600">1. Verify the request with email OTP.</p>
                <p className="text-sm text-slate-600">2. Set a new password.</p>
                <p className="text-sm text-slate-600">3. Scan a fresh Microsoft Authenticator QR code.</p>
              </div>
            </div>
          </article>
        </div>
      }
    >
      {errorKey ? (
        <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800">
          {recoveryMessages[errorKey as keyof typeof recoveryMessages] ?? "Unable to continue recovery."}
          {detail ? ` ${decodeURIComponent(detail)}` : ""}
        </div>
      ) : null}

      <form action="/api/auth/request-account-recovery" method="post" className="mt-6 space-y-5">
        <div>
          <label className="block text-sm font-semibold text-slate-700" htmlFor="email">
            Work email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            defaultValue={defaultEmail}
            className="auth-input"
          />
        </div>

        <button type="submit" className="auth-button-primary w-full">
          Send recovery OTP
        </button>
      </form>
    </AuthShell>
  );
}
