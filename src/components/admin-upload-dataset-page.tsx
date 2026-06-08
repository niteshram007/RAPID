import Link from "next/link";
import { FileSpreadsheet, UploadCloud } from "lucide-react";

import {
  deleteUploadedWorkbookAction,
} from "@/app/admin/actions";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import { getAdminUploads, getBackendHealth } from "@/lib/backend-api";
import { getFinancialYears } from "@/lib/financial-years";

const pageMessages = {
  "upload-complete": {
    tone: "success",
    message:
      "The workbook was uploaded, validated, and imported successfully.",
  },
  "upload-deleted": {
    tone: "success",
    message: "The upload and imported rows were deleted.",
  },
  "missing-upload-fields": {
    tone: "error",
    message: "Choose a financial year and Excel workbook before uploading.",
  },
  "invalid-financial-year": {
    tone: "error",
    message: "Choose a valid financial year from the available list.",
  },
  "invalid-upload-file": {
    tone: "error",
    message: "Only .xlsx, .xls, or .csv files can be uploaded.",
  },
  "upload-failed": {
    tone: "error",
    message:
      "The workbook could not be uploaded and imported through the backend.",
  },
  "missing-upload-id": {
    tone: "error",
    message: "Upload id is missing. Refresh and try again.",
  },
  "upload-not-found": {
    tone: "error",
    message: "The selected upload record was not found.",
  },
  "upload-delete-failed": {
    tone: "error",
    message: "The upload could not be deleted from storage.",
  },
} as const;

type DatasetType = "budget" | "global_revenue" | "forecast";
type UploadPageKey = "budget" | "actuals" | "global-revenue";

const DATASET_ROUTE_MAP: Record<UploadPageKey, { dataset: DatasetType; label: string; href: string }> = {
  budget: { dataset: "budget", label: "Budget", href: "/admin/upload/budget" },
  actuals: {
    dataset: "global_revenue",
    label: "Actuals",
    href: "/admin/upload/actuals",
  },
  "global-revenue": {
    dataset: "global_revenue",
    label: "Actuals",
    href: "/admin/upload/actuals",
  },
};
const DATASET_TABS: UploadPageKey[] = ["budget", "actuals"];

function resolveQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatBytes(sizeBytes: number) {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function resolveDefaultTimeframeMonth() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function resolveDefaultFinancialYear() {
  const now = new Date();
  const calendarYear = now.getFullYear();
  const calendarMonth = now.getMonth() + 1;
  const fiscalStartYear = calendarMonth >= 4 ? calendarYear : calendarYear - 1;
  return `${fiscalStartYear}-${fiscalStartYear + 1}`;
}

function mergeFinancialYearOptions(...collections: Array<Array<string | undefined | null>>) {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const collection of collections) {
    for (const value of collection) {
      const normalized = String(value || "").trim();
      if (!normalized || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      output.push(normalized);
    }
  }
  return output.sort((left, right) => left.localeCompare(right));
}

export async function AdminUploadDatasetPage({
  pageKey,
  searchParams,
}: {
  pageKey: UploadPageKey;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const active = DATASET_ROUTE_MAP[pageKey];
  const [uploads, health] = await Promise.all([getAdminUploads(), getBackendHealth()]);
  const feedbackKey =
    resolveQueryValue(searchParams.status) ?? resolveQueryValue(searchParams.error);
  const failureDetail = resolveQueryValue(searchParams.detail);
  const feedback = feedbackKey
    ? pageMessages[feedbackKey as keyof typeof pageMessages]
    : null;

  const filteredUploads = uploads.uploads.filter(
    (upload) => (upload.datasetType ?? "").toLowerCase() === active.dataset,
  );
  const defaultTimeframeMonth = resolveDefaultTimeframeMonth();
  const defaultFinancialYear = resolveDefaultFinancialYear();
  const financialYearOptions = mergeFinancialYearOptions(
    getFinancialYears(2020, new Date().getFullYear() + 1),
    uploads.financialYears,
    [defaultFinancialYear],
  );
  const selectedFinancialYearFromQuery = resolveQueryValue(searchParams.financialYear)?.trim() ?? "";
  const selectedFinancialYear = financialYearOptions.includes(selectedFinancialYearFromQuery)
    ? selectedFinancialYearFromQuery
    : financialYearOptions.at(-1) ?? defaultFinancialYear;
  const isActualsDataset = active.dataset === "global_revenue";

  return (
    <>
      <WorkspacePageHeader
        eyebrow="Upload"
        title={`${active.label} ingestion`}
        description={
          isActualsDataset
            ? "Upload the monthly actuals workbook for the selected financial year. The latest month upload is automatically used for analytics."
            : `Upload and read ${active.label} files from this dedicated section.`
        }
      />

      <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-1.5">
        {DATASET_TABS.map((tabKey) => {
          const item = DATASET_ROUTE_MAP[tabKey];
          return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${
              item.href === active.href
                ? "bg-slate-950 text-white"
                : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            {item.label}
          </Link>
          );
        })}
      </div>

      {feedback ? (
        <div
          className={`rounded-[24px] border px-5 py-4 text-sm ${
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

      <section className="grid gap-6 xl:grid-cols-[0.72fr_1.28fr]">
        <article className="surface-card px-6 py-6 lg:px-8">
          <span className="section-kicker">
            <UploadCloud className="h-4 w-4" />
            Upload {active.label}
          </span>
          <h3 className="font-display mt-4 text-3xl tracking-tight text-slate-950">
            Register source file
          </h3>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {isActualsDataset
              ? "Use this page for month-by-month actuals uploads from April to March. Pick a financial year first, then upload each month. The latest month upload is used in analytics and Trends for that year."
              : "Use this page to upload the source workbook, then review or edit rows from the admin editor if needed."}
          </p>

          <form action="/api/admin/uploads" method="post" encType="multipart/form-data" className="mt-8 grid gap-5">
            <input type="hidden" name="datasetType" value={active.dataset} />
            <input type="hidden" name="returnPath" value={active.href} />
            {isActualsDataset ? (
              <>
                <div>
                  <label className="block text-sm font-semibold text-slate-700" htmlFor="financialYear">
                    Financial Year
                  </label>
                  <select
                    id="financialYear"
                    name="financialYear"
                    className="auth-input"
                    defaultValue={selectedFinancialYear}
                    required
                  >
                    {financialYearOptions.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700" htmlFor="timeframeMonth">
                    Timeframe calendar
                  </label>
                  <input
                    id="timeframeMonth"
                    name="timeframeMonth"
                    type="month"
                    className="auth-input"
                    defaultValue={defaultTimeframeMonth}
                    required
                  />
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    Pick the upload month from calendar. Upload month is derived from this value (Apr to Mar), and the latest month for the selected FY is marked active for analytics.
                  </p>
                </div>
              </>
            ) : (
              <div>
                <label className="block text-sm font-semibold text-slate-700" htmlFor="timeframeMonth">
                  Timeframe calendar
                </label>
                <input
                  id="timeframeMonth"
                  name="timeframeMonth"
                  type="month"
                  className="auth-input"
                  defaultValue={defaultTimeframeMonth}
                  required
                />
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Pick month and year here. Financial year and upload month are auto-resolved from this calendar selection.
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-slate-700" htmlFor="workbook">
                Excel workbook
              </label>
              <input
                id="workbook"
                name="workbook"
                type="file"
                accept=".xlsx,.xls,.csv"
                required
                className="auth-input file:mr-4 file:rounded-full file:border-0 file:bg-slate-950 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
              />
            </div>

            <button type="submit" className="auth-button-primary w-fit">
              Upload source file
            </button>
            <Link
              href={`/admin/master-data?datasetType=${active.dataset}`}
              className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:text-slate-950"
            >
              Open row editor
            </Link>
          </form>

          <div className="mt-6 rounded-[24px] border border-slate-100 bg-slate-50 px-5 py-5 text-sm leading-7 text-slate-600">
            Backend status: <span className="font-semibold">{health.status}</span>
            <br />
            Database:{" "}
            <span className="font-semibold">
              {health.database?.status ?? "unknown"}
            </span>
          </div>
        </article>

        <article className="surface-card px-6 py-6 lg:px-8">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white">
              <FileSpreadsheet className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                {active.label} upload history
              </p>
              <h3 className="mt-1 text-2xl font-semibold text-slate-950">
                {filteredUploads.length} workbook{filteredUploads.length === 1 ? "" : "s"} tracked
              </h3>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {filteredUploads.length > 0 ? (
              filteredUploads.map((upload) => (
                <article
                  key={upload.id}
                  className="rounded-[24px] border border-slate-100 bg-white px-5 py-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-slate-950">
                        {upload.originalFilename}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        {[upload.uploadMonth, upload.financialYear, formatBytes(upload.sizeBytes)]
                          .filter(Boolean)
                          .join(" | ")}
                      </p>
                      <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        {upload.importedRows ?? 0} imported rows
                        {upload.active ? " | active dataset" : ""}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className="rounded-full bg-sky-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-sky-800">
                        {formatTimestamp(upload.uploadedAt)}
                      </span>
                      <form action={deleteUploadedWorkbookAction}>
                        <input type="hidden" name="uploadId" value={upload.id} />
                        <input type="hidden" name="returnPath" value={active.href} />
                        <button
                          type="submit"
                          className="rounded-full border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-rose-700 hover:bg-rose-50"
                        >
                          Delete upload
                        </button>
                      </form>
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <div className="rounded-[24px] border border-dashed border-slate-200 bg-white/80 px-5 py-6 text-sm leading-7 text-slate-600">
                No {active.label.toLowerCase()} workbook uploaded yet.
              </div>
            )}
          </div>
        </article>
      </section>
    </>
  );
}
