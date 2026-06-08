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
        className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
      >
        MS
      </Link>
      <Link
        href="/bdm/forecast/ps"
        className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
      >
        PS
      </Link>
    </div>
  );
}

export default async function BdmForecastPsPage() {
  const session = await requirePermission("view_dashboard");
  if (!hasPermission(session.role, "submit_forecast")) {
    redirect(getDefaultRouteForRole(session.role));
  }
  const settingsResponse = await getAdminSettings();

  return (
    <div className="space-y-4">
      <SegmentTabs />
      <LazyForecastSheet
        segment="PS"
        title="PS forecast and working hours"
        subtitle="For PS rows, provide billed and billable actual hours by month using admin-defined country working-day setup."
        showRestrictedRoleBudgets={settingsResponse.settings.showRestrictedRoleBudgets}
      />
    </div>
  );
}
