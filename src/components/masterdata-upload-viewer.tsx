"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LoaderCircle, Search } from "lucide-react";
import { useSearchParams } from "next/navigation";

import {
  FISCAL_MONTH_LABELS,
  formatDateMmDdYy,
  formatMoneyValue,
  formatNumber,
  getFiscalMonthsThrough,
  getFiscalYearEndLabel,
  isDateLikeValue,
  resolveCurrentFiscalMonthLabel,
} from "@/lib/format";
import { TableFullscreenShell } from "@/components/table-fullscreen-shell";

type DatasetType = "budget" | "global_revenue" | "forecast";
type ColumnKind = "text" | "numeric" | "date";
type ActiveUploadSummary = {
  id: string;
  financialYear: string | null;
  uploadMonth: string | null;
  originalFilename: string;
  storedFilename: string;
  uploadedAt: string | null;
  importedRows: number;
};

type MasterdataResponse = {
  datasetType: DatasetType;
  columns: Array<{
    key: string;
    label: string;
    kind: ColumnKind;
  }>;
  rows: Array<Record<string, unknown>>;
  summary: {
    rowCount: number;
    financialYear: string | null;
    activeUpload?: ActiveUploadSummary | null;
  };
};

type ForecastSheetResponse = {
  forecastMonth: string;
  financialYear: string | null;
  forecastControls?: {
    visibleMonths?: string[];
  };
  rows: Array<Record<string, unknown>>;
  summary?: {
    rowCount?: number;
  };
};

type ViewerPayload = {
  datasetType: DatasetType;
  columns: string[];
  columnKinds: Record<string, ColumnKind>;
  rows: Array<Record<string, unknown>>;
  sourceRowCount: number;
  financialYear: string | null;
  availableMonths: string[];
  activeUpload?: ActiveUploadSummary | null;
};

const DATASET_OPTIONS: Array<{ value: DatasetType; label: string }> = [
  { value: "budget", label: "Budget" },
  { value: "global_revenue", label: "Actuals" },
  { value: "forecast", label: "Forecast" },
];
const ACTUALS_COLUMN_LABELS = ["Actuals", "Global Revenue", "Actual Revenue"] as const;

const SLICER_FIELD_MAP: Record<string, string> = {
  customerNames: "Customer Name",
  msps: "MS/PS",
  rowUs: "ROW/US",
  entities: "Entity",
  strategicAccounts: "Strategic Account",
  dealTypes: "Deal Type",
  eeennns: "EEENNN",
  projectNames: "Project Name",
  practiceHeads: "Practice Head",
  bdms: "BDM",
  geoHeads: "Geo Head",
  verticals: "Vertical",
  horizontals: "Horizontal",
};

const ALWAYS_HIDDEN_COLUMNS = new Set(["Client Name"]);
const BUDGET_HIDDEN_COLUMNS = new Set(["Billed Hours", "Billable Actual Hrs"]);
const DEFAULT_FORECAST_COLUMNS = [
  "Customer Name",
  "MS/PS",
  "Emp ID",
  "Resource Name",
  ...FISCAL_MONTH_LABELS,
  "FY",
  "Project Name",
  "Practice Head",
  "BDM",
  "Geo Head",
  "Vertical",
  "Horizontal",
  "Financial Year",
] as const;
const VIRTUAL_ROW_HEIGHT = 44;
const VIRTUAL_OVERSCAN = 18;

function toText(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

function toNumber(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolveActualsColumn(columns: string[]) {
  for (const candidate of ACTUALS_COLUMN_LABELS) {
    if (columns.includes(candidate)) {
      return candidate;
    }
  }
  return null;
}

function resolveRequestedDatasetType(value: string | null): DatasetType {
  if (value === "forecast" || value === "global_revenue") {
    return value;
  }
  return "budget";
}

function normalizeValue(value: unknown) {
  return toText(value).toLowerCase();
}

function normalizeMonthToken(value: unknown) {
  return toText(value).slice(0, 3).toLowerCase();
}

function inferForecastColumnKind(column: string): ColumnKind {
  const normalized = column.trim().toLowerCase();
  if (
    normalized === "updated at" ||
    normalized.includes("date") ||
    normalized === "submitted at"
  ) {
    return "date";
  }
  if (
    normalized === "fy" ||
    /^q[1-4]$/i.test(column) ||
    FISCAL_MONTH_LABELS.includes(column as (typeof FISCAL_MONTH_LABELS)[number]) ||
    normalized.includes("bill rate") ||
    normalized.includes("hours") ||
    normalized.includes("hrs")
  ) {
    return "numeric";
  }
  return "text";
}

function resolveFyColumn(columns: string[]) {
  return columns.find((column) => /^FY(\b|\s)/i.test(column)) ?? null;
}

function isHoursColumn(column: string) {
  const normalized = column.toLowerCase();
  return normalized.includes("hours") || normalized.includes("hrs");
}

function isMoneyColumn(column: string, kind: ColumnKind) {
  if (kind !== "numeric") {
    return false;
  }
  return !isHoursColumn(column);
}

function formatColumnLabel(
  column: string,
  kind: ColumnKind,
  financialYear: string | null,
  fyColumn: string | null,
) {
  if (fyColumn && column === fyColumn) {
    return `FY ${getFiscalYearEndLabel(financialYear)} $`;
  }
  if (isMoneyColumn(column, kind)) {
    return `${column} $`;
  }
  return column;
}

function formatCellValue(column: string, kind: ColumnKind, value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  if (kind === "date" || isDateLikeValue(value)) {
    return formatDateMmDdYy(String(value));
  }
  if (kind === "numeric") {
    if (isMoneyColumn(column, kind)) {
      return formatMoneyValue(toNumber(value));
    }
    return formatNumber(toNumber(value), 0);
  }
  return toText(value);
}

async function fetchMasterdata(
  datasetType: Exclude<DatasetType, "forecast">,
  financialYear: string,
): Promise<ViewerPayload> {
  const search = new URLSearchParams({
    datasetType,
    financialYear,
    limit: "100000",
  });
  const response = await fetch(`/api/masterdata?${search.toString()}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Unable to load uploaded masterdata.");
  }

  const body = (await response.json()) as MasterdataResponse;
  const visibleColumns = body.columns.map((column) => column.label);
  const columnKinds = Object.fromEntries(
    body.columns.map((column) => [column.label, column.kind]),
  ) as Record<string, ColumnKind>;
  const rows = body.rows.map((row) => {
    const mapped: Record<string, unknown> = {};
    for (const column of body.columns) {
      mapped[column.label] = row[column.key] ?? "";
    }
    mapped["Financial Year"] = row.financialYear ?? body.summary.financialYear ?? financialYear;
    return mapped;
  });

  if (!visibleColumns.includes("Financial Year")) {
    visibleColumns.push("Financial Year");
  }
  columnKinds["Financial Year"] = "text";

  return {
    datasetType,
    columns: visibleColumns,
    columnKinds,
    rows,
    sourceRowCount: Number(body.summary.rowCount ?? rows.length),
    financialYear: body.summary.financialYear ?? financialYear,
    availableMonths: [...FISCAL_MONTH_LABELS],
    activeUpload: body.summary.activeUpload ?? null,
  };
}

async function fetchForecastSheet(month: string, financialYear: string): Promise<ViewerPayload> {
  const search = new URLSearchParams();
  if (month) {
    search.set("forecastMonth", month);
  }
  if (financialYear) {
    search.set("financialYear", financialYear);
  }
  const response = await fetch(`/api/revenue/forecast-sheet?${search.toString()}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Unable to load forecast dataset.");
  }

  const body = (await response.json()) as ForecastSheetResponse;
  const rows = body.rows ?? [];
  const columns: string[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      columns.push(key);
    }
  }

  if (columns.length === 0) {
    columns.push(...DEFAULT_FORECAST_COLUMNS);
  }

  const columnKinds = Object.fromEntries(
    columns.map((column) => [column, inferForecastColumnKind(column)]),
  ) as Record<string, ColumnKind>;

  if (!columns.includes("Financial Year")) {
    columns.push("Financial Year");
    columnKinds["Financial Year"] = "text";
  }

  const availableMonths =
    body.forecastControls?.visibleMonths?.filter((entry) =>
      FISCAL_MONTH_LABELS.includes(entry as (typeof FISCAL_MONTH_LABELS)[number]),
    ) ?? [...FISCAL_MONTH_LABELS];

  return {
    datasetType: "forecast",
    columns,
    columnKinds,
    rows: rows.map((row) => ({
      ...row,
      "Financial Year": row["Financial Year"] ?? body.financialYear ?? "",
    })),
    sourceRowCount: Number(body.summary?.rowCount ?? rows.length),
    financialYear: body.financialYear,
    availableMonths: availableMonths.length > 0 ? availableMonths : [...FISCAL_MONTH_LABELS],
    activeUpload: null,
  };
}

export type MasterdataUploadViewerProps = {
  financialYears: string[];
  datasetFinancialYears?: Partial<Record<DatasetType, string[]>>;
  initialFinancialYear: string;
};

function resolveDatasetYears(
  datasetType: DatasetType,
  financialYears: string[],
  datasetFinancialYears?: Partial<Record<DatasetType, string[]>>,
) {
  if (datasetType === "forecast") {
    return financialYears;
  }
  const configured = datasetFinancialYears?.[datasetType] ?? [];
  const cleaned = configured
    .map((value) => String(value || "").trim())
    .filter((value) => value.length > 0);
  return cleaned.length > 0 ? cleaned : financialYears;
}

function mergeRequestedFinancialYear(options: string[], requestedFinancialYear: string) {
  const normalizedRequested = String(requestedFinancialYear || "").trim();
  if (!normalizedRequested) {
    return options;
  }
  if (options.includes(normalizedRequested)) {
    return options;
  }
  return [...options, normalizedRequested].sort((left, right) => left.localeCompare(right));
}

export function MasterdataUploadViewer({
  financialYears,
  datasetFinancialYears,
  initialFinancialYear,
}: MasterdataUploadViewerProps) {
  const searchParams = useSearchParams();
  const requestedDatasetType = useMemo(
    () =>
      resolveRequestedDatasetType(
        searchParams.get("datasetType")?.trim() || null,
      ),
    [searchParams],
  );
  const requestedFinancialYear = useMemo(
    () =>
      searchParams.get("financialYear")?.trim() ||
      searchParams.getAll("financialYears")[0]?.trim() ||
      initialFinancialYear,
    [initialFinancialYear, searchParams],
  );
  const requestedDatasetYears = useMemo(
    () =>
      mergeRequestedFinancialYear(
        resolveDatasetYears(requestedDatasetType, financialYears, datasetFinancialYears),
        requestedFinancialYear,
      ),
    [datasetFinancialYears, financialYears, requestedDatasetType, requestedFinancialYear],
  );
  const resolvedInitialFinancialYear = useMemo(() => {
    if (requestedFinancialYear) {
      return requestedFinancialYear;
    }
    return requestedDatasetYears.at(-1) ?? initialFinancialYear;
  }, [initialFinancialYear, requestedDatasetYears, requestedFinancialYear]);
  const resetKey = useMemo(
    () => `${requestedDatasetType}:${resolvedInitialFinancialYear}`,
    [requestedDatasetType, resolvedInitialFinancialYear],
  );

  return (
    <MasterdataUploadViewerContent
      key={resetKey}
      financialYears={financialYears}
      datasetFinancialYears={datasetFinancialYears}
      initialFinancialYear={resolvedInitialFinancialYear}
      initialDatasetType={requestedDatasetType}
    />
  );
}

function MasterdataUploadViewerContent({
  financialYears,
  datasetFinancialYears,
  initialFinancialYear,
  initialDatasetType,
}: MasterdataUploadViewerProps & {
  initialDatasetType: DatasetType;
}) {
  const searchParams = useSearchParams();
  const [datasetType, setDatasetType] = useState<DatasetType>(initialDatasetType);
  const [selectedFinancialYear, setSelectedFinancialYear] = useState(initialFinancialYear);
  const [searchText, setSearchText] = useState("");
  const deferredSearchText = useDeferredValue(searchText);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const deferredColumnFilters = useDeferredValue(columnFilters);
  const [tableScrollTop, setTableScrollTop] = useState(0);
  const [tableViewportHeight, setTableViewportHeight] = useState(560);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const currentMonthRequest = useMemo(() => resolveCurrentFiscalMonthLabel(FISCAL_MONTH_LABELS), []);

  const datasetYears = useMemo(
    () =>
      mergeRequestedFinancialYear(
        resolveDatasetYears(datasetType, financialYears, datasetFinancialYears),
        selectedFinancialYear,
      ),
    [datasetFinancialYears, datasetType, financialYears, selectedFinancialYear],
  );

  const financialYear = useMemo(() => {
    if (datasetYears.length === 0) {
      return "";
    }
    if (datasetYears.includes(selectedFinancialYear)) {
      return selectedFinancialYear;
    }
    return datasetYears.at(-1) ?? "";
  }, [datasetYears, selectedFinancialYear]);

  const scrollTableToTop = () => {
    setTableScrollTop(0);
    tableScrollRef.current?.scrollTo({ top: 0 });
  };

  const query = useQuery({
    queryKey: ["masterdata-upload-viewer", datasetType, financialYear, currentMonthRequest],
    queryFn: async () => {
      if (datasetType === "forecast") {
        return fetchForecastSheet(currentMonthRequest, financialYear);
      }
      return fetchMasterdata(datasetType, financialYear);
    },
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });

  const slicerSelections = useMemo(() => {
    const selections: Record<string, string[]> = {};
    for (const [queryKey, label] of Object.entries(SLICER_FIELD_MAP)) {
      selections[label] = searchParams
        .getAll(queryKey)
        .map((value) => value.trim())
        .filter(Boolean);
    }
    return selections;
  }, [searchParams]);

  const displayColumns = useMemo(() => {
    const columns = query.data?.columns ?? [];
    return columns.filter((column) => {
      if (ALWAYS_HIDDEN_COLUMNS.has(column)) {
        return false;
      }
      if (datasetType === "budget" && BUDGET_HIDDEN_COLUMNS.has(column)) {
        return false;
      }
      return true;
    });
  }, [datasetType, query.data?.columns]);

  const fyColumn = useMemo(() => resolveFyColumn(displayColumns), [displayColumns]);
  const availableMonthColumns = useMemo(
    () => displayColumns.filter((column) => FISCAL_MONTH_LABELS.includes(column as (typeof FISCAL_MONTH_LABELS)[number])),
    [displayColumns],
  );
  const actualsColumn = useMemo(
    () => (datasetType === "global_revenue" ? resolveActualsColumn(displayColumns) : null),
    [datasetType, displayColumns],
  );
  const currentMonthLabel = useMemo(() => {
    if (availableMonthColumns.length === 0) {
      return resolveCurrentFiscalMonthLabel(query.data?.availableMonths ?? FISCAL_MONTH_LABELS);
    }
    return resolveCurrentFiscalMonthLabel(availableMonthColumns);
  }, [availableMonthColumns, query.data?.availableMonths]);
  const ytdMonthLabels = useMemo(
    () => getFiscalMonthsThrough(currentMonthLabel, FISCAL_MONTH_LABELS).filter((month) => displayColumns.includes(month)),
    [currentMonthLabel, displayColumns],
  );

  const slicerFilteredRows = useMemo(() => {
    const rows = query.data?.rows ?? [];
    return rows.filter((row) => {
      for (const [label, selectedValues] of Object.entries(slicerSelections)) {
        if (selectedValues.length === 0) {
          continue;
        }
        const rowValue = normalizeValue(row[label]);
        if (!selectedValues.some((value) => value.trim().toLowerCase() === rowValue)) {
          return false;
        }
      }
      if (financialYear && datasetType === "forecast") {
        const rowYear = normalizeValue(row["Financial Year"]);
        if (rowYear && rowYear !== normalizeValue(financialYear)) {
          return false;
        }
      }
      return true;
    });
  }, [datasetType, financialYear, query.data?.rows, slicerSelections]);

  const columnFilterOptions = useMemo(() => {
    const options: Record<string, string[]> = {};
    for (const column of displayColumns) {
      const set = new Set<string>();
      for (const row of slicerFilteredRows) {
        const value = toText(row[column]);
        if (!value) {
          continue;
        }
        set.add(value);
        if (set.size >= 400) {
          break;
        }
      }
      options[column] = Array.from(set).sort((left, right) => left.localeCompare(right));
    }
    return options;
  }, [displayColumns, slicerFilteredRows]);

  const visibleRows = useMemo(() => {
    const needle = deferredSearchText.trim().toLowerCase();
    return slicerFilteredRows.filter((row) => {
      for (const column of displayColumns) {
        const filterValue = (deferredColumnFilters[column] ?? "").trim();
        if (!filterValue) {
          continue;
        }
        if (normalizeValue(row[column]) !== normalizeValue(filterValue)) {
          return false;
        }
      }
      if (!needle) {
        return true;
      }
      return displayColumns.some((column) => toText(row[column]).toLowerCase().includes(needle));
    });
  }, [deferredColumnFilters, deferredSearchText, displayColumns, slicerFilteredRows]);

  const columnTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const column of displayColumns) {
      const kind = query.data?.columnKinds[column] ?? "text";
      if (kind !== "numeric") {
        continue;
      }
      totals[column] = visibleRows.reduce((sum, row) => sum + toNumber(row[column]), 0);
    }
    return totals;
  }, [displayColumns, query.data?.columnKinds, visibleRows]);

  const totalFy = useMemo(() => {
    if (datasetType === "global_revenue" && actualsColumn) {
      return visibleRows.reduce((sum, row) => sum + toNumber(row[actualsColumn]), 0);
    }
    if (!fyColumn) {
      return 0;
    }
    return visibleRows.reduce((sum, row) => sum + toNumber(row[fyColumn]), 0);
  }, [actualsColumn, datasetType, fyColumn, visibleRows]);
  const totalMonthToDate = useMemo(
    () => {
      if (datasetType === "global_revenue" && actualsColumn) {
        const currentMonthToken = normalizeMonthToken(currentMonthLabel);
        return visibleRows.reduce(
          (sum, row) =>
            normalizeMonthToken(row["Month"]) === currentMonthToken
              ? sum + toNumber(row[actualsColumn])
              : sum,
          0,
        );
      }
      return visibleRows.reduce((sum, row) => sum + toNumber(row[currentMonthLabel]), 0);
    },
    [actualsColumn, currentMonthLabel, datasetType, visibleRows],
  );
  const totalYearToDate = useMemo(
    () => {
      if (datasetType === "global_revenue" && actualsColumn) {
        const ytdMonths = new Set(ytdMonthLabels.map((month) => normalizeMonthToken(month)));
        return visibleRows.reduce(
          (sum, row) =>
            ytdMonths.has(normalizeMonthToken(row["Month"]))
              ? sum + toNumber(row[actualsColumn])
              : sum,
          0,
        );
      }
      return visibleRows.reduce(
        (sum, row) =>
          sum + ytdMonthLabels.reduce((monthSum, month) => monthSum + toNumber(row[month]), 0),
        0,
      );
    },
    [actualsColumn, datasetType, visibleRows, ytdMonthLabels],
  );
  const fiscalYearLabel = getFiscalYearEndLabel(query.data?.financialYear ?? financialYear);
  const virtualStartIndex = useMemo(() => {
    if (visibleRows.length === 0) {
      return 0;
    }
    return Math.max(Math.floor(tableScrollTop / VIRTUAL_ROW_HEIGHT) - VIRTUAL_OVERSCAN, 0);
  }, [tableScrollTop, visibleRows.length]);
  const virtualVisibleCount = useMemo(
    () => Math.max(Math.ceil(tableViewportHeight / VIRTUAL_ROW_HEIGHT) + VIRTUAL_OVERSCAN * 2, 60),
    [tableViewportHeight],
  );
  const virtualEndIndex = useMemo(
    () => Math.min(virtualStartIndex + virtualVisibleCount, visibleRows.length),
    [virtualStartIndex, virtualVisibleCount, visibleRows.length],
  );
  const virtualRows = useMemo(
    () => visibleRows.slice(virtualStartIndex, virtualEndIndex),
    [virtualEndIndex, virtualStartIndex, visibleRows],
  );
  const topSpacerHeight = virtualStartIndex * VIRTUAL_ROW_HEIGHT;
  const bottomSpacerHeight = Math.max((visibleRows.length - virtualEndIndex) * VIRTUAL_ROW_HEIGHT, 0);

  useEffect(() => {
    const updateViewportHeight = () => {
      if (!tableScrollRef.current) {
        return;
      }
      setTableViewportHeight(tableScrollRef.current.clientHeight || 560);
    };

    updateViewportHeight();
    window.addEventListener("resize", updateViewportHeight);
    return () => window.removeEventListener("resize", updateViewportHeight);
  }, [query.data, visibleRows.length]);

  return (
    <section className="surface-card px-5 py-5 lg:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Uploaded Masterdata
          </p>
          <h3 className="mt-1 text-2xl font-semibold text-slate-950">
            Source-aligned data view
          </h3>
        </div>
      </div>

      {query.data?.activeUpload ? (
        <div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-3 text-sm text-slate-700">
          <p className="font-semibold text-slate-950">Active source file</p>
          <p className="mt-1 break-all">{query.data.activeUpload.originalFilename}</p>
          <p className="mt-2 text-xs text-slate-500">
            {[
              query.data.activeUpload.uploadMonth,
              query.data.activeUpload.financialYear,
              `${formatNumber(query.data.activeUpload.importedRows, 0)} imported rows`,
              query.data.activeUpload.uploadedAt
                ? new Date(query.data.activeUpload.uploadedAt).toLocaleString()
                : "",
            ]
              .filter(Boolean)
              .join(" | ")}
          </p>
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.15em] text-slate-500 lg:col-span-1">
          Search
          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2">
            <Search className="h-3.5 w-3.5 text-slate-400" />
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search uploaded rows"
              className="w-full bg-transparent text-sm font-normal text-slate-700 outline-none placeholder:text-slate-400"
            />
          </div>
        </label>

        <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
          Dataset
          <select
            className="auth-input min-w-[170px]"
            value={datasetType}
            onChange={(event) => {
              const nextDatasetType = event.target.value as DatasetType;
              const nextDatasetYears = resolveDatasetYears(
                nextDatasetType,
                financialYears,
                datasetFinancialYears,
              );
              setDatasetType(nextDatasetType);
              setSelectedFinancialYear(nextDatasetYears.at(-1) ?? selectedFinancialYear);
              setSearchText("");
              setColumnFilters({});
              scrollTableToTop();
            }}
          >
            {DATASET_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
          Financial Year
          <select
            className="auth-input min-w-[150px]"
            value={financialYear}
            onChange={(event) => {
              setSelectedFinancialYear(event.target.value);
              scrollTableToTop();
            }}
          >
            {datasetYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">FY {fiscalYearLabel} $</p>
          <p className="mt-1 text-xl font-semibold text-slate-950">{formatMoneyValue(totalFy)}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Month To Date $</p>
          <p className="mt-1 text-xl font-semibold text-slate-950">{formatMoneyValue(totalMonthToDate)}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Year To Date $</p>
          <p className="mt-1 text-xl font-semibold text-slate-950">{formatMoneyValue(totalYearToDate)}</p>
        </article>
      </div>

      <TableFullscreenShell
        title="Uploaded Masterdata"
        description="Open the current uploaded dataset in a full-page table view."
        className="mt-5 rounded-2xl border border-slate-200"
      >
        <div
          ref={tableScrollRef}
          onScroll={(event) => setTableScrollTop(event.currentTarget.scrollTop)}
          className="table-freeze-shell rounded-2xl border border-slate-200"
        >
        {query.isLoading ? (
          <div className="flex min-h-48 items-center justify-center text-slate-500">
            <LoaderCircle className="mr-2 h-5 w-5 animate-spin" />
            Loading uploaded rows...
          </div>
        ) : query.isError ? (
          <div className="px-5 py-8 text-center text-sm text-rose-700">
            Unable to load uploaded rows.
          </div>
        ) : (
          <table className="min-w-[2200px] border-collapse text-sm text-slate-700">
            <thead className="sticky top-0 z-10 bg-slate-950 text-white">
              <tr>
                {displayColumns.map((column) => (
                  <th
                    key={column}
                    className="border-b border-white/10 px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em]"
                  >
                    {formatColumnLabel(
                      column,
                      query.data?.columnKinds[column] ?? "text",
                      query.data?.financialYear ?? financialYear,
                      fyColumn,
                    )}
                  </th>
                ))}
              </tr>
              <tr>
                {displayColumns.map((column) => (
                  <th
                    key={`${column}-filter`}
                    className="border-b border-white/10 bg-slate-900 px-3 py-2"
                  >
                    <select
                      value={columnFilters[column] ?? ""}
                      onChange={(event) =>
                        setColumnFilters((current) => ({
                          ...current,
                          [column]: event.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs font-medium text-white outline-none"
                    >
                      <option value="">All</option>
                      {(columnFilterOptions[column] ?? []).map((value) => (
                        <option key={`${column}-${value}`} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={displayColumns.length || 1}
                    className="px-4 py-8 text-center text-sm text-slate-500"
                  >
                    0 rows found for the current selection.
                  </td>
                </tr>
              ) : (
                <>
                  <tr className="sticky z-[9] border-b border-slate-200 bg-slate-100/95" style={{ top: "78px" }}>
                    {displayColumns.map((column) => {
                      const kind = query.data?.columnKinds[column] ?? "text";
                      return (
                        <td key={`total-${column}`} className="whitespace-nowrap px-3 py-2 text-sm font-semibold text-slate-900">
                          {kind === "numeric" ? formatCellValue(column, kind, columnTotals[column] ?? 0) : column === displayColumns[0] ? "Total" : ""}
                        </td>
                      );
                    })}
                  </tr>
                  {topSpacerHeight > 0 ? (
                    <tr aria-hidden="true">
                      <td
                        colSpan={displayColumns.length || 1}
                        className="p-0"
                        style={{ height: `${topSpacerHeight}px` }}
                      />
                    </tr>
                  ) : null}
                  {virtualRows.map((row, rowOffset) => {
                    const rowIndex = virtualStartIndex + rowOffset;
                    return (
                      <tr
                        key={`row-${rowIndex}`}
                        className={`border-b border-slate-100 ${rowIndex % 2 === 0 ? "bg-white" : "bg-[#f6f7f8]"}`}
                      >
                        {displayColumns.map((column) => (
                          <td
                            key={`${rowIndex}-${column}`}
                            className="h-11 whitespace-nowrap px-3 py-2 align-top"
                          >
                            {formatCellValue(
                              column,
                              query.data?.columnKinds[column] ?? "text",
                              row[column],
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                  {bottomSpacerHeight > 0 ? (
                    <tr aria-hidden="true">
                      <td
                        colSpan={displayColumns.length || 1}
                        className="p-0"
                        style={{ height: `${bottomSpacerHeight}px` }}
                      />
                    </tr>
                  ) : null}
                </>
              )}
            </tbody>
          </table>
        )}
        </div>
      </TableFullscreenShell>
    </section>
  );
}
