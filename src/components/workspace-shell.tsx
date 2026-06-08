"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import { LogoutForm } from "@/components/logout-form";
import { WorkspaceActivityTracker } from "@/components/workspace-activity-tracker";
import { WorkspaceDashboardMenu } from "@/components/workspace-dashboard-menu";
import { DrillDownProvider } from "@/components/drilldown/DrillDownProvider";
import { MindteckLogo } from "@/components/mindteck-logo";
import { WorkspaceGlobalSlicer } from "@/components/workspace-global-slicer";
import { WorkspaceNav, type WorkspaceNavItem } from "@/components/workspace-nav";
import { type SessionProfile } from "@/lib/auth";
import { appendSharedWorkspaceSearch } from "@/lib/workspace-search";

type WorkspaceShellProps = {
  session: SessionProfile;
  areaLabel: string;
  title: string;
  description: string;
  navItems: WorkspaceNavItem[];
  children: React.ReactNode;
  variant?: "default" | "macos";
};

export function WorkspaceShell({
  session,
  areaLabel,
  navItems,
  children,
  variant = "default",
}: WorkspaceShellProps) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return true;
    }

    return window.localStorage.getItem("rapid-workspace-sidebar") !== "expanded";
  });
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [showGreeting, setShowGreeting] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    const greetingKey = `rapid-workspace-greeting:${session.userId}`;
    if (window.sessionStorage.getItem(greetingKey)) {
      return false;
    }
    window.sessionStorage.setItem(greetingKey, "shown");
    return true;
  });
  const isMacos = variant === "macos";
  const hasAdminAccess =
    session.role?.permissions.includes("manage_users") ||
    session.role?.permissions.includes("manage_roles");
  const hasMultipleWorkspaceRoles = session.availableRoles.length > 1;
  const isAdminWorkspace = pathname.startsWith("/admin");
  const profileName = useMemo(
    () => session.name.trim().split(/\s+/).slice(0, 2).join(" "),
    [session.name],
  );
  const profileHref = `${
    session.role?.id === "bdm"
      ? "/bdm"
      : session.role?.id === "geo-head"
        ? "/geo-head"
        : session.role?.id === "practice-head"
          ? "/practice-head"
          : session.role?.id === "buh"
            ? "/buh"
          : "/executive"
  }/profile`;
  const profileLinkHref = appendSharedWorkspaceSearch(profileHref, searchParams);
  const showNotifications =
    session.role?.id !== "bdm" && session.role?.id !== "practice-head";

  useEffect(() => {
    window.localStorage.setItem(
      "rapid-workspace-sidebar",
      collapsed ? "collapsed" : "expanded",
    );
  }, [collapsed]);

  useEffect(() => {
    if (!showGreeting || typeof window === "undefined") {
      return;
    }
    const timeout = window.setTimeout(() => setShowGreeting(false), 4200);
    return () => window.clearTimeout(timeout);
  }, [showGreeting]);

  return (
    <DrillDownProvider>
      <div
        className="workspace-root min-h-screen text-slate-950"
        data-theme="light"
        data-variant={variant}
      >
      {showGreeting ? (
        <div className="pointer-events-none fixed right-6 top-[88px] z-[70] max-w-xs rounded-[26px] border border-white/70 bg-white/78 px-4 py-3 text-slate-900 shadow-[0_28px_70px_rgba(15,23,42,0.18)] backdrop-blur-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Welcome back
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-950">{session.name}</p>
          <p className="mt-1 text-xs text-slate-600">
            Your workspace is ready with your scoped data.
          </p>
        </div>
      ) : null}
      <WorkspaceActivityTracker />
      <header
        className={`sticky top-0 z-40 h-[72px] border-b px-3 py-3 backdrop-blur sm:px-4 lg:px-6 ${
          isMacos
            ? "border-black/10 bg-white/70 shadow-[0_1px_0_rgba(15,23,42,0.06)]"
            : "border-slate-200 bg-white/92"
        }`}
      >
        <div className="flex h-full min-w-0 items-center gap-3 sm:gap-4">
          <Link href="/" className="shrink-0">
            <MindteckLogo className="h-8 w-auto" priority />
          </Link>

          <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2 overflow-x-auto pb-1">
            {!isAdminWorkspace ? <WorkspaceDashboardMenu /> : null}
            <WorkspaceGlobalSlicer />
            {hasMultipleWorkspaceRoles ? (
              <Link
                href="/login/select-role"
                className={`shrink-0 inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${
                  isMacos
                    ? "border-black/10 bg-white/65 text-slate-700 hover:border-black/20 hover:text-slate-950"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                }`}
              >
                Switch role
              </Link>
            ) : null}
            {hasAdminAccess && !isAdminWorkspace ? (
              <Link
                href="/admin"
                className={`shrink-0 inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${
                  isMacos
                    ? "border-black/10 bg-white/65 text-slate-700 hover:border-black/20 hover:text-slate-950"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                }`}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                Admin
              </Link>
            ) : null}
            {showNotifications ? (
              <Link
                href="/notifications"
                className={`shrink-0 rounded-full border p-2.5 ${
                  isMacos
                    ? "border-black/10 bg-white/65 text-slate-700 hover:border-black/20 hover:text-slate-950"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-950"
                }`}
                aria-label="Notifications"
              >
                <Bell className="h-4 w-4" />
              </Link>
            ) : null}
            <Link
              href={profileLinkHref}
              className={`shrink-0 inline-flex flex-col items-center justify-center gap-1 rounded-[20px] border px-3 py-2 ${
                isMacos
                  ? "border-black/10 bg-white/65 text-slate-700 hover:border-black/20 hover:text-slate-950"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
              }`}
              aria-label="Profile"
            >
              <UserRound className="h-4 w-4" />
              <span className="hidden max-w-[140px] truncate text-xs font-semibold sm:block sm:text-sm">
                {profileName}
              </span>
            </Link>
            <LogoutForm compact />
          </div>
        </div>
      </header>

      <div className="-mt-px flex min-h-[calc(100vh-72px)]">
        <aside
          className={`sticky top-[72px] flex h-[calc(100vh-72px)] shrink-0 flex-col border-r px-2 pb-3 pt-0 transition-all duration-200 ${
            collapsed ? "w-[74px]" : "w-[224px]"
          } ${
            isMacos
              ? "border-black/10 bg-white/55"
              : "border-slate-200 bg-white/78"
          }`}
        >
          {!collapsed && areaLabel ? (
            <div className="px-1 pt-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-700">
                {areaLabel}
              </p>
            </div>
          ) : null}

          <div className="flex-1">
            <WorkspaceNav items={navItems} collapsed={collapsed} />
          </div>

          <div className="mt-auto flex flex-col items-center gap-2 px-2 pb-1">
            <button
              type="button"
              onClick={() => setCollapsed((current) => !current)}
              className={`inline-flex h-9 w-9 items-center justify-center rounded-full border ${
                isMacos
                  ? "border-black/10 bg-white/65 text-slate-700 hover:border-black/20 hover:text-slate-950"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-950"
              }`}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 space-y-6 px-4 py-4 lg:px-7 lg:py-6">{children}</main>
      </div>
      </div>
    </DrillDownProvider>
  );
}
