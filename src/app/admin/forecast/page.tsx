import { CalendarClock } from "lucide-react";

import { updateForecastControlAction } from "@/app/admin/actions";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { LazyForecastSheet } from "@/components/workspace-lazy-components";
import { getAdminForecastControl } from "@/lib/backend-api";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const pageMessages = {
  "forecast-control-saved": {
    tone: "success",
    message: "Forecast lock period and month rollout were updated.",
  },
  "invalid-forecast-control": {
    tone: "error",
    message: "Provide a valid lock period and rollout month.",
  },
  "forecast-control-save-failed": {
    tone: "error",
    message: "Unable to save forecast controls.",
  },
} as const;

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

export default async function AdminForecastPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const control = await getAdminForecastControl();
  const query = await searchParams;
  const feedbackKey = resolveQueryValue(query.status) ?? resolveQueryValue(query.error);
  const feedback = feedbackKey ? pageMessages[feedbackKey as keyof typeof pageMessages] : null;
  const failureDetail = resolveQueryValue(query.detail);
  const requestedForecastMonth = resolveQueryValue(query.forecastMonth) ?? "";
  const selectedForecastMonth = requestedForecastMonth === "all"
    ? "all"
    : FORECAST_MONTHS.includes(requestedForecastMonth)
    ? requestedForecastMonth
    : "all";
  const selectedForecastLabel = selectedForecastMonth === "all" ? "All months" : selectedForecastMonth;

  return (
    <>
      <WorkspacePageHeader
        eyebrow="Forecast Control"
        title="Admin lock and rollout control"
        description="Set the exact forecast submission window with calendar dates and choose the month from which users can still edit. Earlier months stay visible, stored, and locked."
      />

      {feedback ? (
        <div
          className={`rounded-[20px] border px-4 py-3 text-sm ${
            feedback.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          <p>{feedback.message}</p>
          {feedback.tone === "error" && failureDetail ? (
            <p className="mt-1 text-xs opacity-90">Reason: {failureDetail}</p>
          ) : null}
        </div>
      ) : null}

      <section className="surface-card px-6 py-6 lg:px-8">
        <span className="section-kicker">
          <CalendarClock className="h-4 w-4" />
          Submission window
        </span>
        <form action={updateForecastControlAction} className="mt-6 grid gap-4 lg:grid-cols-[0.9fr_0.9fr_1.2fr_auto]">
          <div>
            <label className="block text-sm font-semibold text-slate-700" htmlFor="lockinDate">
              Lock-in date
            </label>
            <input
              id="lockinDate"
              name="lockinDate"
              type="date"
              defaultValue={control.lockinDate ?? ""}
              className="auth-input"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700" htmlFor="lockoutDate">
              Lock-out date
            </label>
            <input
              id="lockoutDate"
              name="lockoutDate"
              type="date"
              defaultValue={control.lockoutDate ?? ""}
              className="auth-input"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700" htmlFor="rolloutStartMonth">
              Editable month starts from
            </label>
            <select
              id="rolloutStartMonth"
              name="rolloutStartMonth"
              defaultValue={control.activeMonth}
              className="auth-input"
            >
              {FORECAST_MONTHS.map((month) => (
                <option key={month} value={month}>
                  {month}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="auth-button-primary h-12 self-end">
            Save controls
          </button>
        </form>
      </section>

      <section className="surface-card px-6 py-6 lg:px-8">
        <h3 className="text-lg font-semibold text-slate-950">How the lock works</h3>
        <p className="mt-2 text-sm text-slate-600">
          Users can update months from <span className="font-semibold">{control.activeMonth}</span> onward between
          <span className="font-semibold"> {control.lockinDate ?? `day ${control.lockinDay}`}</span> and
          <span className="font-semibold"> {control.lockoutDate ?? `day ${control.lockoutDay}`}</span>. Earlier months remain visible in the table,
          but they are locked and cannot be edited.
        </p>
        <p className="mt-3 text-sm text-slate-600">
          Submission window:{" "}
          <span className="font-semibold">
            {control.submissionWindowOpen ? "open now" : "currently closed"}
          </span>
        </p>
      </section>

      <section className="surface-card px-6 py-6 lg:px-8">
        <form className="flex flex-wrap items-end gap-3">
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            Saved forecast view
            <select name="forecastMonth" defaultValue={selectedForecastMonth} className="auth-input min-w-44">
              <option value="all">All months</option>
              {FORECAST_MONTHS.map((month) => (
                <option key={`admin-view-${month}`} value={month}>
                  {month}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="auth-button-primary h-12 px-4">
            View saved forecast
          </button>
        </form>
      </section>

      <LazyForecastSheet
        showBdmFilter
        showPracticeHeadFilter
        showMspsFilter
        readOnly
        snapshotMonth={selectedForecastMonth === "all" ? null : selectedForecastMonth}
        showFunctionalForecast={false}
        stickyTotalRow={false}
        title={`Saved forecast (${selectedForecastLabel})`}
        subtitle="Admin accountability view of all saved forecast months."
      />
    </>
  );
}
