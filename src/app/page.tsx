import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { PublicSiteFooter, PublicSiteHeader } from "@/components/public-site-shell";

const pageSlices = [
  {
    title: "Features",
    href: "/features",
    summary:
      "Controlled onboarding, role-aware routing, secure authentication, and admin-owned access operations.",
    banner:
      "Built for controlled access from day one with admin-created invites, email OTP verification, and Microsoft TOTP enrollment.",
  },
  {
    title: "Solutions",
    href: "/solutions",
    summary:
      "Structured revenue intelligence for budget vs actual vs forecast comparisons and leadership-ready analysis.",
    banner:
      "Revenue intelligence built for structured decision-making with clear scope boundaries and practical deployment phases.",
  },
  {
    title: "Resources",
    href: "/resources",
    summary:
      "Guides, onboarding material, security references, and role-specific documentation for smooth adoption.",
    banner:
      "Role-based guides, onboarding packs, security documentation, FAQs, and adoption checklists to support daily usage.",
  },
  {
    title: "Support",
    href: "/support",
    summary:
      "Official support path for password issues, MFA recovery, login troubleshooting, and admin access support.",
    banner:
      "Secure and uninterrupted access support for login recovery, MFA resets, and urgent platform-entry restoration.",
  },
];

function HeroArt() {
  return (
    <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[56%] lg:block">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_50%,_rgba(255,255,255,0.55),_transparent_28%),radial-gradient(circle_at_82%_18%,_rgba(255,255,255,0.55),_transparent_18%),linear-gradient(135deg,_rgba(255,255,255,0.2)_0%,_rgba(99,102,241,0.08)_100%)]" />
      <div className="absolute left-[10%] top-[18%] h-28 w-40 rounded-[34px] bg-[linear-gradient(145deg,_rgba(255,255,255,0.9)_0%,_rgba(96,165,250,0.85)_46%,_rgba(79,70,229,0.92)_100%)] shadow-[0_25px_70px_rgba(79,70,229,0.28)] blur-[0.2px] rotate-[-8deg]" />
      <div className="absolute right-[5%] top-[3%] h-32 w-32 rounded-full bg-[radial-gradient(circle_at_34%_34%,_rgba(255,255,255,0.95)_0%,_rgba(191,219,254,0.9)_18%,_rgba(79,70,229,0.92)_72%,_rgba(67,56,202,1)_100%)] shadow-[0_25px_80px_rgba(79,70,229,0.32)]" />
      <div className="absolute left-[14%] top-[54%] h-28 w-28 rounded-full bg-[radial-gradient(circle_at_35%_35%,_rgba(255,255,255,0.95)_0%,_rgba(191,219,254,0.88)_18%,_rgba(125,211,252,0.62)_62%,_rgba(255,255,255,0.15)_100%)] shadow-[0_16px_40px_rgba(96,165,250,0.25)]" />
      <div className="absolute bottom-[-8%] right-[-10%] h-[780px] w-[780px] rounded-[42%] bg-[radial-gradient(circle_at_36%_28%,_rgba(255,255,255,0.98)_0%,_rgba(255,255,255,0.75)_11%,_rgba(191,219,254,0.54)_22%,_rgba(129,140,248,0.66)_46%,_rgba(67,56,202,0.96)_82%,_rgba(49,46,129,1)_100%)] opacity-95 shadow-[0_40px_130px_rgba(79,70,229,0.28)]" />
      <div className="absolute bottom-[2%] right-[2%] h-[640px] w-[510px] rounded-[46%] border border-white/55 bg-[linear-gradient(145deg,_rgba(255,255,255,0.55)_0%,_rgba(224,231,255,0.18)_24%,_rgba(255,255,255,0.02)_100%)] backdrop-blur-[2px] rotate-[26deg]" />
      <div className="absolute bottom-[12%] right-[16%] h-[500px] w-[320px] rounded-[46%] border border-white/45 bg-[linear-gradient(145deg,_rgba(255,255,255,0.52)_0%,_rgba(196,181,253,0.16)_28%,_rgba(255,255,255,0.02)_100%)] backdrop-blur-[2px] rotate-[20deg]" />
      <div className="absolute bottom-[1%] right-[22%] h-36 w-36 rounded-[36px] bg-[linear-gradient(145deg,_rgba(255,255,255,0.78)_0%,_rgba(99,102,241,0.78)_100%)] shadow-[0_20px_60px_rgba(79,70,229,0.3)] rotate-[34deg]" />
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="power-page min-h-screen bg-[#FFFDF5] text-[#003323]">
      <PublicSiteHeader />

      <main>
        <section className="relative overflow-hidden border-b border-slate-200 bg-[#FFFDF5]">
          <HeroArt />
          <div className="relative z-10 mx-auto max-w-[1320px] px-6 py-16 lg:px-10 lg:py-24">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#003323]">
              Secure revenue intelligence, built for leadership teams
            </p>

            <h1 className="font-bernard mt-6 text-[clamp(3rem,8vw,6.5rem)] leading-[0.95] tracking-[0.02em] text-[#003323]">
              RAPID
            </h1>

            <h2 className="mt-4 max-w-4xl text-[clamp(1.45rem,2.6vw,2.2rem)] font-normal leading-tight text-[#003323]">
              Revenue Analytics and Performance Intelligence Dashboard
            </h2>

            <p className="mt-6 max-w-4xl text-[1.1rem] leading-8 text-[#003323]">
              RAPID provides a controlled environment to review revenue performance,
              compare business metrics, and access the right workspace with the
              right level of authority.
            </p>

            <div className="mt-10">
              <Link
                href="/login"
                className="inline-flex items-center rounded-[14px] bg-[#003323] px-8 py-4 text-[18px] font-semibold text-white shadow-[0_18px_45px_rgba(0,51,35,0.28)] hover:bg-[#004d3b]"
              >
                Sign in
              </Link>
            </div>
          </div>
        </section>

        <section className="bg-[#FFFDF5] py-14 lg:py-18">
          <div className="mx-auto max-w-[1320px] px-6 lg:px-10">
            <div className="space-y-4">
              {pageSlices.map((slice) => (
                <Link
                  key={slice.href}
                  href={slice.href}
                  className="group block overflow-hidden rounded-[26px] border border-slate-200 bg-[linear-gradient(135deg,_#f2fbf7_0%,_#eaf7f1_45%,_#f7fcf9_100%)] p-6 shadow-[0_18px_44px_rgba(15,23,42,0.08)] hover:border-slate-300"
                >
                  <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
                    <div>
                      <p className="text-2xl font-semibold tracking-tight text-slate-950">
                        {slice.title}
                      </p>
                      <p className="mt-2 text-sm leading-7 text-slate-600">
                        {slice.summary}
                      </p>
                    </div>
                    <div className="rounded-[18px] border border-white/70 bg-white/75 px-4 py-4">
                      <p className="text-sm leading-7 text-slate-700">{slice.banner}</p>
                      <p className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-[#003323]">
                        Explore more
                        <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>

      <PublicSiteFooter />
    </div>
  );
}
