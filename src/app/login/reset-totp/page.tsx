import { ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth-shell";
import { getPendingAuthProfile, getSessionProfile } from "@/lib/auth";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const resetMessages = {
  "missing-email": "Enter the work email for the account you want to verify.",
  "invalid-account": "That account is not eligible for RAPID authenticator reset.",
  "otp-delivery-failed": "RAPID could not send the email verification code.",
} as const;

function resolveQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ResetTotpPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const pendingAuth = await getPendingAuthProfile();
  if (pendingAuth?.user.pendingEmailOtpPurpose === "totp-reset") {
    redirect("/login/otp?mode=totp-reset");
  }

  const session = await getSessionProfile();
  const query = await searchParams;
  const errorKey = resolveQueryValue(query.error);
  const detail = resolveQueryValue(query.detail);
  const defaultEmail = session?.email ?? resolveQueryValue(query.email) ?? "";

  return (
    <AuthShell
      eyebrow="Authenticator reset"
      title="Reset Microsoft Authenticator securely."
      description="RAPID will first verify the request using an email OTP. After that, you’ll scan a fresh Microsoft Authenticator QR code."
      panel={
        <article className="auth-panel-card px-6 py-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-950">Reset flow</p>
              <p className="text-sm text-slate-600">
                Verify email OTP first, then re-enroll Microsoft Authenticator.
              </p>
            </div>
          </div>
        </article>
      }
    >
      {errorKey ? (
        <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800">
          {resetMessages[errorKey as keyof typeof resetMessages] ?? "Unable to continue with reset."}
          {detail ? ` ${decodeURIComponent(detail)}` : ""}
        </div>
      ) : null}

      <form action="/api/auth/request-totp-reset" method="post" className="mt-6 space-y-5">
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
          Send email OTP
        </button>
      </form>
    </AuthShell>
  );
}
