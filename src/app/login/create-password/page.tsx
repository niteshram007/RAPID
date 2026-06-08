import { ArrowRight, KeyRound, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth-shell";
import {
  getDefaultRouteForRole,
  getPendingAuthProfile,
  getSessionProfile,
} from "@/lib/auth";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const passwordMessages = {
  "missing-password": {
    message: "Enter and confirm the new password before continuing.",
  },
  "password-mismatch": {
    message: "The two passwords do not match.",
  },
  "weak-password": {
    message:
      "Use at least 8 characters with uppercase, lowercase, and a number or symbol.",
  },
  "same-as-temp": {
    message: "Choose a new password instead of reusing the current password.",
  },
} as const;

function resolveQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CreatePasswordPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getSessionProfile();

  if (session) {
    redirect(getDefaultRouteForRole(session.role));
  }

  const pendingAuth = await getPendingAuthProfile();

  if (!pendingAuth) {
    redirect("/login");
  }

  if (!pendingAuth.user.passwordResetRequired) {
    if (pendingAuth.user.mfaRequired) {
      redirect("/login/totp");
    }

    redirect("/login");
  }

  const query = await searchParams;
  const errorKey = resolveQueryValue(query.error);
  const mode = resolveQueryValue(query.mode);
  const isRecoveryMode = mode === "recovery";
  const feedback = errorKey
    ? passwordMessages[errorKey as keyof typeof passwordMessages]
    : null;

  const panel = (
    <>
      <div className="auth-panel-card px-6 py-6 lg:px-8 lg:py-8">
        <span className="auth-pill">
          <KeyRound className="h-4 w-4" />
          {isRecoveryMode ? "Account recovery password reset" : "First-time password setup"}
        </span>
        <h2 className="font-display mt-5 text-4xl tracking-tight text-slate-950 lg:text-[3rem] lg:leading-[1.02]">
          {isRecoveryMode ? "Set your new enterprise password." : "Create your permanent password."}
        </h2>
        <p className="mt-5 max-w-2xl text-base leading-8 text-slate-600">
          {isRecoveryMode
            ? "Your identity has been verified. Choose a new password before RAPID issues a fresh Microsoft Authenticator setup."
            : "Your admin gave you a temporary password for first access. Replace it now with a password only you know before moving to the next sign-in step."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <article className="auth-panel-card px-6 py-6">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-700">
            Account
          </p>
          <p className="mt-4 text-lg font-semibold text-slate-950">
            {pendingAuth.user.email}
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {pendingAuth.user.title} - {pendingAuth.role?.name ?? "Assigned role"}
          </p>
        </article>

        <article className="auth-panel-card px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-slate-950">What happens next</p>
              <p className="text-sm text-slate-600">
                Save your password first. Next you will configure Microsoft Authenticator.
              </p>
            </div>
          </div>
          <div className="mt-5 space-y-3 text-sm leading-7 text-slate-600">
            <p>1. Save a permanent password.</p>
            <p>2. Scan the QR in Microsoft Authenticator.</p>
            <p>3. Enter the 6-digit code to finish sign-in.</p>
          </div>
        </article>
      </div>
    </>
  );

  return (
    <AuthShell
      eyebrow="Account security"
      title={isRecoveryMode ? "Reset your password." : "Set your permanent password."}
      description="This step is required whenever an admin issues a temporary password or an approved account recovery is in progress."
      panel={panel}
    >
      {feedback ? (
        <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800">
          {feedback.message}
        </div>
      ) : null}

      <form action="/api/auth/create-password" method="post" className="mt-6 space-y-5">
        <input type="hidden" name="mode" value={isRecoveryMode ? "recovery" : "default"} />
        <div>
          <label className="block text-sm font-semibold text-slate-700" htmlFor="password">
            New password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            className="auth-input"
          />
        </div>

        <div>
          <label
            className="block text-sm font-semibold text-slate-700"
            htmlFor="confirmPassword"
          >
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
          Save password
          <ArrowRight className="h-4 w-4" />
        </button>
      </form>

      <div className="mt-6 rounded-[24px] border border-slate-100 bg-slate-50/90 px-5 py-5 text-sm leading-7 text-slate-600">
        Password rules: at least 8 characters with uppercase, lowercase, and a
        number or symbol. Reusing the current password is blocked.
      </div>

      <form action="/api/auth/cancel-pending" method="post" className="mt-4">
        <button type="submit" className="auth-button-secondary w-full">
          Back to email and password
        </button>
      </form>
    </AuthShell>
  );
}
