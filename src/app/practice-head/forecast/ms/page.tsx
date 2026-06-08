import Link from "next/link";

import { LazyForecastSheet } from "@/components/workspace-lazy-components";
import { requirePermission } from "@/lib/auth";
import { getAdminSettings } from "@/lib/backend-api";

function SegmentTabs() {
  return (
    <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-1.5">
      <Link
        href="/practice-head/forecast/ms"
        className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
      >
        MS
      </Link>
      <Link
        href="/practice-head/forecast/ps"
        className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
      >
        PS
      </Link>
    </div>
  );
}

export default async function PracticeHeadForecastMsPage() {
  await requirePermission("view_dashboard");
  const settingsResponse = await getAdminSettings();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentTabs />
        <Link
          href="/practice-head/forecast/ps"
          className="inline-flex items-center rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
        >
          Next: PS projects
        </Link>
      </div>
      <LazyForecastSheet
        segment="MS"
        title="MS forecast"
        subtitle="Update MS projects first, then move to PS and submit."
        showRestrictedRoleBudgets={settingsResponse.settings.showRestrictedRoleBudgets}
      />
    </div>
  );
}
