import { LazyForecastSheet } from "@/components/workspace-lazy-components";
import { requirePermission } from "@/lib/auth";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const FORECAST_MONTHS = [
  "Apr 2026",
  "May 2026",
  "Jun 2026",
  "Jul 2026",
  "Aug 2026",
  "Sep 2026",
  "Oct 2026",
  "Nov 2026",
  "Dec 2026",
  "Jan 2027",
  "Feb 2027",
  "Mar 2027",
];

function resolveQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ExecutiveForecastPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requirePermission("view_dashboard");
  const query = await searchParams;
  const requestedMonth = resolveQueryValue(query.forecastMonth) ?? "";
  const selectedMonth = requestedMonth === "all"
    ? "all"
    : FORECAST_MONTHS.includes(requestedMonth)
    ? requestedMonth
    : "all";
  const selectedMonthLabel = selectedMonth === "all" ? "All months" : selectedMonth;

  return (
    <div className="space-y-4">
      <form className="surface-card flex flex-wrap items-end gap-3 px-4 py-4">
        <label className="grid gap-2 text-sm font-semibold text-slate-700">
          Saved forecast view
          <select name="forecastMonth" defaultValue={selectedMonth} className="auth-input min-w-44">
            <option value="all">All months</option>
            {FORECAST_MONTHS.map((month) => (
              <option key={month} value={month}>
                {month}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="auth-button-primary h-12 px-4">
          View
        </button>
      </form>
      <LazyForecastSheet
        showBdmFilter
        showPracticeHeadFilter
        showMspsFilter
        readOnly
        snapshotMonth={selectedMonth === "all" ? null : selectedMonth}
        showFunctionalForecast={false}
        stickyTotalRow={false}
        title={`Forecast data (${selectedMonthLabel})`}
        subtitle="Read-only view of saved forecast values across all months."
      />
    </div>
  );
}
