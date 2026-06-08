"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, LoaderCircle, Search, Table2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { TableFullscreenShell } from "@/components/table-fullscreen-shell";
import type { MisSheetPage, MisSheetSection } from "@/lib/mis-trends-workbook";
import {
  buildRapidRevenueSearch,
  readRapidRevenueFiltersFromSearch,
  type RevenueComparisonResponse,
} from "@/lib/rapid-revenue";
import { appendSharedWorkspaceSearch } from "@/lib/workspace-search";

export type MisTrendsKioskProps = {
  financialYear: string;
  sheets: MisSheetPage[];
  activeSheetId?: string;
  basePath?: string;
};

const DEFAULT_FINANCIAL_YEARS = ["2025-2026", "2024-2025"] as const;
const EXCLUDED_HEADERS = new Set(["MS", "PS", "MS/PS", "Share", "share"]);
const CHART_COLORS = ["#0f4c81", "#1f6aa8", "#2f85c9", "#3fa1de", "#5bb8ea", "#8ecff3"] as const;

type ChartPoint = {
  label: string;
  value: number;
};

type Highlight = {
  label: string;
  value: number;
};

const TIME_SERIES_TOKENS = [
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
  "jan",
  "feb",
  "mar",
  "q1",
  "q2",
  "q3",
  "q4",
] as const;

function toText(value: unknown) {
  return String(value ?? "").trim();
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const numeric = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(numeric) ? numeric : 0;
}

function isCurrencyLabel(label: string) {
  return /revenue|budget|forecast|variance|usd|fy|amount|invoice|bill rate|rate|margin|cost/i.test(label);
}

function isPercentLabel(label: string) {
  return /%|utilization/i.test(label);
}

function formatCell(value: string | number, header: string) {
  if (typeof value !== "number") {
    return value || "-";
  }
  if (value === 0) {
    return "NA";
  }
  if (isPercentLabel(header)) {
    return `${value.toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
  }
  if (isCurrencyLabel(header)) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  }
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

function formatCompactMetric(value: number, label: string) {
  if (value === 0) {
    return "NA";
  }
  if (isPercentLabel(label)) {
    return `${value.toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
  }
  if (isCurrencyLabel(label)) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  }
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function normalizeTextKey(value: string) {
  return toText(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function buildMonthActuals(payload: RevenueComparisonResponse) {
  const totals = new Map<string, number>();
  for (const row of payload.rows) {
    const month = toText(row.month).slice(0, 3);
    if (!month) {
      continue;
    }
    totals.set(month, (totals.get(month) ?? 0) + toNumber(row.actual));
  }
  return totals;
}

function resolveActualForLabel(label: string, payload: RevenueComparisonResponse) {
  const key = normalizeTextKey(label);
  if (!key) {
    return 0;
  }
  let total = 0;
  for (const row of payload.rows) {
    const candidates = [
      row.customerName,
      row.projectName,
      row.vertical,
      row.geography,
      row.dealType,
      row.bdm,
      row.practiceHead,
      row.geoHead,
      row.entity,
      row.businessType,
      row.msps,
    ];
    const matched = candidates.some((candidate) => {
      const candidateKey = normalizeTextKey(candidate);
      return (
        candidateKey === key ||
        (candidateKey.length > 2 && key.length > 2 && (candidateKey.includes(key) || key.includes(candidateKey)))
      );
    });
    if (matched) {
      total += toNumber(row.actual);
    }
  }
  return total;
}

function buildSheetHref(basePath: string, financialYear: string, sheetId: string) {
  const search = new URLSearchParams();
  search.set("financialYear", financialYear);
  const cleanBase = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
  return `${cleanBase}/${encodeURIComponent(sheetId)}?${search.toString()}`;
}

function isWorkbookForecastColumn(header: string) {
  const h = header.toLowerCase();
  return (
    /forecast|fcst|outlook|projection/.test(h) ||
    /2025\s*[-–/]\s*2026.*(forecast|fcst)/.test(h) ||
    /2026\s*[-–/]\s*2027.*(forecast|fcst)/.test(h)
  );
}

function buildDisplaySection(section: MisSheetSection, payload: RevenueComparisonResponse | null) {
  const labelKey = section.labelKey;
  const monthActuals = payload ? buildMonthActuals(payload) : new Map<string, number>();
  const numericHeaders = section.numericKeys.filter(
    (header) => section.headers.includes(header) && !EXCLUDED_HEADERS.has(header),
  );
  const hasMonthSeries = numericHeaders.some((header) => isTimeSeriesLabel(header));
  const headers = [
    labelKey,
    ...numericHeaders.filter((header) => header !== labelKey),
    ...(payload && !hasMonthSeries ? ["Actual"] : []),
  ].filter((header, index, items) => items.indexOf(header) === index);

  const dataRows = section.rows.filter((row) => {
    const label = toText(row[labelKey]).toLowerCase();
    return label && label !== "grand total" && label !== "total";
  });

  const rows = dataRows.map((row) => {
    const label = toText(row[labelKey]);
    const nextRow: Record<string, string | number> = { [labelKey]: label };
    for (const header of headers) {
      if (header === labelKey) {
        continue;
      }
      if (header === "Actual" && payload) {
        nextRow[header] = resolveActualForLabel(label, payload);
        continue;
      }
      if (isTimeSeriesLabel(header) && payload && !isWorkbookForecastColumn(header)) {
        nextRow[header] = monthActuals.get(header.slice(0, 3)) ?? 0;
        continue;
      }
      if (isWorkbookForecastColumn(header)) {
        nextRow[header] = row[header] ?? "";
        continue;
      }
      nextRow[header] = row[header] ?? "";
    }
    return nextRow;
  });

  const grandTotal: Record<string, string | number> = { [labelKey]: "Grand Total" };
  for (const header of headers) {
    if (header === labelKey) {
      continue;
    }
    if (header === "Actual" && payload) {
      grandTotal[header] = payload.summary.actual;
      continue;
    }
    if (isTimeSeriesLabel(header) && payload && !isWorkbookForecastColumn(header)) {
      grandTotal[header] = monthActuals.get(header.slice(0, 3)) ?? 0;
      continue;
    }
    if (isWorkbookForecastColumn(header)) {
      grandTotal[header] = rows.reduce((sum, row) => sum + toNumber(row[header]), 0);
      continue;
    }
    grandTotal[header] = rows.reduce((sum, row) => sum + toNumber(row[header]), 0);
  }

  return {
    labelKey,
    headers,
    rows: [...rows, grandTotal],
    hasMonthSeries,
  };
}

function pickGrandTotalRow(section: MisSheetSection) {
  return (
    section.rows.find((row) => {
      const label = toText(row[section.labelKey]).toLowerCase();
      return label === "grand total" || label === "total";
    }) ?? null
  );
}

function pickDataRows(section: MisSheetSection) {
  return section.rows.filter((row) => {
    const label = toText(row[section.labelKey]).toLowerCase();
    return Boolean(label) && label !== "grand total" && label !== "total";
  });
}

function isTimeSeriesLabel(label: string) {
  const normalized = label.toLowerCase();
  return TIME_SERIES_TOKENS.some((token) => normalized.includes(token));
}

function buildTimeSeries(section: MisSheetSection): ChartPoint[] {
  const timeKeys = section.numericKeys.filter((key) => isTimeSeriesLabel(key));
  if (timeKeys.length < 2) {
    return [];
  }

  const totalRow = pickGrandTotalRow(section);
  const dataRows = pickDataRows(section);
  const series = timeKeys.map((key) => ({
    label: key,
    value: totalRow
      ? toNumber(totalRow[key])
      : dataRows.reduce((sum, row) => sum + toNumber(row[key]), 0),
  }));

  return series.some((entry) => entry.value !== 0) ? series : [];
}

function pickPrimaryMetricKey(section: MisSheetSection) {
  const priorities = [/ytd/i, /total/i, /actual/i, /average/i, /margin/i, /utilization/i, /revenue/i];
  for (const matcher of priorities) {
    const match = section.numericKeys.find((key) => matcher.test(key));
    if (match) {
      return match;
    }
  }
  return section.numericKeys[section.numericKeys.length - 1] ?? "";
}

function buildCategorySeries(section: MisSheetSection): ChartPoint[] {
  const metricKey = pickPrimaryMetricKey(section);
  if (!metricKey) {
    return [];
  }

  const entries = pickDataRows(section)
    .map((row) => ({
      label: toText(row[section.labelKey]) || "Unassigned",
      value:
        section.numericKeys.length === 1
          ? toNumber(row[metricKey])
          : section.numericKeys.reduce((sum, key) => sum + toNumber(row[key]), 0),
    }))
    .filter((entry) => entry.value !== 0)
    .sort((left, right) => right.value - left.value)
    .slice(0, 8);

  return entries;
}

function buildHighlights(section: MisSheetSection): Highlight[] {
  const totalRow = pickGrandTotalRow(section);
  const preferredKeys = section.numericKeys.filter((key) =>
    /ytd|total|actual|budget|forecast|average|margin|utilization|revenue/i.test(key),
  );
  const chosenKeys = (preferredKeys.length > 0 ? preferredKeys : section.numericKeys).slice(0, 3);

  return chosenKeys.map((key) => ({
    label: key,
    value: totalRow
      ? toNumber(totalRow[key])
      : section.rows.reduce((sum, row) => sum + toNumber(row[key]), 0),
  }));
}

function countPopulatedNumericCells(section: MisSheetSection) {
  return section.rows.reduce(
    (total, row) =>
      total + section.numericKeys.reduce((sum, key) => sum + (toNumber(row[key]) !== 0 ? 1 : 0), 0),
    0,
  );
}

function SheetSectionCard({ section, index }: { section: MisSheetSection; index: number }) {
  const timeSeries = useMemo(() => buildTimeSeries(section), [section]);
  const categorySeries = useMemo(() => buildCategorySeries(section), [section]);
  const highlights = useMemo(() => buildHighlights(section), [section]);
  const populatedNumericCells = useMemo(() => countPopulatedNumericCells(section), [section]);
  const showTimeSeriesChart = timeSeries.length >= 3;
  const showCategoryChart = !showTimeSeriesChart && categorySeries.length >= 2;

  return (
    <article
      id={section.id}
      className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.08)]"
    >
      <div className="border-b border-slate-200 bg-[linear-gradient(135deg,#f8fbff_0%,#f2f6fb_45%,#fff8ef_100%)] px-5 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#1f4c88]">
              Section {index + 1}
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">{section.title}</h2>
            {section.subtitle ? (
              <p className="mt-2 text-sm leading-6 text-slate-600">{section.subtitle}</p>
            ) : null}
          </div>
          <div className="grid min-w-[220px] gap-3 sm:grid-cols-3">
            {(highlights.length > 0
              ? highlights
              : [
                  { label: "Rows", value: section.rows.length },
                  { label: "Numeric Columns", value: section.numericKeys.length },
                  { label: "Populated Points", value: populatedNumericCells },
                ]
            ).map((highlight) => (
              <div
                key={`${section.id}-${highlight.label}`}
                className="rounded-[18px] border border-white/70 bg-white/90 px-3 py-3 shadow-sm"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  {highlight.label}
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-950">
                  {formatCompactMetric(highlight.value, highlight.label)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 px-5 py-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
        <div className="rounded-[20px] border border-slate-200 bg-slate-950/95 p-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                Visual Summary
              </p>
              <h3 className="mt-1 text-base font-semibold text-white">
                {showTimeSeriesChart
                  ? "Period trend"
                  : showCategoryChart
                    ? `${pickPrimaryMetricKey(section)} by ${section.labelKey}`
                    : "Data preview"}
              </h3>
            </div>
            <p className="text-xs text-slate-300">Workbook-inspired chart</p>
          </div>
          <div className="mt-4 h-[260px]">
            {showTimeSeriesChart ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timeSeries} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                  <CartesianGrid stroke="rgba(148,163,184,0.2)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "#cbd5e1", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fill: "#cbd5e1", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={70}
                    tickFormatter={(value) => formatCompactMetric(Number(value), pickPrimaryMetricKey(section))}
                  />
                  <Tooltip
                    formatter={(value) => formatCell(Number(value), pickPrimaryMetricKey(section))}
                    labelStyle={{ color: "#0f172a" }}
                  />
                  <Line type="monotone" dataKey="value" stroke="#7dd3fc" strokeWidth={3} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : showCategoryChart ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categorySeries} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                  <CartesianGrid stroke="rgba(148,163,184,0.2)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "#cbd5e1", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                    angle={-16}
                    textAnchor="end"
                    height={64}
                  />
                  <YAxis
                    tick={{ fill: "#cbd5e1", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={70}
                    tickFormatter={(value) => formatCompactMetric(Number(value), pickPrimaryMetricKey(section))}
                  />
                  <Tooltip
                    formatter={(value) => formatCell(Number(value), pickPrimaryMetricKey(section))}
                    labelStyle={{ color: "#0f172a" }}
                  />
                  <Bar dataKey="value" fill="#38bdf8" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center rounded-[18px] border border-dashed border-slate-700 bg-slate-900/70 px-6 text-center text-sm text-slate-300">
                This workbook section is mostly structural in the source file, so the page keeps the table layout ready and surfaces values as the uploaded dataset fills in.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Section Snapshot
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <div className="rounded-[16px] border border-slate-200 bg-white px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Table Rows</p>
              <p className="mt-1 text-lg font-semibold text-slate-950">{section.rows.length.toLocaleString("en-US")}</p>
            </div>
            <div className="rounded-[16px] border border-slate-200 bg-white px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Numeric Columns</p>
              <p className="mt-1 text-lg font-semibold text-slate-950">
                {section.numericKeys.length.toLocaleString("en-US")}
              </p>
            </div>
            <div className="rounded-[16px] border border-slate-200 bg-white px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Populated Points</p>
              <p className="mt-1 text-lg font-semibold text-slate-950">
                {populatedNumericCells.toLocaleString("en-US")}
              </p>
            </div>
            <div className="rounded-[16px] border border-slate-200 bg-white px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Notes</p>
              <p className="mt-1 text-lg font-semibold text-slate-950">{section.notes.length.toLocaleString("en-US")}</p>
            </div>
          </div>
        </div>
      </div>

      {section.notes.length > 0 ? (
        <div className="border-t border-slate-200 bg-amber-50/70 px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700">Workbook Notes</p>
          <div className="mt-2 space-y-2 text-sm text-amber-950">
            {section.notes.map((note, noteIndex) => (
              <p key={`${section.id}-note-${noteIndex}`}>{note}</p>
            ))}
          </div>
        </div>
      ) : null}

      <div className="px-5 pb-5">
        <div className="overflow-auto rounded-[20px] border border-slate-200">
          <table className="min-w-full text-left text-xs text-slate-700">
            <thead className="sticky top-0 z-10 bg-slate-950 text-white">
              <tr>
                {section.headers.map((header) => (
                  <th
                    key={`${section.id}-${header}`}
                    className="border-b border-white/10 px-3 py-2.5 font-semibold uppercase tracking-[0.12em]"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {section.rows.map((row, rowIndex) => (
                <tr
                  key={`${section.id}-${rowIndex}`}
                  className={`border-b border-slate-100 last:border-b-0 ${
                    rowIndex % 2 === 0 ? "bg-white" : "bg-slate-50/70"
                  }`}
                >
                  {section.headers.map((header) => (
                    <td
                      key={`${section.id}-${rowIndex}-${header}`}
                      className={`px-3 py-2.5 align-top ${
                        typeof row[header] === "number" ? "text-right tabular-nums" : ""
                      }`}
                    >
                      {formatCell(row[header] as string | number, header)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </article>
  );
}

const EMPTY_COMPARISON_PAYLOAD: RevenueComparisonResponse = {
  database: { status: "offline", message: "Live actuals are unavailable." },
  financialYear: "",
  comparisonMonth: "Apr",
  summary: { rowCount: 0, budget: 0, forecast: 0, actual: 0, varianceVsBudget: 0, varianceVsForecast: 0 },
  rows: [],
};

function TrendsSectionCard({
  section,
  sheetName,
  payload,
}: {
  section: MisSheetSection;
  sheetName: string;
  payload: RevenueComparisonResponse | null;
}) {
  const [viewMode, setViewMode] = useState<"table" | "chart">("chart");
  const display = useMemo(() => buildDisplaySection(section, payload), [section, payload]);
  const metricKey = display.headers.includes("Actual") ? "Actual" : display.headers[1] ?? "Actual";
  const chartRows = useMemo(
    () =>
      display.rows
        .filter((row) => toText(row[display.labelKey]).toLowerCase() !== "grand total")
        .map((row) => ({ name: toText(row[display.labelKey]), value: toNumber(row[metricKey]) }))
        .filter((entry) => entry.value !== 0),
    [display, metricKey],
  );

  if (display.headers.length <= 1) {
    return null;
  }

  return (
    <article id={section.id} className="overflow-hidden rounded-[20px] border border-slate-200 bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{sheetName}</p>
          <h2 className="mt-1 text-base font-semibold text-slate-950">{section.title}</h2>
        </div>
        <button
          type="button"
          onClick={() => setViewMode((current) => (current === "table" ? "chart" : "table"))}
          className="inline-flex h-9 items-center gap-1 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-700"
        >
          {viewMode === "table" ? <BarChart3 className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />}
          {viewMode === "table" ? "Chart" : "Table"}
        </button>
      </div>
      {viewMode === "chart" ? (
        <div className="h-[320px] rounded-xl border border-slate-200 bg-white px-3 py-3">
          {chartRows.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm font-semibold text-slate-500">No chart data available.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartRows} margin={{ left: 10, right: 18, top: 12, bottom: 52 }}>
                <CartesianGrid stroke="#dbe3f0" strokeDasharray="4 4" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: "#475569" }}
                  interval={0}
                  angle={-22}
                  textAnchor="end"
                  height={54}
                  tickFormatter={(v) => (String(v).length > 16 ? `${String(v).slice(0, 14)}…` : String(v))}
                />
                <YAxis tickFormatter={(value) => formatCompactMetric(Number(value), metricKey)} width={72} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => formatCell(Number(value), metricKey)} />
                <Bar dataKey="value" fill="#0f766e" radius={[6, 6, 0, 0]} maxBarSize={26} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      ) : (
        <TableFullscreenShell title={section.title} description={`${sheetName} trends`} className="max-h-[360px] overflow-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-xs text-slate-700">
            <thead className="sticky top-0 z-20 bg-slate-950 text-white">
              <tr>
                {display.headers.map((header) => (
                  <th key={`${section.id}-${header}`} className="border-b border-white/10 px-3 py-2.5 font-semibold uppercase tracking-[0.12em]">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {display.rows.map((row, rowIndex) => {
                const rowLabel = toText(row[display.labelKey]);
                const isGrandTotal = rowLabel.toLowerCase() === "grand total";
                return (
                  <tr key={`${section.id}-${rowIndex}`} className={`border-b border-slate-100 ${isGrandTotal ? "bg-slate-100 font-semibold" : rowIndex % 2 === 0 ? "bg-white" : "bg-slate-50/70"}`}>
                    {display.headers.map((header, columnIndex) => (
                      <td key={`${section.id}-${rowIndex}-${header}`} className={`px-3 py-2.5 ${columnIndex === 0 ? "font-semibold text-slate-900" : "text-right tabular-nums"}`}>
                        {formatCell(row[header] as string | number, header)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableFullscreenShell>
      )}
    </article>
  );
}

export function MisTrendsKiosk({
  financialYear,
  sheets,
  activeSheetId,
  basePath = "/executive/trends",
}: MisTrendsKioskProps) {
  const searchParams = useSearchParams();
  const searchParamsKey = searchParams.toString();
  const [payload, setPayload] = useState<RevenueComparisonResponse>(EMPTY_COMPARISON_PAYLOAD);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const comparisonCacheRef = useRef<Map<string, RevenueComparisonResponse>>(new Map());
  const activeSheet =
    sheets.find((sheet) => sheet.id === activeSheetId) ??
    sheets.find((sheet) => sheet.name === activeSheetId) ??
    sheets[0] ??
    null;

  useEffect(() => {
    const controller = new AbortController();
    const filters = readRapidRevenueFiltersFromSearch(new URLSearchParams(searchParamsKey));
    const years = Array.from(new Set([financialYear, ...DEFAULT_FINANCIAL_YEARS].filter(Boolean)));

    async function loadActuals() {
      setLoading(true);
      setError(null);
      for (const year of years) {
        const query = buildRapidRevenueSearch({ ...filters, financialYear: year });
        const queryKey = query || "__default__";
        const cachedPayload = comparisonCacheRef.current.get(queryKey);
        if (cachedPayload && cachedPayload.rows.length > 0) {
          setPayload(cachedPayload);
          setLoading(false);
          return;
        }
        try {
          const response = await fetch(`/api/revenue/comparison${query ? `?${query}` : ""}`, {
            cache: "no-store",
            signal: controller.signal,
          });
          const body = (await response.json().catch(() => null)) as RevenueComparisonResponse | { detail?: string } | null;
          if (!response.ok || !body || !("rows" in body) || body.rows.length === 0) {
            continue;
          }
          comparisonCacheRef.current.set(queryKey, body);
          if (comparisonCacheRef.current.size > 16) {
            const oldestKey = comparisonCacheRef.current.keys().next().value;
            if (oldestKey) {
              comparisonCacheRef.current.delete(oldestKey);
            }
          }
          setPayload(body);
          setLoading(false);
          return;
        } catch (loadError) {
          if (controller.signal.aborted) {
            return;
          }
          if (year === years[years.length - 1]) {
            setError(loadError instanceof Error ? loadError.message : "Unable to load FY actuals.");
          }
        }
      }
      setLoading(false);
    }

    void loadActuals();
    return () => controller.abort();
  }, [financialYear, searchParamsKey]);

  const filteredSections = useMemo(() => {
    if (!activeSheet) {
      return [];
    }
    const needle = search.trim().toLowerCase();
    if (!needle) {
      return activeSheet.sections;
    }
    return activeSheet.sections.filter((section) =>
      [section.title, section.subtitle ?? "", section.headers.join(" ")]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [activeSheet, search]);

  const trendsBasePath = useMemo(
    () => appendSharedWorkspaceSearch(basePath, new URLSearchParams(searchParamsKey)),
    [basePath, searchParamsKey],
  );

  const comparisonPayload = payload.rows.length > 0 ? payload : null;
  const displayFinancialYear = payload.financialYear || financialYear;

  if (loading) {
    return (
      <section className="overflow-hidden rounded-[28px] border border-white/80 bg-white/84 px-6 py-6">
        <div className="flex items-center gap-3 text-slate-500">
          <LoaderCircle className="h-5 w-5 animate-spin" />
          Loading MIS trends...
        </div>
      </section>
    );
  }

  if (!activeSheet) {
    return (
      <section className="rounded-[24px] border border-slate-200 bg-white px-6 py-10 text-center text-sm font-semibold text-slate-500">
        MIS workbook data is not available.
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[22px] border border-slate-200 bg-white px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-slate-950">{activeSheet.name}</h1>
            <p className="mt-1 text-sm text-slate-600">
              FY {displayFinancialYear} — workbook columns are shown as parsed; live month actuals overlay only where
              columns are month series (forecast columns stay from MIS).
            </p>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Filter sections"
              className="h-9 w-64 rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-slate-400"
            />
          </div>
        </div>
      </section>

      <section className="overflow-x-auto rounded-[22px] border border-slate-200 bg-white p-3 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
        <div className="flex min-w-max gap-2">
          {sheets.map((sheet) => {
            const isActive = sheet.id === activeSheet.id;
            return (
              <Link
                key={sheet.id}
                href={appendSharedWorkspaceSearch(
                  buildSheetHref(trendsBasePath, displayFinancialYear, sheet.id),
                  new URLSearchParams(searchParamsKey),
                )}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  isActive
                    ? "bg-slate-950 text-white"
                    : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {sheet.name}
              </Link>
            );
          })}
        </div>
      </section>

      {filteredSections.length === 0 ? (
        <section className="rounded-[20px] border border-dashed border-slate-200 bg-white px-6 py-10 text-center text-sm font-semibold text-slate-600">
          No sections match this filter.
        </section>
      ) : (
        <section className="space-y-5">
          {filteredSections.map((section) => (
            <TrendsSectionCard
              key={section.id}
              section={section}
              sheetName={activeSheet.name}
              payload={comparisonPayload}
            />
          ))}
        </section>
      )}
    </div>
  );
}
