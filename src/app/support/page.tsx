import Link from "next/link";

import {
  PublicSection,
  PublicSiteFooter,
  PublicSiteHeader,
} from "@/components/public-site-shell";

export default function SupportPage() {
  return (
    <div className="power-page min-h-screen bg-[#FFFDF5] text-[#003323]">
      <PublicSiteHeader />

      <main className="mx-auto max-w-[1320px] space-y-6 px-6 py-10 lg:px-10 lg:py-12">
        <section className="rounded-[30px] border border-[#dce9de] bg-[#FFFDF5] px-6 py-10 lg:px-10">
          <h1 className="text-[clamp(2rem,4vw,3rem)] font-semibold tracking-tight text-slate-950">
            Support for secure and uninterrupted Rapid access
          </h1>
          <p className="mt-4 max-w-4xl text-base leading-8 text-slate-700">
            Get help with login issues, password recovery, Microsoft TOTP reset requests, and
            platform access support through the Rapid support team.
          </p>
          <p className="mt-4 max-w-4xl text-sm leading-7 text-slate-600">
            Support is designed to restore access quickly while maintaining platform
            security standards.
          </p>
        </section>

        <PublicSection title="Reach the Rapid support team">
          <p className="text-sm leading-7 text-slate-700">
            For platform-related support requests, contact the official Rapid support
            mailbox.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <a
              href="mailto:rapid@mindteck.net"
              className="rounded-[12px] bg-[#003323] px-5 py-3 text-sm font-semibold text-white hover:bg-[#004d3b]"
            >
              rapid@mindteck.net
            </a>
            <a
              href="mailto:rapid@mindteck.net"
              className="rounded-[12px] border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Email Rapid Support
            </a>
          </div>
        </PublicSection>

        <PublicSection title="What support can help with">
          <div className="grid gap-4 md:grid-cols-2">
            <article className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-950">Password assistance</p>
              <ul className="mt-2 list-disc space-y-1 pl-6 text-sm leading-7 text-slate-600">
                <li>Forgot password</li>
                <li>Email OTP verification issues</li>
                <li>Password reset flow issues</li>
                <li>Locked account after failed sign-in attempts</li>
              </ul>
            </article>
            <article className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-950">MFA / Authenticator reset</p>
              <ul className="mt-2 list-disc space-y-1 pl-6 text-sm leading-7 text-slate-600">
                <li>Device changed or lost</li>
                <li>Authenticator no longer linked</li>
                <li>MFA codes not working</li>
                <li>Re-enrollment required</li>
              </ul>
            </article>
            <article className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-950">Login access problems</p>
              <ul className="mt-2 list-disc space-y-1 pl-6 text-sm leading-7 text-slate-600">
                <li>Failed login attempts</li>
                <li>Invalid credentials errors</li>
                <li>Access denied messages</li>
                <li>Role-based access issues after sign-in</li>
              </ul>
            </article>
            <article className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-950">Admin access issues</p>
              <ul className="mt-2 list-disc space-y-1 pl-6 text-sm leading-7 text-slate-600">
                <li>Superuser credential recovery guidance</li>
                <li>User provisioning issues</li>
                <li>Invite-only account setup problems</li>
                <li>Access permission troubleshooting</li>
              </ul>
            </article>
          </div>
        </PublicSection>

        <PublicSection title="Before contacting support">
          <p className="text-sm leading-7 text-slate-700">
            Include full name, registered work email, role, brief issue description,
            and screenshot if applicable.
          </p>
          <p className="mt-3 rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Example: Unable to complete Microsoft Authenticator login after device replacement.
          </p>
        </PublicSection>

        <PublicSection title="Response expectations and escalation path">
          <ul className="list-disc space-y-2 pl-6 text-sm leading-7 text-slate-700">
            <li>Initial acknowledgment within business hours</li>
            <li>Priority handling for access-blocking login issues</li>
            <li>MFA and password reset issues handled as high priority</li>
            <li>Escalation: email support, notify superuser/admin, include urgency in subject line</li>
          </ul>
        </PublicSection>

        <PublicSection title="Security notice">
          <p className="text-sm leading-7 text-slate-700">
            Rapid support will never ask for permanent passwords, MFA verification
            codes, or authenticator backup keys. Sensitive credentials should never
            be sent over email.
          </p>
        </PublicSection>

        <section className="rounded-[28px] border border-[#dce9de] bg-[#FFFDF5] px-6 py-8 text-[#003323] lg:px-8">
          <h2 className="text-2xl font-semibold tracking-tight">
            Need help accessing Rapid?
          </h2>
          <p className="mt-3 max-w-4xl text-sm leading-7 text-[#003323]">
            The support team is available to restore secure access quickly while
            maintaining platform security standards.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href="mailto:rapid@mindteck.net"
              className="rounded-[12px] bg-white px-5 py-3 text-sm font-semibold text-slate-900"
            >
              rapid@mindteck.net
            </a>
            <Link
              href="/login"
              className="rounded-[12px] border border-white/30 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10"
            >
              Return to sign-in page
            </Link>
          </div>
        </section>
      </main>

      <PublicSiteFooter />
    </div>
  );
}
