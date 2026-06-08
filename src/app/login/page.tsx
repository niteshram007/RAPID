import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { redirect } from "next/navigation";

import { AuthStorageReset } from "@/components/auth-storage-reset";
import { MindteckLogo } from "@/components/mindteck-logo";
import { getDefaultRouteForRole, getPendingAuthProfile, getSessionProfile } from "@/lib/auth";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const dynamic = "force-dynamic";
export const revalidate = 0;

const loginMessages = {
  "missing-password": {
    tone: "error",
    message: "Password is required.",
  },
  "invalid-credentials": {
    tone: "error",
    message: "The email or password you entered is incorrect. Try again.",
  },
  "missing-role": {
    tone: "error",
    message: "That account no longer has an assigned role. Contact the superuser.",
  },
  "inactive-user": {
    tone: "error",
    message: "That account is inactive. Contact the superuser to restore access.",
  },
  "pending-auth-expired": {
    tone: "error",
    message: "Your sign-in session expired. Enter your email and password again.",
  },
  "no-access": {
    tone: "error",
    message: "The current role does not have a landing route yet.",
  },
  "account-ready": {
    tone: "success",
    message: "Your account is ready. Sign in with your email, password, and Microsoft TOTP.",
  },
} as const;

function resolveQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const pendingAuth = await getPendingAuthProfile();
  const session = await getSessionProfile();

  if (pendingAuth?.user.pendingEmailOtpPurpose === "onboarding") {
    redirect("/login/otp?mode=onboarding");
  }
  if (pendingAuth?.user.pendingEmailOtpPurpose === "totp-reset") {
    redirect("/login/otp?mode=totp-reset");
  }
  if (pendingAuth?.user.pendingEmailOtpPurpose === "account-recovery") {
    redirect("/login/otp?mode=account-recovery");
  }

  if (session) {
    if (session.availableRoles.length > 1) {
      redirect("/login/select-role");
    }
    redirect(getDefaultRouteForRole(session.role));
  }

  const query = await searchParams;
  const errorKey = resolveQueryValue(query.error);
  const feedback = errorKey
    ? loginMessages[errorKey as keyof typeof loginMessages]
    : null;

  return (
    <div className="auth-shell flex min-h-screen items-center justify-center px-6 py-10">
      <AuthStorageReset />
      <section className="auth-card w-full max-w-[460px] px-6 py-8 lg:px-8 lg:py-10">
        <div className="flex flex-col items-center text-center">
          <MindteckLogo className="h-10 w-auto" priority />
          <h1 className="font-display mt-8 text-4xl tracking-tight text-slate-950">
            Sign in
          </h1>
        </div>

        {feedback ? (
          <div
            className={`mt-8 rounded-[24px] border px-5 py-4 text-sm ${
              feedback.tone === "error"
                ? "border-rose-200 bg-rose-50 text-rose-800"
                : "border-emerald-200 bg-emerald-50 text-emerald-800"
            }`}
          >
            {feedback.message}
          </div>
        ) : null}

        <form action="/api/auth/sign-in" method="post" className="mt-8 space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-700" htmlFor="email">
              Work email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="username"
              className="auth-input"
            />
          </div>

          <div>
            <div className="flex items-center justify-between gap-3">
              <label className="block text-sm font-semibold text-slate-700" htmlFor="password">
                Password
              </label>
              <Link
                href="/login/recover-account"
                className="text-sm font-semibold text-slate-600 underline underline-offset-4 hover:text-slate-950"
              >
                Forgotten Password?
              </Link>
            </div>
            <input
              id="password"
              name="password"
              type="password"
              required
              aria-required="true"
              autoComplete="current-password"
              className="auth-input"
            />
          </div>

          <button type="submit" className="auth-button-primary flex w-full gap-2">
            Sign in
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>

        <div className="mt-5 grid gap-3">
          <Link href="/login/setup" className="auth-button-secondary block text-center">
            Sign up
          </Link>
        </div>
      </section>
    </div>
  );
}
