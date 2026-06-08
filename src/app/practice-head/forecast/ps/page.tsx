import Link from "next/link";

import { LazyForecastSheet } from "@/components/workspace-lazy-components";
import { requirePermission } from "@/lib/auth";
import { getAdminSettings } from "@/lib/backend-api";

function SegmentTabs() {
  return (
    <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-1.5">
      <Link
        href="/practice-head/forecast/ms"
        className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
      >
        MS
      </Link>
      <Link
        href="/practice-head/forecast/ps"
        className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
      >
        PS
      </Link>
    </div>
  );
}

export default async function PracticeHeadForecastPsPage() {
  await requirePermission("view_dashboard");
  const settingsResponse = await getAdminSettings();

  return (
    <div className="space-y-4">
      <SegmentTabs />
      <LazyForecastSheet
        segment="PS"
        title="PS forecast"
        subtitle="Provide PS hours and submit forecast updates."
        showRestrictedRoleBudgets={settingsResponse.settings.showRestrictedRoleBudgets}
      />
    </div>
  );
}
