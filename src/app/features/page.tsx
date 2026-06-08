import Link from "next/link";

import {
  PublicSection,
  PublicSiteFooter,
  PublicSiteHeader,
} from "@/components/public-site-shell";

export default function FeaturesPage() {
  return (
    <div className="power-page min-h-screen bg-[#FFFDF5] text-[#003323]">
      <PublicSiteHeader />

      <main className="mx-auto max-w-[1320px] space-y-6 px-6 py-10 lg:px-10 lg:py-12">
        <section className="rounded-[30px] border border-[#dce9de] bg-[#FFFDF5] px-6 py-10 lg:px-10">
          <h1 className="text-[clamp(2rem,4vw,3rem)] font-semibold tracking-tight text-slate-950">
            Secure revenue intelligence, built for leadership teams
          </h1>
          <p className="mt-4 max-w-4xl text-base leading-8 text-slate-700">
            RAPID provides leadership, finance, and admins a controlled environment to
            review revenue performance, compare business metrics, and access the
            right workspace with the right level of authority.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/login"
                className="rounded-[12px] bg-[#003323] px-6 py-3 text-sm font-semibold text-white hover:bg-[#004d3b]"
              >
                Sign in
              </Link>
            <Link
              href="/resources"
              className="rounded-[12px] border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Download guide
            </Link>
          </div>
        </section>

        <PublicSection
          title="Built for controlled access from day one"
          subtitle="Rapid is designed with secure platform access as a core requirement, not as an afterthought. From admin-created invites to email OTP verification and Microsoft TOTP enrollment, every user journey is structured to reduce access risk and improve operational control."
        >
          <ul className="list-disc space-y-2 pl-6 text-sm leading-7 text-slate-700">
            <li>Admin-created invite-only account onboarding</li>
            <li>Email OTP verification before workspace activation</li>
            <li>Microsoft TOTP enrollment for secure sign-in</li>
            <li>Route-level role checks for workspace access</li>
            <li>Admin-led user lifecycle management</li>
          </ul>
        </PublicSection>

        <PublicSection
          title="Role-based workspace access"
          subtitle="Different users need different levels of visibility. Rapid uses role-aware access controls so executive users, admins, and other approved users enter only the parts of the platform relevant to their responsibilities."
        >
          <div className="grid gap-4 md:grid-cols-3">
            <article className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-950">Executive workspace access</p>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                Leadership users can enter a focused environment built for reviewing
                performance, Trends, and high-level revenue comparisons.
              </p>
            </article>
            <article className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-950">Admin workspace access</p>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                Admins can manage users, reset access, and maintain platform entry
                controls without exposing operational actions to non-admin users.
              </p>
            </article>
            <article className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-950">Protected route handling</p>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                Navigation is validated against user roles so unauthorized users
                cannot move into restricted sections of the platform.
              </p>
            </article>
          </div>
        </PublicSection>

        <PublicSection
          title="Secure onboarding and authentication"
          subtitle="Rapid supports a controlled sign-in flow that helps organizations manage first-time access and stronger authentication requirements without creating unnecessary complexity for users."
        >
          <div className="grid gap-4 md:grid-cols-3">
            <article className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-950">Invite-only activation</p>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                Users created by admin complete full-name, email, password,
                email OTP, and Microsoft TOTP verification before platform entry is completed.
              </p>
            </article>
            <article className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-950">Microsoft Authenticator support</p>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                Rapid supports TOTP enrollment and re-enrollment through Microsoft
                Authenticator for superusers and any user who requires MFA.
              </p>
            </article>
            <article className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-950">Password recovery support</p>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                If a user forgets their password or needs to change Microsoft TOTP
                after a device change, RAPID confirms the request through email OTP first.
              </p>
            </article>
          </div>
        </PublicSection>

        <PublicSection
          title="Admin control with clear operational ownership"
          subtitle="Rapid centralizes essential access operations so the superuser can manage platform entry without depending on engineering teams for routine user actions."
        >
          <ul className="list-disc space-y-2 pl-6 text-sm leading-7 text-slate-700">
            <li>Create new users</li>
            <li>Delete users</li>
            <li>Control invite-only account activation</li>
            <li>Reset Microsoft TOTP enrollment</li>
            <li>Restore access for locked-out users</li>
            <li>Maintain controlled platform entry across leadership and admin workspaces</li>
          </ul>
        </PublicSection>

        <PublicSection
          title="Revenue platform foundation first"
          subtitle="Rapid is being rolled out with a foundation-first approach. Phase 1 focuses on secure access architecture, password recovery, MFA support, and validated workspaces for executive and admin users. This creates a stable platform base before expanding packaging and commercial layers."
        >
          <p className="text-sm leading-7 text-slate-700">
            Public-facing pages are intentionally separated from credential handling.
            Sensitive access details are not displayed on the landing page and should
            only be shared through approved secure channels.
          </p>
        </PublicSection>

        <section className="rounded-[28px] border border-[#dce9de] bg-[#FFFDF5] px-6 py-8 text-[#003323] lg:px-8">
          <h2 className="text-2xl font-semibold tracking-tight text-[#003323]">Ready to enter Rapid?</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[#003323]">
            Sign in through the dedicated login page. New invited users complete
            email OTP verification and Microsoft TOTP enrollment before access is completed.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/login"
              className="rounded-[12px] bg-white px-5 py-3 text-sm font-semibold text-slate-900"
            >
              Open sign-in page
            </Link>
            <Link
              href="/solutions"
              className="rounded-[12px] border border-white/30 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10"
            >
              View solutions
            </Link>
          </div>
        </section>
      </main>

      <PublicSiteFooter />
    </div>
  );
}
