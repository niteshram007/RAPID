"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, Download, LoaderCircle, Sparkles, Table2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import {
  Area,
  Bar,
  ComposedChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useDrillDown } from "@/hooks/useDrillDown";
import { normalizeDrillDownFilters } from "@/lib/drilldown";

type TrendSummaryRow = {
  month: string;
  quarter: string;
  budget: number;
  actual: number;
  variance: number;
  vertical: string;
  horizontal: string;
  region: string;
  msps: string;
};

type DimensionKey = "vertical" | "horizontal" | "region" | "msps";
type PeriodView = "monthly" | "quarter" | "ytd" | "mtd";

type DimensionRow = {
  label: string;
  budget: number;
  actual: number;
  variance: number;
};

type TrendSummaryFetchResult = {
  resolvedFinancialYear: string;
  rows: TrendSummaryRow[];
  budgetFallbackApplied: boolean;
  budgetSourceFinancialYear: string;
};

const MONTH_ORDER = [
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
  "Jan",
  "Feb",
  "Mar",
] as const;
const MONTH_INDEX: Record<string, number> = Object.fromEntries(
  MONTH_ORDER.map((month, index) => [month, index]),
) as Record<string, number>;
const CORPORATE_COLORS = {
  budget: "#0B3C5D",
  actual: "#13B0A5",
  variance: "#1E88E5",
};
const DIMENSIONS: Array<{ key: DimensionKey; title: string }> = [
  { key: "vertical", title: "FY by Vertical" },
  { key: "horizontal", title: "FY by Horizontal" },
  { key: "region", title: "FY by ROW/US" },
  { key: "msps", title: "FY by MS/PS Budget" },
];
const DEFAULT_TRENDS_FINANCIAL_YEAR = "2025-2026";

function toNumber(value: unknown) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function readNumberFromRow(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") {
      return toNumber(row[key]);
    }
  }
  return 0;
}

function toText(value: unknown) {
  return String(value ?? "").trim();
}

function resolveFinancialYearFromSearch(searchParams: URLSearchParams) {
  const direct = toText(searchParams.get("financialYear"));
  if (direct) {
    return direct;
  }
  const fromList = toText(searchParams.getAll("financialYears")[0]);
  return fromList;
}

function normalizeTrendRow(raw: unknown): TrendSummaryRow | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const row = raw as Record<string, unknown>;
  const month = monthKey(
    toText(row.month ?? row.Month ?? row.monthLabel ?? row.periodMonth),
  );
  if (!month) {
    return null;
  }
  const quarter =
    toText(row.quarter ?? row.Quarter ?? row.periodQuarter) || quarterFromMonth(month);
  const budget = readNumberFromRow(row, [
    "budget",
    "budgetAmount",
    "budget_amount",
    "budgetValue",
    "plannedBudget",
    "planned_budget",
    "plan",
  ]);
  const actual = readNumberFromRow(row, [
    "actual",
    "actualRevenue",
    "actual_revenue",
    "actualValue",
  ]);
  const variance = actual - budget;
  return {
    month,
    quarter,
    budget,
    actual,
    variance,
    vertical: toText(row.vertical ?? row.Vertical) || "Unassigned",
    horizontal: toText(row.horizontal ?? row.Horizontal) || "Unassigned",
    region: toText(row.region ?? row.Region) || "Unassigned",
    msps: toText(row.msps ?? row.ms_ps ?? row["MS/PS"]) || "Unassigned",
  };
}

function readChartPayload(state: unknown) {
  if (!state || typeof state !== "object" || !("payload" in state)) {
    return {} as Record<string, unknown>;
  }
  const payload = (state as { payload?: unknown }).payload;
  return payload && typeof payload === "object"
    ? (payload as Record<string, unknown>)
    : ({} as Record<string, unknown>);
}

function monthKey(value: string) {
  const shortMonth = toText(value).slice(0, 3);
  return MONTH_INDEX[shortMonth] === undefined ? "" : shortMonth;
}

function monthIndex(value: string) {
  const key = monthKey(value);
  return key ? MONTH_INDEX[key] : -1;
}

function quarterFromMonth(month: string) {
  const index = monthIndex(month);
  if (index < 0) {
    return "Q1";
  }
  if (index <= 2) {
    return "Q1";
  }
  if (index <= 5) {
    return "Q2";
  }
  if (index <= 8) {
    return "Q3";
  }
  return "Q4";
}

function normalizeTrendDimensionLabel(key: DimensionKey, value: string) {
  const text = toText(value).replace(/\s+/g, " ");
  if (!text) {
    return "Unassigned";
  }
  const upperText = text.toUpperCase();
  if (key === "msps") {
    if (upperText === "MS" || upperText === "MS/PS") {
      return "MS";
    }
    if (upperText === "PS" || upperText === "PS/MS") {
      return "PS";
    }
    return upperText;
  }
  if (key === "region") {
    if (["US", "USA", "USN", "USW", "USE", "USS", "UNITED STATES"].includes(upperText)) {
      return "US";
    }
    if (["ROW", "REST OF WORLD", "REST-OF-WORLD"].includes(upperText)) {
      return "ROW";
    }
  }
  if (key === "vertical" || key === "horizontal") {
    return text
      .split(/(\s+|\/|-)/)
      .map((part) => {
        if (!part || /^\s+$/.test(part) || part === "/" || part === "-") {
          return part;
        }
        if (/^[A-Z]{2,4}$/.test(part)) {
          return part;
        }
        return `${part.slice(0, 1).toUpperCase()}${part.slice(1).toLowerCase()}`;
      })
      .join("");
  }
  return text;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCompactCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function sanitizeExportCell(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }
  const text = value.trim();
  if (text && ["=", "+", "@", "\t", "\r"].includes(text[0])) {
    return `'${value}`;
  }
  if (text.startsWith("-") && text.length > 1 && !/\d/.test(text[1] ?? "")) {
    return `'${value}`;
  }
  return value;
}

function escapeCsvCell(value: unknown) {
  const text = String(sanitizeExportCell(value) ?? "");
  if (text.includes('"') || text.includes(",") || text.includes("\n") || text.includes("\r")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function downloadBlob(filename: string, content: BlobPart, contentType: string) {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function exportDimensionRows(options: {
  title: string;
  financialYear: string;
  actualLabel: string;
  rows: DimensionRow[];
  format: "csv" | "xlsx";
}) {
  const { title, financialYear, actualLabel, rows, format } = options;
  const headers = [
    "Label",
    `Budget FY ${financialYear || "Latest"}`,
    actualLabel,
    "Variance (Actuals - Budget)",
  ];
  const exportRows = rows.map((row) => ({
    Label: row.label,
    [headers[1]]: row.budget,
    [headers[2]]: row.actual,
    [headers[3]]: row.variance,
  }));
  const safeTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  if (format === "csv") {
    const csvRows = [
      headers.map((header) => escapeCsvCell(header)).join(","),
      ...exportRows.map((row) =>
        headers.map((header) => escapeCsvCell(row[header as keyof typeof row])).join(","),
      ),
    ];
    downloadBlob(`${safeTitle}.csv`, csvRows.join("\n"), "text/csv; charset=utf-8");
    return;
  }
  const XLSX = await import("xlsx");
  const worksheet = XLSX.utils.aoa_to_sheet([
    headers.map((header) => sanitizeExportCell(header)),
    ...exportRows.map((row) =>
      headers.map((header) => sanitizeExportCell(row[header as keyof typeof row])),
    ),
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Table");
  const output = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  downloadBlob(
    `${safeTitle}.xlsx`,
    output,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
}

function resolveInitialPeriod(searchParams: URLSearchParams): PeriodView {
  const timeframe = toText(searchParams.get("dashboardTimeframe")).toLowerCase();
  if (timeframe === "mtd") {
    return "mtd";
  }
  if (timeframe === "quarter") {
    return "quarter";
  }
  if (timeframe === "ytd" || timeframe === "annual" || timeframe === "fy") {
    return "ytd";
  }
  return "monthly";
}

function resolveInitialMonth(searchParams: URLSearchParams, fallbackMonth: string) {
  const monthFromSearch = monthKey(
    toText(searchParams.get("dashboardMonth")) ||
      toText(searchParams.get("periodTo")),
  );
  return monthFromSearch || fallbackMonth;
}

function resolveInitialQuarter(searchParams: URLSearchParams, fallbackMonth: string) {
  const searchQuarter = toText(searchParams.get("dashboardQuarter")).toUpperCase();
  if (searchQuarter === "Q1" || searchQuarter === "Q2" || searchQuarter === "Q3" || searchQuarter === "Q4") {
    return searchQuarter;
  }
  return quarterFromMonth(fallbackMonth);
}

function includeRowForPeriod(
  row: TrendSummaryRow,
  period: PeriodView,
  selectedMonth: string,
  selectedQuarter: string,
  latestMonth: string,
) {
  const rowMonthIndex = monthIndex(row.month);
  if (rowMonthIndex < 0) {
    return false;
  }
  const selectedIndex = monthIndex(selectedMonth);
  const latestIndex = monthIndex(latestMonth);
  if (period === "mtd") {
    return rowMonthIndex === latestIndex;
  }
  if (period === "monthly") {
    return rowMonthIndex === selectedIndex;
  }
  if (period === "quarter") {
    const quarter = toText(row.quarter).toUpperCase() || quarterFromMonth(row.month);
    return quarter === selectedQuarter;
  }
  return rowMonthIndex <= selectedIndex;
}

function buildDimensionRows(
  budgetRows: TrendSummaryRow[],
  actualRows: TrendSummaryRow[],
  key: DimensionKey,
  period: PeriodView,
  selectedMonth: string,
  selectedQuarter: string,
  latestMonth: string,
) {
  const budgetTotals = new Map<string, number>();
  for (const row of budgetRows) {
    if (!includeRowForPeriod(row, period, selectedMonth, selectedQuarter, latestMonth)) {
      continue;
    }
    const label = normalizeTrendDimensionLabel(key, toText(row[key]));
    budgetTotals.set(label, (budgetTotals.get(label) ?? 0) + toNumber(row.budget));
  }
  const actualTotals = new Map<string, number>();
  for (const row of actualRows) {
    if (!includeRowForPeriod(row, period, selectedMonth, selectedQuarter, latestMonth)) {
      continue;
    }
    const label = normalizeTrendDimensionLabel(key, toText(row[key]));
    actualTotals.set(label, (actualTotals.get(label) ?? 0) + toNumber(row.actual));
  }
  const labels = new Set([...budgetTotals.keys(), ...actualTotals.keys()]);
  const sorted = Array.from(labels, (label) => {
    const budget = budgetTotals.get(label) ?? 0;
    const actual = actualTotals.get(label) ?? 0;
    return {
      label,
      budget,
      actual,
      variance: actual - budget,
    };
  }).sort((left, right) => right.actual - left.actual);
  const grandTotal = sorted.reduce(
    (accumulator, row) => {
      accumulator.budget += row.budget;
      accumulator.actual += row.actual;
      accumulator.variance += row.variance;
      return accumulator;
    },
    { label: "Grand Total", budget: 0, actual: 0, variance: 0 },
  );
  return {
    rows: sorted,
    tableRows: [...sorted, grandTotal],
  };
}

function describePeriod(period: PeriodView, month: string, quarter: string) {
  if (period === "mtd") {
    return `MTD view (${month})`;
  }
  if (period === "quarter") {
    return `Quarter view (${quarter})`;
  }
  if (period === "ytd") {
    return `YTD view (Apr-${month})`;
  }
  return `Monthly view (${month})`;
}

function DimensionSection({
  dimensionKey,
  title,
  rows,
  tableRows,
  chartMode,
  period,
  selectedMonth,
  selectedQuarter,
  latestMonth,
  financialYear,
  actualLabel,
  globalFilters,
  onOpenDetails,
  onChartModeChange,
  onExport,
}: {
  dimensionKey: DimensionKey;
  title: string;
  rows: DimensionRow[];
  tableRows: DimensionRow[];
  chartMode: "graph" | "table";
  period: PeriodView;
  selectedMonth: string;
  selectedQuarter: string;
  latestMonth: string;
  financialYear: string;
  actualLabel: string;
  globalFilters: Record<string, unknown>;
  onOpenDetails: (options: {
    dimensionKey: DimensionKey;
    label: string;
    metric: "budget" | "actual" | "variance";
    value: number;
    title: string;
    period: PeriodView;
    selectedMonth: string;
    selectedQuarter: string;
    latestMonth: string;
    financialYear: string;
    globalFilters: Record<string, unknown>;
  }) => void;
  onChartModeChange: (value: "graph" | "table") => void;
  onExport: (format: "csv" | "xlsx") => void;
}) {
  const tooltipProps = {
    formatter: (value: unknown) => formatCurrency(toNumber(value)),
    offset: 24,
    allowEscapeViewBox: { x: true, y: true },
    cursor: { fill: "rgba(15,23,42,0.06)" },
    wrapperStyle: { pointerEvents: "none" as const, zIndex: 40 },
    contentStyle: {
      borderRadius: "10px",
      border: "1px solid rgba(148,163,184,0.42)",
      boxShadow: "0 12px 30px rgba(15,23,42,0.14)",
    },
  };
  return (
    <article className="overflow-hidden rounded-[20px] border border-white/75 bg-[linear-gradient(165deg,rgba(255,255,255,0.84),rgba(239,246,255,0.72),rgba(236,253,245,0.64))] p-4 shadow-[0_18px_46px_rgba(15,23,42,0.1)] backdrop-blur-2xl">
      <div className="mb-3 flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-950">{title}</h2>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-white"
              title="Analytical insight assistant is unavailable."
            >
              <Sparkles className="h-3.5 w-3.5" />
              Analytical
            </button>
            <button
              type="button"
              onClick={() => onChartModeChange("table")}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                chartMode === "table" ? "bg-slate-950 text-white" : "text-slate-600"
              }`}
            >
              <Table2 className="h-3.5 w-3.5" />
              Table
            </button>
            <button
              type="button"
              onClick={() => onChartModeChange("graph")}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                chartMode === "graph" ? "bg-slate-950 text-white" : "text-slate-600"
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Graph
            </button>
          </div>
          <button
            type="button"
            onClick={() => onExport("xlsx")}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
            aria-label={`Export ${title}`}
            title="Export XLSX"
          >
            <Download className="h-4 w-4" />
          </button>
        </div>
      </div>

      {chartMode === "graph" ? (
        <div className="h-[310px] rounded-xl border border-white/80 bg-[linear-gradient(155deg,rgba(255,255,255,0.68),rgba(236,253,245,0.44),rgba(239,246,255,0.52))] px-2 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.58),0_10px_24px_rgba(15,23,42,0.08)] backdrop-blur-2xl">
          {rows.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm font-semibold text-slate-500">
              No data available for this period
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rows.slice(0, 12)} margin={{ top: 8, right: 12, left: 0, bottom: 42 }}>
                <defs>
                  <linearGradient id={`${dimensionKey}-actual-gradient`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CORPORATE_COLORS.actual} stopOpacity={0.36} />
                    <stop offset="72%" stopColor={CORPORATE_COLORS.actual} stopOpacity={0.13} />
                    <stop offset="100%" stopColor={CORPORATE_COLORS.actual} stopOpacity={0.04} />
                  </linearGradient>
                  <linearGradient id={`${dimensionKey}-budget-gradient`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CORPORATE_COLORS.budget} stopOpacity={0.9} />
                    <stop offset="100%" stopColor={CORPORATE_COLORS.budget} stopOpacity={0.6} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#d7dfec" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10 }}
                  angle={-22}
                  textAnchor="end"
                  interval={0}
                  height={44}
                />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(value) => formatCompactCurrency(toNumber(value))} width={72} />
                <Tooltip {...tooltipProps} />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                <Area
                  dataKey="actual"
                  name="Actuals"
                  type="monotone"
                  stroke={CORPORATE_COLORS.actual}
                  strokeWidth={2}
                  fill={`url(#${dimensionKey}-actual-gradient)`}
                  onClick={(state: unknown) => {
                    const payload = readChartPayload(state);
                    const label = toText(payload.label);
                    if (!label) {
                      return;
                    }
                    onOpenDetails({
                      dimensionKey,
                      label,
                      metric: "actual",
                      value: toNumber(payload.actual),
                      title,
                      period,
                      selectedMonth,
                      selectedQuarter,
                      latestMonth,
                      financialYear,
                      globalFilters,
                    });
                  }}
                />
                <Bar
                  dataKey="budget"
                  name="Budget"
                  fill={`url(#${dimensionKey}-budget-gradient)`}
                  fillOpacity={0.9}
                  radius={[5, 5, 0, 0]}
                  onClick={(state: unknown) => {
                    const payload = readChartPayload(state);
                    const label = toText(payload.label);
                    if (!label) {
                      return;
                    }
                    onOpenDetails({
                      dimensionKey,
                      label,
                      metric: "budget",
                      value: toNumber(payload.budget),
                      title,
                      period,
                      selectedMonth,
                      selectedQuarter,
                      latestMonth,
                      financialYear,
                      globalFilters,
                    });
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="variance"
                  name="Variance"
                  stroke={CORPORATE_COLORS.variance}
                  strokeWidth={2.2}
                  strokeDasharray="4 4"
                  dot={false}
                  onClick={(state: unknown) => {
                    const payload = readChartPayload(state);
                    const label = toText(payload.label);
                    if (!label) {
                      return;
                    }
                    onOpenDetails({
                      dimensionKey,
                      label,
                      metric: "variance",
                      value: toNumber(payload.variance),
                      title,
                      period,
                      selectedMonth,
                      selectedQuarter,
                      latestMonth,
                      financialYear,
                      globalFilters,
                    });
                  }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      ) : (
        <div className="table-freeze-shell rounded-xl border border-slate-200">
          <table className="min-w-full text-left text-xs text-slate-700">
            <thead className="sticky top-0 z-10 bg-slate-950 text-white">
              <tr>
                <th
                  colSpan={5}
                  className="border-b border-white/15 bg-slate-900/95 px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-200"
                >
                  <div className="space-y-1">
                    <p>{describePeriod(period, selectedMonth, selectedQuarter)}</p>
                    <p className="normal-case tracking-normal text-slate-200/90">
                      Budget FY {financialYear || "Latest"} vs {actualLabel} | Through {latestMonth}
                    </p>
                  </div>
                </th>
              </tr>
              <tr>
                <th className="px-3 py-2.5 font-semibold uppercase tracking-[0.14em]">No</th>
                <th className="px-3 py-2.5 font-semibold uppercase tracking-[0.14em]">Label</th>
                <th className="px-3 py-2.5 text-right font-semibold uppercase tracking-[0.14em]">Budget (Plan)</th>
                <th className="px-3 py-2.5 text-right font-semibold uppercase tracking-[0.14em]">{actualLabel}</th>
                <th className="px-3 py-2.5 text-right font-semibold uppercase tracking-[0.14em]">Variance (Actuals - Budget)</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row, index) => {
                const grandTotal = row.label.toLowerCase() === "grand total";
                return (
                  <tr
                    key={`${row.label}-${index}`}
                    className={`border-b border-slate-100 last:border-b-0 ${
                      grandTotal ? "bg-slate-100 font-semibold" : index % 2 === 0 ? "bg-white" : "bg-slate-50/70"
                    }`}
                  >
                    <td className="px-3 py-2.5 font-semibold text-slate-900">{index + 1}</td>
                    <td className="px-3 py-2.5 text-slate-900">{row.label}</td>
                    <td
                      className={`px-3 py-2.5 text-right tabular-nums ${
                        grandTotal ? "" : "cursor-pointer"
                      }`}
                      onClick={() => {
                        if (grandTotal) {
                          return;
                        }
                        onOpenDetails({
                          dimensionKey,
                          label: row.label,
                          metric: "budget",
                          value: row.budget,
                          title,
                          period,
                          selectedMonth,
                          selectedQuarter,
                          latestMonth,
                          financialYear,
                          globalFilters,
                        });
                      }}
                    >
                      {formatCurrency(row.budget)}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right tabular-nums ${
                        grandTotal ? "" : "cursor-pointer"
                      }`}
                      onClick={() => {
                        if (grandTotal) {
                          return;
                        }
                        onOpenDetails({
                          dimensionKey,
                          label: row.label,
                          metric: "actual",
                          value: row.actual,
                          title,
                          period,
                          selectedMonth,
                          selectedQuarter,
                          latestMonth,
                          financialYear,
                          globalFilters,
                        });
                      }}
                    >
                      {formatCurrency(row.actual)}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right tabular-nums ${
                        grandTotal ? "" : "cursor-pointer"
                      }`}
                      onClick={() => {
                        if (grandTotal) {
                          return;
                        }
                        onOpenDetails({
                          dimensionKey,
                          label: row.label,
                          metric: "variance",
                          value: row.variance,
                          title,
                          period,
                          selectedMonth,
                          selectedQuarter,
                          latestMonth,
                          financialYear,
                          globalFilters,
                        });
                      }}
                    >
                      {formatCurrency(row.variance)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}

export function TrendsComparisonDashboard() {
  const searchParams = useSearchParams();
  const { openDrillDown } = useDrillDown();
  const [budgetRows, setBudgetRows] = useState<TrendSummaryRow[]>([]);
  const [actualRows, setActualRows] = useState<TrendSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolvedFinancialYear, setResolvedFinancialYear] = useState("");
  const [budgetSourceFinancialYear, setBudgetSourceFinancialYear] = useState("");
  const [budgetFallbackApplied, setBudgetFallbackApplied] = useState(false);
  const [viewByDimension, setViewByDimension] = useState<Record<DimensionKey, "graph" | "table">>({
    vertical: "graph",
    horizontal: "graph",
    region: "graph",
    msps: "graph",
  });

  const requestedFinancialYear = useMemo(
    () => resolveFinancialYearFromSearch(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );
  const financialYear = requestedFinancialYear || DEFAULT_TRENDS_FINANCIAL_YEAR;
  const effectiveFinancialYear = financialYear || resolvedFinancialYear;
  const actualLabel = effectiveFinancialYear
    ? `Actuals FY ${effectiveFinancialYear}`
    : "Actuals";
  const globalFilters = useMemo(() => {
    const mapping: Record<string, string> = {
      practices: "practice_head",
      practiceHeads: "practice_head",
      geoHeads: "geo_head",
      bdms: "bdm",
      verticals: "vertical",
      horizontals: "horizontal",
      regions: "region",
      rowUs: "row_us",
      entities: "entity",
      accounts: "customer_name",
      customerNames: "customer_name",
      projectNames: "project_name",
      dealTypes: "deal_type",
      msps: "ms_ps",
      strategicAccounts: "strategic_account",
      salesRegions: "sales_region",
    };
    const resolved: Record<string, unknown> = {};
    for (const [queryKey, filterKey] of Object.entries(mapping)) {
      const values = searchParams.getAll(queryKey).map((value) => value.trim()).filter(Boolean);
      if (values.length === 1) {
        resolved[filterKey] = values[0];
      } else if (values.length > 1) {
        resolved[filterKey] = values;
      }
    }
    return resolved;
  }, [searchParams]);

  useEffect(() => {
    const controller = new AbortController();
    async function fetchSummaryRows(targetFinancialYear: string): Promise<TrendSummaryFetchResult> {
      const query = new URLSearchParams(searchParams.toString());
      if (targetFinancialYear) {
        query.set("financialYear", targetFinancialYear);
      } else {
        query.delete("financialYear");
      }
      query.set("periodFrom", "Apr");
      query.set("periodTo", "Mar");
      const response = await fetch(`/api/trends/summary?${query.toString()}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const body = (await response.json().catch(() => null)) as
        | {
            rows?: unknown[];
            detail?: string;
            resolvedFinancialYear?: string | null;
            budgetFallbackApplied?: boolean;
            budgetSourceFinancialYear?: string | null;
          }
        | null;
      if (!response.ok || !body) {
        throw new Error(body?.detail || "Unable to load trends summary.");
      }
      return {
        resolvedFinancialYear: toText(body.resolvedFinancialYear) || targetFinancialYear,
        rows: Array.isArray(body.rows)
          ? body.rows
              .map((row) => normalizeTrendRow(row))
              .filter((row): row is TrendSummaryRow => Boolean(row))
          : [],
        budgetFallbackApplied: Boolean(body.budgetFallbackApplied),
        budgetSourceFinancialYear:
          toText(body.budgetSourceFinancialYear) || toText(body.resolvedFinancialYear) || targetFinancialYear,
      };
    }

    async function loadSummary() {
      setLoading(true);
      setError(null);
      try {
        const summary = await fetchSummaryRows(financialYear);
        setResolvedFinancialYear(summary.resolvedFinancialYear);
        setBudgetFallbackApplied(summary.budgetFallbackApplied);
        setBudgetSourceFinancialYear(summary.budgetSourceFinancialYear);
        setBudgetRows(summary.rows);
        setActualRows(summary.rows);
      } catch (loadError) {
        if (controller.signal.aborted) {
          return;
        }
        setBudgetRows([]);
        setActualRows([]);
        setBudgetFallbackApplied(false);
        setBudgetSourceFinancialYear("");
        setError(
          loadError instanceof Error ? loadError.message : "Unable to load trends summary.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadSummary();
    return () => controller.abort();
  }, [financialYear, searchParams]);

  const availableMonths = useMemo(() => {
    const values = Array.from(
      new Set(
        [...budgetRows, ...actualRows]
          .map((row) => monthKey(row.month))
          .filter((value): value is string => Boolean(value)),
      ),
    ).sort((left, right) => MONTH_INDEX[left] - MONTH_INDEX[right]);
    return values.length > 0 ? values : [...MONTH_ORDER];
  }, [actualRows, budgetRows]);

  const latestMonth = availableMonths.at(-1) ?? "Mar";
  const period = useMemo(() => resolveInitialPeriod(searchParams), [searchParams]);
  const selectedMonth = useMemo(() => {
    const initial = resolveInitialMonth(searchParams, latestMonth);
    return availableMonths.includes(initial) ? initial : latestMonth;
  }, [availableMonths, latestMonth, searchParams]);
  const selectedQuarter = useMemo(
    () => resolveInitialQuarter(searchParams, selectedMonth),
    [searchParams, selectedMonth],
  );

  const sections = useMemo(() => {
    return DIMENSIONS.map((dimension) => {
      const { rows: dimensionRows, tableRows } = buildDimensionRows(
        budgetRows,
        actualRows,
        dimension.key,
        period,
        selectedMonth,
        selectedQuarter,
        latestMonth,
      );
      return {
        ...dimension,
        rows: dimensionRows,
        tableRows,
      };
    });
  }, [actualRows, budgetRows, latestMonth, period, selectedMonth, selectedQuarter]);

  function openTrendDrillDown(options: {
    dimensionKey: DimensionKey;
    label: string;
    metric: "budget" | "actual" | "variance";
    value: number;
    title: string;
    period: PeriodView;
    selectedMonth: string;
    selectedQuarter: string;
    latestMonth: string;
    financialYear: string;
    globalFilters: Record<string, unknown>;
  }) {
    const filterKeyByDimension: Record<DimensionKey, string> = {
      vertical: "vertical",
      horizontal: "horizontal",
      region: "region",
      msps: "ms_ps",
    };
    const normalizedLabel = toText(options.label);
    if (!normalizedLabel) {
      return;
    }
    const periodFilters: Record<string, unknown> = {};
    if (options.period === "mtd") {
      periodFilters.month = options.latestMonth;
    } else if (options.period === "monthly") {
      periodFilters.month = options.selectedMonth;
    } else if (options.period === "quarter") {
      periodFilters.quarter = options.selectedQuarter;
    } else {
      const endIndex = MONTH_INDEX[options.selectedMonth] ?? MONTH_INDEX.Mar;
      periodFilters.month = MONTH_ORDER.slice(0, endIndex + 1);
    }
    const normalizedFilters = normalizeDrillDownFilters({
      ...options.globalFilters,
      [filterKeyByDimension[options.dimensionKey]]: normalizedLabel,
      ...periodFilters,
    });
    const includeMonthColumn =
      options.period === "mtd" || options.period === "monthly";
    const drillDownColumns = includeMonthColumn
      ? [
          "month",
          "customer_dimension",
          "group_company",
          "customer_name",
          "project_name",
          "ms_ps",
          "region",
          "budget",
          "forecast",
          "actual",
          "variance",
        ]
      : [
          "customer_dimension",
          "group_company",
          "customer_name",
          "project_name",
          "ms_ps",
          "region",
          "budget",
          "forecast",
          "actual",
          "variance",
        ];
    const drillDownFinancialYear =
      options.financialYear;
    const drillDownMetric = options.metric === "budget" ? "budget" : "actual";
    openDrillDown({
      source: "kiosk_unified",
      metric: drillDownMetric,
      value: options.value,
      fiscalYear: drillDownFinancialYear,
      filters: normalizedFilters,
      aggregation: {
        type: "sum",
        field: drillDownMetric,
      },
      columns: drillDownColumns,
      displayTitle: `Underlying Records - ${options.title} / ${normalizedLabel} / ${drillDownMetric.toUpperCase()}`,
    });
  }

  if (loading) {
    return (
      <section className="rounded-[24px] border border-slate-200 bg-white px-6 py-8 shadow-[0_14px_34px_rgba(15,23,42,0.08)]">
        <div className="flex items-center gap-3 text-sm font-semibold text-slate-600">
          <LoaderCircle className="h-5 w-5 animate-spin" />
          Loading trends comparison...
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[24px] border border-slate-200 bg-white px-6 py-6 shadow-[0_14px_34px_rgba(15,23,42,0.08)]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0d5a8a]">
              Trends Comparison
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-950">
              Budget FY {effectiveFinancialYear || "Latest Available FY"}
              {effectiveFinancialYear ? ` vs Actuals FY ${effectiveFinancialYear}` : ""}
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Trends compares the same financial year's uploaded budget and actuals for like-for-like analysis.
            </p>
            {budgetFallbackApplied && budgetSourceFinancialYear ? (
              <p className="mt-2 text-xs font-semibold text-amber-700">
                Budget fallback applied from FY {budgetSourceFinancialYear} because selected scope had no budget rows.
              </p>
            ) : null}
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
            {describePeriod(period, selectedMonth, selectedQuarter)}
          </div>
        </div>
        {error ? (
          <div className="mt-4 rounded-[16px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}
      </section>

      {budgetRows.length === 0 && actualRows.length === 0 && !error ? (
        <section className="rounded-[22px] border border-dashed border-slate-200 bg-white px-6 py-10 text-center">
          <p className="text-sm font-semibold text-slate-700">
            No trend rows are available for {effectiveFinancialYear || "the selected scope"}.
          </p>
        </section>
      ) : null}

      {budgetRows.length > 0 || actualRows.length > 0 ? sections.map((section) => (
        <DimensionSection
          key={section.key}
          dimensionKey={section.key}
          title={section.title}
          rows={section.rows}
          tableRows={section.tableRows}
          chartMode={viewByDimension[section.key]}
          period={period}
          selectedMonth={selectedMonth}
          selectedQuarter={selectedQuarter}
          latestMonth={latestMonth}
          financialYear={effectiveFinancialYear}
          actualLabel={actualLabel}
          globalFilters={globalFilters}
          onOpenDetails={openTrendDrillDown}
          onExport={(format) =>
            void exportDimensionRows({
              title: section.title,
              financialYear: effectiveFinancialYear,
              actualLabel,
              rows: section.tableRows,
              format,
            })
          }
          onChartModeChange={(value) =>
            setViewByDimension((current) => ({
              ...current,
              [section.key]: value,
            }))
          }
        />
      )) : null}
    </div>
  );
}
