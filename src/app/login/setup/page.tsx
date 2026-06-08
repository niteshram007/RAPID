import { ArrowRight, MailCheck, UserRound } from "lucide-react";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth-shell";
import {
  getDefaultRouteForRole,
  getPendingAuthProfile,
  getSessionProfile,
} from "@/lib/auth";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const setupMessages = {
  "missing-fields": "Complete every setup field before continuing.",
  "password-mismatch": "The passwords do not match.",
  "weak-password": "Use at least 8 characters with uppercase, lowercase, and a number or symbol.",
  "invite-required": "Only admin-created accounts can complete RAPID sign up.",
  "otp-delivery-failed": "RAPID could not send the email verification code.",
} as const;

function resolveQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginSetupPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const pendingAuth = await getPendingAuthProfile();
  const session = await getSessionProfile();

  if (!pendingAuth && session) {
    redirect(getDefaultRouteForRole(session.role));
  }

  if (pendingAuth?.user.pendingEmailOtpPurpose === "onboarding") {
    redirect("/login/otp?mode=onboarding");
  }

  const query = await searchParams;
  const email = resolveQueryValue(query.email) ?? pendingAuth?.user.email ?? "";
  const errorKey = resolveQueryValue(query.error);
  const detail = resolveQueryValue(query.detail);

  return (
    <AuthShell
      eyebrow="Enterprise sign up"
      title="Complete your invited-user sign up."
      description="Only accounts created by the RAPID admin team can be activated here. After this step, we'll verify your email with OTP and then enroll Microsoft Authenticator."
      panel={
        <div className="space-y-4">
          <article className="auth-panel-card px-6 py-6">
            <span className="auth-pill">
              <MailCheck className="h-4 w-4" />
              Invite-only access
            </span>
            <h2 className="font-display mt-5 text-4xl tracking-tight text-slate-950">
              Secure first-time login
            </h2>
            <p className="mt-5 text-base leading-8 text-slate-600">
              Your admin creates the account shell. You finish sign up with your
              name, password, email OTP, and Microsoft TOTP.
            </p>
          </article>

          <article className="auth-panel-card px-6 py-6">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white">
                <UserRound className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-slate-950">What happens next</p>
                <p className="text-sm text-slate-600">1. Save your details and password.</p>
                <p className="text-sm text-slate-600">2. Enter the OTP sent to your email.</p>
                <p className="text-sm text-slate-600">
                  3. Scan Microsoft Authenticator and verify the 6-digit code.
                </p>
              </div>
            </div>
          </article>
        </div>
      }
    >
      {errorKey ? (
        <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800">
          {setupMessages[errorKey as keyof typeof setupMessages] ?? "Unable to continue sign up."}
          {detail ? ` ${decodeURIComponent(detail)}` : ""}
        </div>
      ) : null}

      <form action="/api/auth/start-onboarding" method="post" className="mt-6 space-y-5">
        <div>
          <label className="block text-sm font-semibold text-slate-700" htmlFor="fullName">
            Full name
          </label>
          <input id="fullName" name="fullName" required className="auth-input" />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700" htmlFor="email">
            Mail ID
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            defaultValue={email}
            className="auth-input"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700" htmlFor="password">
            Password
          </label>
          <input id="password" name="password" type="password" required className="auth-input" />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700" htmlFor="confirmPassword">
            Confirm password
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            className="auth-input"
          />
        </div>

        <button type="submit" className="auth-button-primary flex w-full gap-2">
          Send OTP
          <ArrowRight className="h-4 w-4" />
        </button>
      </form>

      <form action="/api/auth/cancel-pending" method="post" className="mt-4">
        <button type="submit" className="auth-button-secondary w-full">
          Back to sign in
        </button>
      </form>
    </AuthShell>
  );
}
