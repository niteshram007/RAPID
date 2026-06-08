import Link from "next/link";

import {
  PublicSection,
  PublicSiteFooter,
  PublicSiteHeader,
} from "@/components/public-site-shell";

const faqs = [
  {
    q: "How do I sign in for the first time?",
    a: "Use the admin-created account invite, complete your profile, verify the email OTP, and then enroll Microsoft TOTP before entering the platform.",
  },
  {
    q: "What happens if I lose my authenticator device?",
    a: "Contact your superuser, who can reset your MFA enrollment from the admin dashboard.",
  },
  {
    q: "Can users reset their own MFA?",
    a: "Yes, RAPID first confirms the reset request through an email OTP and then lets the user enroll a new Microsoft TOTP device.",
  },
  {
    q: "Where can I get login credentials?",
    a: "Credentials are issued securely by authorized administrators only and are never displayed publicly.",
  },
];

export default function ResourcesPage() {
  return (
    <div className="power-page min-h-screen bg-[#FFFDF5] text-[#003323]">
      <PublicSiteHeader />

      <main className="mx-auto max-w-[1320px] space-y-6 px-6 py-10 lg:px-10 lg:py-12">
        <section className="rounded-[30px] border border-[#dce9de] bg-[#FFFDF5] px-6 py-10 lg:px-10">
          <h1 className="text-[clamp(2rem,4vw,3rem)] font-semibold tracking-tight text-slate-950">
            Resources to help you use Rapid effectively
          </h1>
          <p className="mt-4 max-w-4xl text-base leading-8 text-slate-700">
            Access product guidance, onboarding materials, support references, and
            platform documentation designed to help leadership teams and administrators
            work confidently inside Rapid.
          </p>
          <p className="mt-4 max-w-4xl text-sm leading-7 text-slate-600">
            These resources support first login through advanced admin operations.
          </p>
        </section>

        <PublicSection
          title="Start using Rapid with the right foundation"
          subtitle="New users should begin with the official onboarding guide to understand invite activation, email OTP, Microsoft TOTP setup, and workspace navigation."
        >
          <ul className="list-disc space-y-2 pl-6 text-sm leading-7 text-slate-700">
            <li>Platform onboarding guide</li>
            <li>First-time login instructions</li>
            <li>Email OTP verification steps</li>
            <li>Password setup guide</li>
            <li>Microsoft TOTP enrollment instructions</li>
          </ul>
          <div className="mt-5">
            <Link
              href="/support"
              className="rounded-[12px] bg-[#003323] px-5 py-3 text-sm font-semibold text-white hover:bg-[#004d3b]"
            >
              Download onboarding guide
            </Link>
          </div>
        </PublicSection>

        <PublicSection title="Guidance for every user role">
          <div className="grid gap-4 md:grid-cols-3">
            <article className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-950">Executive user guide</p>
              <ul className="mt-2 list-disc space-y-1 pl-6 text-sm leading-7 text-slate-600">
                <li>Access executive dashboards</li>
                <li>Review revenue comparisons</li>
                <li>Navigate drill-down reports</li>
                <li>Interpret variance insights</li>
              </ul>
            </article>
            <article className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-950">Admin user guide</p>
              <ul className="mt-2 list-disc space-y-1 pl-6 text-sm leading-7 text-slate-600">
                <li>Create and manage users</li>
                <li>Control invite-only activation</li>
                <li>Reset Microsoft TOTP enrollment</li>
                <li>Control workspace access</li>
              </ul>
            </article>
            <article className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-950">General user guide</p>
              <ul className="mt-2 list-disc space-y-1 pl-6 text-sm leading-7 text-slate-600">
                <li>Sign in securely</li>
                <li>Reset passwords</li>
                <li>Maintain authenticator access</li>
                <li>Access assigned workspaces</li>
              </ul>
            </article>
          </div>
        </PublicSection>

        <PublicSection title="Security and product documentation">
          <div className="grid gap-4 md:grid-cols-2">
            <article className="rounded-[20px] border border-slate-200 bg-white p-4">
              <p className="text-sm font-semibold text-slate-950">
                Authentication and security reference materials
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-6 text-sm leading-7 text-slate-600">
                <li>Microsoft Authenticator setup guide</li>
                <li>MFA re-enrollment instructions</li>
                <li>Email OTP and password reset process</li>
                <li>Secure credential handling policy</li>
                <li>Account recovery steps after device changes</li>
              </ul>
            </article>
            <article className="rounded-[20px] border border-slate-200 bg-white p-4">
              <p className="text-sm font-semibold text-slate-950">
                Platform documentation for daily operations
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-6 text-sm leading-7 text-slate-600">
                <li>Dashboard navigation guide</li>
                <li>Revenue comparison workflow</li>
                <li>Filter and slicer usage guide</li>
                <li>Drill-down analysis instructions</li>
                <li>Workspace role permissions reference</li>
              </ul>
            </article>
          </div>
        </PublicSection>

        <PublicSection title="Downloadable guides">
          <ul className="list-disc space-y-2 pl-6 text-sm leading-7 text-slate-700">
            <li>Rapid product guide</li>
            <li>Admin operations manual</li>
            <li>MFA setup handbook</li>
            <li>User access policy guide</li>
            <li>Email OTP and password recovery reference sheet</li>
          </ul>
          <div className="mt-5">
            <Link
              href="/support"
              className="rounded-[12px] border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Download guide pack
            </Link>
          </div>
        </PublicSection>

        <PublicSection title="Frequently asked questions">
          <div className="space-y-3">
            {faqs.map((faq) => (
              <article key={faq.q} className="rounded-[18px] border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-950">{faq.q}</p>
                <p className="mt-2 text-sm leading-7 text-slate-600">{faq.a}</p>
              </article>
            ))}
          </div>
        </PublicSection>

        <PublicSection title="Training and adoption support">
          <p className="text-sm leading-7 text-slate-700">
            Rapid resources support rollout across teams with internal checklists,
            onboarding templates, admin training references, and adoption best
            practices.
          </p>
        </PublicSection>

        <section className="rounded-[28px] border border-[#dce9de] bg-[#FFFDF5] px-6 py-8 text-[#003323] lg:px-8">
          <h2 className="text-2xl font-semibold tracking-tight">
            Everything needed to work confidently in Rapid
          </h2>
          <p className="mt-3 max-w-4xl text-sm leading-7 text-[#003323]">
            From first login to admin operations, each resource is structured to
            keep teams productive and protected.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/login"
              className="rounded-[12px] bg-white px-5 py-3 text-sm font-semibold text-slate-900"
            >
              Open sign-in page
            </Link>
            <Link
              href="/support"
              className="rounded-[12px] border border-white/30 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10"
            >
              Contact support
            </Link>
          </div>
        </section>
      </main>

      <PublicSiteFooter />
    </div>
  );
}
