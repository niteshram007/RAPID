"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { MindteckLogo } from "@/components/mindteck-logo";

const navItems = [
  { label: "Home", href: "/" },
  { label: "Features", href: "/features" },
  { label: "Solutions", href: "/solutions" },
  { label: "Resources", href: "/resources" },
  { label: "Support", href: "/support" },
];

function isActiveRoute(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function PublicSiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-[#dce9de] bg-[#FFFDF5]/96 backdrop-blur">
      <div className="mx-auto flex max-w-[1320px] items-center justify-between gap-6 px-6 py-3 lg:px-10">
        <Link href="/" className="shrink-0">
          <MindteckLogo className="h-9 w-auto" priority />
        </Link>

        <nav className="hidden items-center gap-7 lg:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActiveRoute(pathname, item.href) ? "page" : undefined}
              className={`rounded-full px-3 py-1.5 text-[16px] font-medium transition ${
                isActiveRoute(pathname, item.href)
                  ? "bg-[#003323] text-white"
                  : "text-[#003323] hover:text-[#004d3b]"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center rounded-[10px] border border-[#003323] px-5 py-2.5 text-[15px] font-semibold text-[#003323] hover:bg-[#eef7f2]"
          >
            Sign in
          </Link>
        </div>
      </div>
    </header>
  );
}

export function PublicSiteFooter() {
  return (
    <footer className="border-t border-[#dce9de] bg-[#FFFDF5]">
      <div className="mx-auto grid max-w-[1320px] gap-8 px-6 py-12 lg:grid-cols-[1.2fr_0.8fr] lg:px-10">
        <div>
          <p className="font-bernard text-[clamp(2.8rem,6vw,4.6rem)] leading-[0.9] tracking-[0.04em] text-[#003323]">
            RAPID
          </p>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[#003323]">
            RAPID provides a controlled environment to review revenue performance,
            compare business metrics, and access the right workspace with the right
            level of authority.
          </p>
        </div>

        <div className="rounded-[18px] border border-[#dce9de] bg-[#FFFDF5] px-4 py-4 text-sm">
          <p className="font-semibold text-[#003323]">Explore</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Link href="/features" className="block text-[#003323] hover:text-[#004d3b]">
              Features
            </Link>
            <Link href="/solutions" className="block text-[#003323] hover:text-[#004d3b]">
              Solutions
            </Link>
            <Link href="/resources" className="block text-[#003323] hover:text-[#004d3b]">
              Resources
            </Link>
            <Link href="/support" className="block text-[#003323] hover:text-[#004d3b]">
              Support
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

export function PublicSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-[#dce9de] bg-[#FFFDF5] p-6 shadow-[0_16px_44px_rgba(0,51,35,0.06)] lg:p-8">
      <h2 className="text-[1.8rem] font-semibold tracking-tight text-[#003323]">
        {title}
      </h2>
      {subtitle ? (
        <p className="mt-3 text-base leading-7 text-[#003323]">{subtitle}</p>
      ) : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}
