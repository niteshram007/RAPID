import Link from "next/link";

import { LogoutForm } from "@/components/logout-form";
import { MindteckLogo } from "@/components/mindteck-logo";
import { hasPermission, type Role } from "@/lib/rbac-store";
import { type SessionProfile } from "@/lib/auth";

type AppShellProps = {
  session: SessionProfile;
  title: string;
  description: string;
  currentPath: "/executive" | "/admin";
  children: React.ReactNode;
};

function NavLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
        active
          ? "bg-slate-950 text-white shadow-lg shadow-slate-950/15"
          : "text-slate-600 hover:bg-white hover:text-slate-950"
      }`}
    >
      {label}
    </Link>
  );
}

function permissionCount(role: Role | null) {
  return role?.permissions.length ?? 0;
}

export function AppShell({
  session,
  title,
  description,
  currentPath,
  children,
}: AppShellProps) {
  const canViewDashboard = hasPermission(session.role, "view_dashboard");
  const canManageAdmin =
    hasPermission(session.role, "manage_roles") ||
    hasPermission(session.role, "manage_users");

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(15,124,255,0.18),_transparent_28%),linear-gradient(180deg,_#f7fbff_0%,_#eef5fb_100%)] text-slate-950">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-6 lg:px-10">
        <header className="surface-card mb-8 flex flex-col gap-5 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <MindteckLogo className="h-8 w-auto" />
            <div>
              <h1 className="font-display text-2xl text-slate-950">
                {title}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                {description}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-start gap-4 lg:items-end">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/"
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-950"
              >
                Landing page
              </Link>
              {canViewDashboard ? (
                <NavLink
                  href="/executive"
                  label="Executive"
                  active={currentPath === "/executive"}
                />
              ) : null}
              {canManageAdmin ? (
                <NavLink
                  href="/admin"
                  label="Admin"
                  active={currentPath === "/admin"}
                />
              ) : null}
              <LogoutForm compact />
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
              <span className="rounded-full bg-white px-3 py-1.5 font-semibold text-slate-950">
                {session.name}
              </span>
              <span>{session.role?.name ?? session.title}</span>
              <span className="rounded-full bg-sky-50 px-3 py-1.5 font-semibold text-sky-700">
                {session.role?.name ?? "Unassigned role"}
              </span>
              <span>{permissionCount(session.role)} permissions</span>
            </div>
          </div>
        </header>

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
