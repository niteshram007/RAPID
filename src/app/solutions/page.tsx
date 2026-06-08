import Link from "next/link";

import {
  PublicSection,
  PublicSiteFooter,
  PublicSiteHeader,
} from "@/components/public-site-shell";

export default function SolutionsPage() {
  return (
    <div className="power-page min-h-screen bg-[#FFFDF5] text-[#003323]">
      <PublicSiteHeader />

      <main className="mx-auto max-w-[1320px] space-y-6 px-6 py-10 lg:px-10 lg:py-12">
        <section className="rounded-[30px] border border-[#dce9de] bg-[#FFFDF5] px-6 py-10 lg:px-10">
          <h1 className="text-[clamp(2rem,4vw,3rem)] font-semibold tracking-tight text-slate-950">
            Revenue intelligence built for structured decision-making
          </h1>
          <p className="mt-4 max-w-4xl text-base leading-8 text-slate-700">
            Rapid helps leadership teams move from fragmented revenue reporting to
            a centralized, role-based intelligence platform where performance data
            can be reviewed, compared, and acted on with clarity.
          </p>
          <p className="mt-4 max-w-4xl text-sm leading-7 text-slate-600">
            The platform solves core operational challenges around revenue
            visibility across regions, practices, and leadership roles.
          </p>
        </section>

        <PublicSection title="What Rapid covers">
          <ul className="list-disc space-y-2 pl-6 text-sm leading-7 text-slate-700">
            <li>Centralized revenue performance dashboards</li>
            <li>Budget vs Actual vs Forecast comparison</li>
            <li>Multi-dimensional analysis across geography, practice, BDM, and account levels</li>
            <li>Role-based access for executives, admins, and approved users</li>
            <li>Secure onboarding and controlled user access</li>
            <li>Trend visibility across selected reporting periods</li>
            <li>Variance analysis for leadership review</li>
            <li>Drill-down investigation from summary to detailed levels</li>
          </ul>
        </PublicSection>

        <PublicSection title="Business problems Rapid solves">
          <div className="grid gap-4 md:grid-cols-2">
            <article className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-950">1. Fragmented revenue visibility</p>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                Rapid consolidates distributed reports into one structured source
                of truth for leadership.
              </p>
            </article>
            <article className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-950">2. Slow comparison cycles</p>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                Instant budget, actual, and forecast comparisons reduce manual
                reporting delays.
              </p>
            </article>
            <article className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-950">3. Inconsistent access control</p>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                Role-based workspaces ensure users only see data within their
                authority boundaries.
              </p>
            </article>
            <article className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-950">4. Limited executive insight</p>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                Rapid combines comparison views, variance indicators, and interactive
                exploration for decision-ready context.
              </p>
            </article>
          </div>
        </PublicSection>

        <PublicSection title="Solution areas">
          <div className="space-y-5 text-sm leading-7 text-slate-700">
            <p>
              <span className="font-semibold text-slate-950">Executive leadership review:</span>{" "}
              revenue Trends, comparison against targets, underperformance
              detection, and forecast deviation tracking.
            </p>
            <p>
              <span className="font-semibold text-slate-950">Financial performance monitoring:</span>{" "}
              budget alignment, quarter-over-quarter movement, variance patterns,
              and faster planning reviews.
            </p>
            <p>
              <span className="font-semibold text-slate-950">Admin-controlled secure access:</span>{" "}
              onboarding, email OTP verification, Microsoft TOTP resets,
              and access lifecycle control.
            </p>
          </div>
        </PublicSection>

        <PublicSection title="Functional scope boundaries">
          <div className="grid gap-4 md:grid-cols-2">
            <article className="rounded-[20px] border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm font-semibold text-emerald-900">Included in scope</p>
              <ul className="mt-2 list-disc space-y-1 pl-6 text-sm leading-7 text-emerald-900">
                <li>Revenue analysis dashboards</li>
                <li>Secure login and authentication</li>
                <li>MFA-enabled access</li>
                <li>Role-based workspaces</li>
                <li>Comparison analytics and slicer-driven exploration</li>
                <li>Admin user management</li>
              </ul>
            </article>
            <article className="rounded-[20px] border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-900">Outside current scope</p>
              <ul className="mt-2 list-disc space-y-1 pl-6 text-sm leading-7 text-amber-900">
                <li>ERP transaction processing</li>
                <li>Billing execution systems</li>
                <li>Payroll financial modules</li>
                <li>CRM pipeline management</li>
                <li>External customer-facing reporting portals</li>
              </ul>
            </article>
          </div>
        </PublicSection>

        <PublicSection title="Deployment scope">
          <p className="text-sm leading-7 text-slate-700">
            Phase 1 focuses on admin dashboard, executive dashboard, secure
            authentication, email OTP recovery, Microsoft Authenticator integration,
            and verified workspace routing. Future phases may extend into advanced
            forecasting models, AI variance explanations, simulation planning, and
            commercial packaging modules.
          </p>
        </PublicSection>

        <section className="rounded-[28px] border border-[#dce9de] bg-[#FFFDF5] px-6 py-8 text-[#003323] lg:px-8">
          <h2 className="text-2xl font-semibold tracking-tight">
            A focused platform with clear business boundaries
          </h2>
          <p className="mt-3 max-w-4xl text-sm leading-7 text-[#003323]">
            Rapid strengthens revenue decision-making by concentrating on secure
            access, trusted comparisons, and structured insight without unnecessary
            system complexity.
          </p>
          <div className="mt-6">
            <Link
              href="/features"
              className="rounded-[12px] bg-white px-5 py-3 text-sm font-semibold text-slate-900"
            >
              Explore platform features
            </Link>
          </div>
        </section>
      </main>

      <PublicSiteFooter />
    </div>
  );
}
