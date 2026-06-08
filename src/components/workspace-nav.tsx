"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Activity,
  Bot,
  CalendarClock,
  Database,
  DatabaseZap,
  LayoutDashboard,
  MapPinned,
  Sheet,
  Settings2,
  SlidersHorizontal,
  Target,
  TrendingUp,
  Upload,
  UserRound,
  Users2,
} from "lucide-react";

import { appendSharedWorkspaceSearch } from "@/lib/workspace-search";

const iconMap = {
  overview: LayoutDashboard,
  users: Users2,
  location: MapPinned,
  upload: Upload,
  settings: Settings2,
  dashboard: LayoutDashboard,
  slicer: SlidersHorizontal,
  pivot: Sheet,
  neural: Bot,
  trends: TrendingUp,
  profile: UserRound,
  forecast: CalendarClock,
  master: Database,
  datacenter: DatabaseZap,
  session: Activity,
  kpi: Target,
} as const;

export type WorkspaceIcon = keyof typeof iconMap;

export type WorkspaceNavItem = {
  href: string;
  label: string;
  icon: WorkspaceIcon;
  exact?: boolean;
};

export function WorkspaceNav({
  items,
  collapsed = false,
}: {
  items: WorkspaceNavItem[];
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <nav className="space-y-1.5 px-1">
      {items.map((item) => {
        const Icon = iconMap[item.icon];
        const resolvedHref = appendSharedWorkspaceSearch(item.href, searchParams);
        const isActive = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={resolvedHref}
            title={collapsed ? item.label : undefined}
            className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
              isActive
                ? "bg-slate-950 text-white shadow-[0_18px_36px_rgba(15,23,42,0.22)]"
                : "text-slate-600 hover:bg-white hover:text-slate-950"
            } ${collapsed ? "justify-center px-2" : ""}`}
          >
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-2xl ${
                isActive ? "bg-white/12" : "bg-slate-100 text-slate-700"
              }`}
            >
              <Icon className="h-4.5 w-4.5" />
            </span>
            {!collapsed ? <span>{item.label}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
