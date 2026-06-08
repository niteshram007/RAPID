import Link from "next/link";
import { redirect } from "next/navigation";

import { LazyForecastSheet } from "@/components/workspace-lazy-components";
import { getDefaultRouteForRole, requirePermission } from "@/lib/auth";
import { getAdminSettings } from "@/lib/backend-api";
import { hasPermission } from "@/lib/rbac-store";

function SegmentTabs() {
  return (
    <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-1.5">
      <Link
        href="/bdm/forecast/ms"
        className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
      >
        MS
      </Link>
      <Link
        href="/bdm/forecast/ps"
        className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
      >
        PS
      </Link>
    </div>
  );
}

export default async function BdmForecastMsPage() {
  const session = await requirePermission("view_dashboard");
  if (!hasPermission(session.role, "submit_forecast")) {
    redirect(getDefaultRouteForRole(session.role));
  }
  const settingsResponse = await getAdminSettings();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentTabs />
        <Link
          href="/bdm/forecast/ps"
          className="inline-flex items-center rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
        >
          Next: PS hours
        </Link>
      </div>
      <LazyForecastSheet
        segment="MS"
        title="MS forecast (Apr to Mar)"
        subtitle="Fill MS forecast values and continue to PS for working-hour updates."
        showRestrictedRoleBudgets={settingsResponse.settings.showRestrictedRoleBudgets}
      />
    </div>
  );
}
