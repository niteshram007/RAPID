"use client";

import { Bell, Inbox } from "lucide-react";

import type {
  ForecastSubmissionMatrix,
  ForecastSubmissionMatrixCell,
  RevenueNotification,
} from "@/lib/rapid-revenue";

type NotificationsInboxProps = {
  notifications: RevenueNotification[];
  forecastSubmissionMatrix: ForecastSubmissionMatrix;
};

function isAprilRow(month: string) {
  return month.trim().toLowerCase().startsWith("apr");
}

function getDisplayCell(
  month: string,
  cell: ForecastSubmissionMatrixCell | undefined,
): ForecastSubmissionMatrixCell | undefined {
  if (!isAprilRow(month)) {
    return cell;
  }
  return {
    status: "complete",
    submittedAt: cell?.submittedAt ?? null,
  };
}

function formatSubmissionDateTime(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function getSubmissionCellClass(cell: ForecastSubmissionMatrixCell | undefined) {
  if (cell?.status === "complete") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (cell?.status === "future" || cell?.status === "no_scope") {
    return "border-slate-200 bg-slate-100 text-slate-500";
  }
  return "border-rose-200 bg-rose-50 text-rose-800";
}

function getSubmissionCellLabel(cell: ForecastSubmissionMatrixCell | undefined) {
  if (!cell || cell.status === "no_scope") {
    return "No scope";
  }
  if (cell.status === "future") {
    return "Future";
  }
  if (cell.status === "complete") {
    return "Submitted";
  }
  return "Pending";
}

export function NotificationsInbox({
  notifications,
  forecastSubmissionMatrix,
}: NotificationsInboxProps) {
  const bdmColumns = forecastSubmissionMatrix.columns?.bdm ?? [];
  const matrixRows = forecastSubmissionMatrix.rows ?? [];
  const totalColumns = 1 + Math.max(1, bdmColumns.length);

  return (
    <section className="surface-card px-5 py-5 lg:px-6">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white">
          <Bell className="h-4.5 w-4.5" />
        </span>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-700">
            Notifications
          </p>
          <h1 className="font-display mt-1 text-2xl text-slate-950">Alerts</h1>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        <div className="rounded-[18px] border border-slate-200 bg-white">
          <div className="px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Forecast submissions
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full text-left text-xs">
              <thead className="sticky top-0 z-10 bg-slate-950 text-white">
                <tr>
                  <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em]">
                    Month
                  </th>
                  {bdmColumns.length > 0 ? (
                    bdmColumns.map((column) => (
                      <th
                        key={`bdm-column-${column.key}`}
                        className="px-2.5 py-2.5 text-center text-[11px] font-semibold tracking-[0.02em]"
                      >
                        {column.label}
                      </th>
                    ))
                  ) : (
                    <th className="px-3 py-2.5 text-[11px] font-semibold tracking-[0.02em]">
                      No BDM scope
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {matrixRows.length === 0 ? (
                  <tr>
                    <td colSpan={totalColumns} className="px-4 py-5 text-center text-sm text-slate-500">
                      No forecast submission status is available.
                    </td>
                  </tr>
                ) : (
                  matrixRows.map((row) => {
                    const rowIsApril = isAprilRow(row.month);
                    return (
                      <tr key={row.month} className="border-b border-slate-100 last:border-b-0">
                        <td className="px-3 py-2 font-semibold text-slate-800">{row.month}</td>
                        {bdmColumns.length > 0 ? (
                          bdmColumns.map((column) => {
                            const rawCell = row.cells?.[column.key];
                            const cell = getDisplayCell(row.month, rawCell);
                            const submittedAt = formatSubmissionDateTime(cell?.submittedAt);
                            const hoverTitle =
                              !rowIsApril && cell?.status === "complete" && submittedAt
                                ? `Submitted on ${submittedAt}`
                                : undefined;
                            return (
                              <td key={`${row.month}-${column.key}`} className="px-2 py-2 align-top text-center">
                                <span
                                  title={hoverTitle}
                                  className={`inline-flex min-w-20 justify-center rounded-xl border px-2 py-1 text-[11px] font-semibold ${getSubmissionCellClass(cell)}`}
                                >
                                  {getSubmissionCellLabel(cell)}
                                </span>
                              </td>
                            );
                          })
                        ) : (
                          <td className="px-3 py-2">
                            <span className="inline-flex min-w-20 justify-center rounded-xl border border-slate-200 bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-500">
                              No scope
                            </span>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {notifications.length === 0 ? (
          <div className="rounded-[20px] border border-dashed border-slate-200 bg-white px-4 py-5 text-center">
            <Inbox className="mx-auto h-7 w-7 text-slate-400" />
            <p className="mt-3 text-sm text-slate-600">No active notifications right now.</p>
          </div>
        ) : (
          notifications.map((notification) => (
            <article
              key={notification.id}
              className="rounded-[20px] border border-slate-200 bg-white px-4 py-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {notification.category.replaceAll("_", " ")}
                  </p>
                  <h2 className="mt-1.5 text-base font-semibold text-slate-950">
                    {notification.title}
                  </h2>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-700">
                  {new Intl.DateTimeFormat("en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(notification.createdAt))}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">{notification.message}</p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
