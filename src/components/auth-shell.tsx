import Link from "next/link";

import { MindteckLogo } from "@/components/mindteck-logo";

type AuthShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  panel: React.ReactNode;
  children: React.ReactNode;
};

export function AuthShell({
  eyebrow,
  title,
  description,
  panel,
  children,
}: AuthShellProps) {
  return (
    <div className="auth-shell min-h-screen px-6 py-6 lg:px-10 lg:py-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-4 rounded-[28px] border border-white/70 bg-white/70 px-5 py-4 shadow-[0_20px_60px_rgba(15,23,42,0.06)] backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="shrink-0">
            <MindteckLogo className="h-8 w-auto" priority />
          </Link>

          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
            <span className="rounded-full bg-white px-4 py-2 font-semibold text-slate-950 shadow-sm">
              Secure access
            </span>
            <Link
              href="/"
              className="rounded-full border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-700 hover:border-slate-300 hover:text-slate-950"
            >
              Back to website
            </Link>
          </div>
        </header>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1.06fr_0.94fr] lg:items-start">
          <section className="space-y-6">{panel}</section>

          <section className="auth-card px-6 py-6 lg:px-8 lg:py-8">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-700">
              {eyebrow}
            </p>
            <h1 className="font-display mt-4 text-4xl tracking-tight text-slate-950 lg:text-[3.25rem] lg:leading-[1.02]">
              {title}
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
              {description}
            </p>
            <div className="mt-8">{children}</div>
          </section>
        </div>
      </div>
    </div>
  );
}
