import type { Role } from "@/lib/rbac-store";
import type { WorkspaceNavItem } from "@/components/workspace-nav";

export function buildWorkspaceNav(
  role: Role | null,
  base: "/executive" | "/bdm" | "/geo-head" | "/practice-head" | "/buh" = role?.id === "bdm"
    ? "/bdm"
    : role?.id === "geo-head"
      ? "/geo-head"
      : role?.id === "buh"
        ? "/buh"
      : role?.id === "practice-head"
        ? "/practice-head"
        : "/executive",
): WorkspaceNavItem[] {
  if (base === "/buh") {
    return [
      { href: "/buh", label: "Dashboard", icon: "dashboard", exact: true },
      { href: "/buh/analytics-kiosk", label: "Analytics Kiosk", icon: "slicer" },
      { href: "/buh/master-data", label: "Master Data", icon: "master" },
      { href: "/buh/forecast", label: "Forecast", icon: "forecast" },
      { href: "/buh/kra-kpi", label: "KRA/KPI", icon: "kpi" },
    ];
  }

  const analyticsKioskHref =
    base === "/practice-head"
      ? `${base}/analytics-kiosk`
      : base === "/bdm"
        ? "/bdm/analytics-kiosk"
        : base === "/geo-head"
          ? "/geo-head/analytics-kiosk"
          : `${base}/slicer`;
  const showMasterData =
    base !== "/bdm" && base !== "/practice-head" && base !== "/executive";
  const masterDataLabel = "Masterdata";
  const masterDataIcon: WorkspaceNavItem["icon"] = "master";

  return [
    { href: base, label: "Dashboard", icon: "dashboard", exact: true },
    { href: analyticsKioskHref, label: "Analytics Kiosk", icon: "slicer" },
    ...(showMasterData
      ? [{ href: `${base}/master-data`, label: masterDataLabel, icon: masterDataIcon }]
      : []),
    ...(base === "/executive" || base === "/practice-head" || base === "/geo-head" || role?.permissions.includes("submit_forecast")
      ? [{ href: `${base}/forecast`, label: "Forecast", icon: "forecast" as const }]
      : []),
    ...(base === "/executive" || base === "/geo-head" || base === "/bdm" || base === "/practice-head"
      ? [{ href: `${base}/kra-kpi`, label: "KRA/KPI", icon: "kpi" as const }]
      : []),
    ...(base === "/executive"
      ? [
          { href: "/executive/trends", label: "Trends", icon: "trends" as const },
          { href: "/executive/neural-switch", label: "Neural Switch", icon: "neural" as const },
          { href: "/executive/settings", label: "SessionTracker", icon: "session" as const },
        ]
      : []),
  ];
}
