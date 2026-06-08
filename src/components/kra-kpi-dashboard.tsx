"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { LoaderCircle, Target } from "lucide-react";
import { useSearchParams } from "next/navigation";

import type { RevenueComparisonResponse, RevenueComparisonRow } from "@/lib/rapid-revenue";

const MONTHS = [
  { id: "Apr", label: "April" },
  { id: "May", label: "May" },
  { id: "Jun", label: "June" },
  { id: "Jul", label: "July" },
  { id: "Aug", label: "August" },
  { id: "Sep", label: "September" },
  { id: "Oct", label: "October" },
  { id: "Nov", label: "November" },
  { id: "Dec", label: "December" },
  { id: "Jan", label: "January" },
  { id: "Feb", label: "February" },
  { id: "Mar", label: "March" },
] as const;

const QUARTERS = [
  { id: "Q1", months: ["Apr", "May", "Jun"] },
  { id: "Q2", months: ["Jul", "Aug", "Sep"] },
  { id: "Q3", months: ["Oct", "Nov", "Dec"] },
  { id: "Q4", months: ["Jan", "Feb", "Mar"] },
] as const;
const ANNUAL_MONTH_IDS = MONTHS.map((month) => month.id);
const Q1_MONTHS = QUARTERS[0].months;

const ROW_DEFS = [
  { key: "ms", label: "MS", segment: "MS", level: 0 },
  { key: "ms-ee", label: "EE", segment: "MS", eeennn: "EE", level: 1 },
  { key: "ms-en", label: "EN", segment: "MS", eeennn: "EN", level: 1 },
  { key: "ms-nn", label: "NN", segment: "MS", eeennn: "NN", level: 1 },
  { key: "ps", label: "PS", segment: "PS", level: 0 },
  { key: "ps-ee", label: "EE", segment: "PS", eeennn: "EE", level: 1 },
  { key: "ps-en", label: "EN", segment: "PS", eeennn: "EN", level: 1 },
  { key: "ps-nn", label: "NN", segment: "PS", eeennn: "NN", level: 1 },
  { key: "grand-total", label: "Grand Total", level: 0, total: true },
] as const;

type MetricMode = "budget" | "forecast";
type RowDef = (typeof ROW_DEFS)[number];
type MonthId = (typeof MONTHS)[number]["id"];

type SummaryValues = {
  actual: number;
  kra: number | null;
  metric: number;
  varToKra: number | null;
  varToMetric: number;
};

function normalizeToken(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

function normalizeMonth(value: unknown): MonthId | "" {
  const month = String(value ?? "").trim().slice(0, 3);
  return MONTHS.some((entry) => entry.id === month) ? (month as MonthId) : "";
}

function matchesDefinition(row: RevenueComparisonRow, definition: RowDef) {
  if ("total" in definition && definition.total) {
    return true;
  }
  if ("segment" in definition && normalizeToken(row.msps) !== definition.segment) {
    return false;
  }
  if ("eeennn" in definition && definition.eeennn && normalizeToken(row.eeennn) !== definition.eeennn) {
    return false;
  }
  return true;
}

function summarizeRows(
  rows: RevenueComparisonRow[],
  months: readonly string[],
  definition: RowDef,
  metricMode: MetricMode,
): SummaryValues {
  const monthSet = new Set(months);
  let actual = 0;
  let metric = 0;

  for (const row of rows) {
    const month = normalizeMonth(row.month);
    if (!month || !monthSet.has(month) || !matchesDefinition(row, definition)) {
      continue;
    }
    actual += Number(row.actual ?? 0);
    metric += Number(metricMode === "budget" ? row.budget ?? 0 : row.forecast ?? 0);
  }

  const kra = null;
  return {
    actual,
    kra,
    metric,
    varToKra: kra === null ? null : actual - kra,
    varToMetric: actual - metric,
  };
}

function formatUsdMillions(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "--";
  }
  const sign = value < 0 ? "-" : "";
  return `${sign}$${(Math.abs(value) / 1_000_000).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function valueTone(value: number | null) {
  if (value === null || Math.abs(value) < 1) {
    return "text-slate-500";
  }
  return value >= 0 ? "text-emerald-700" : "text-rose-700";
}

function financialYearSuffix(financialYear: string | null | undefined) {
  const match = String(financialYear ?? "").match(/(\d{4})\D+(\d{4})/);
  if (!match) {
    return "";
  }
  return `${match[1].slice(2)}-${match[2].slice(2)}`;
}

function buildComparisonSearch(searchParams: URLSearchParams) {
  const next = new URLSearchParams(searchParams.toString());
  next.set("periodFrom", "Apr");
  next.set("periodTo", "Mar");
  return next.toString();
}

function KpiCell({ value, tone }: { value: number | null; tone?: boolean }) {
  return (
    <td className={`px-3 py-2.5 text-right font-semibold ${tone ? valueTone(value) : "text-slate-800"}`}>
      {formatUsdMillions(value)}
    </td>
  );
}

function RowLabelCell({ definition }: { definition: RowDef }) {
  const isTotal = "total" in definition && definition.total;
  return (
    <td
      className={`sticky left-0 z-10 border-r border-slate-100 bg-inherit px-3 py-2.5 font-semibold ${
        definition.level === 1 ? "pl-8 text-slate-600" : "text-slate-950"
      } ${isTotal ? "uppercase tracking-[0.08em]" : ""}`}
    >
      {definition.label}
    </td>
  );
}

export function KraKpiDashboard({
  metricMode,
}: {
  metricMode: MetricMode;
}) {
  const searchParams = useSearchParams();
  const searchParamsKey = searchParams.toString();
  const metricLabel = metricMode === "budget" ? "Budget" : "Forecast";
  const varianceMetricLabel = metricMode === "budget" ? "Var to Bud" : "Var to Fct";

  const query = useQuery({
    queryKey: ["kra-kpi-comparison", metricMode, searchParamsKey],
    queryFn: async () => {
      const search = buildComparisonSearch(new URLSearchParams(searchParamsKey));
      const response = await fetch(`/api/revenue/comparison?${search}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("Unable to load KRA/KPI data.");
      }
      return (await response.json()) as RevenueComparisonResponse;
    },
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });

  const rows = useMemo(() => query.data?.rows ?? [], [query.data?.rows]);
  const fySuffix = financialYearSuffix(query.data?.financialYear);
  const quarterLabels = useMemo(
    () =>
      QUARTERS.map((quarter) => ({
        ...quarter,
        label: fySuffix ? `${quarter.id} ${fySuffix}` : quarter.id,
      })),
    [fySuffix],
  );

  const annualTotals = useMemo(
    () =>
      ROW_DEFS.map((definition) => ({
        definition,
        q1: summarizeRows(rows, Q1_MONTHS, definition, metricMode),
        annual: summarizeRows(rows, ANNUAL_MONTH_IDS, definition, metricMode),
      })),
    [metricMode, rows],
  );

  const quarterTotals = useMemo(
    () =>
      ROW_DEFS.map((definition) => ({
        definition,
        quarters: quarterLabels.map((quarter) => ({
          quarter,
          values: summarizeRows(rows, quarter.months, definition, metricMode),
        })),
      })),
    [metricMode, quarterLabels, rows],
  );

  const monthTotals = useMemo(
    () =>
      ROW_DEFS.map((definition) => ({
        definition,
        months: MONTHS.map((month) => ({
          month,
          values: summarizeRows(rows, [month.id], definition, metricMode),
        })),
      })),
    [metricMode, rows],
  );

  if (query.isLoading) {
    return (
      <section className="flex min-h-56 items-center justify-center rounded-[22px] border border-slate-200 bg-white text-slate-500">
        <LoaderCircle className="mr-3 h-5 w-5 animate-spin" />
        Loading KRA/KPI...
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[22px] border border-slate-200 bg-white px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">KRA/KPI</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">KRA/KPI performance</h1>
            <p className="mt-1 text-sm text-slate-600">
              FY {query.data?.financialYear || "current"} | Amounts in USD M | KRA pending
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700">
            <Target className="h-4 w-4 text-slate-500" />
            {metricLabel} baseline
          </div>
        </div>
        {query.isError ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
            {query.error instanceof Error ? query.error.message : "Unable to load KRA/KPI data."}
          </div>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-700">Annual KRA</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[860px] border-collapse text-sm">
            <thead className="bg-slate-950 text-white">
              <tr>
                <th className="sticky left-0 z-20 bg-slate-950 px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em]">
                  Row Labels
                </th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-[0.14em]">Annual KRA</th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-[0.14em]">Q1 KRA</th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-[0.14em]">
                  Q1 {metricLabel}
                </th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-[0.14em]">Q1 Actual</th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-[0.14em]">
                  {varianceMetricLabel}
                </th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-[0.14em]">Var to KRA</th>
              </tr>
            </thead>
            <tbody>
              {annualTotals.map(({ definition, q1, annual }, index) => (
                <tr
                  key={definition.key}
                  className={`border-b border-slate-100 ${
                    "total" in definition && definition.total
                      ? "bg-slate-100"
                      : index % 2 === 0
                        ? "bg-white"
                        : "bg-slate-50"
                  }`}
                >
                  <RowLabelCell definition={definition} />
                  <KpiCell value={annual.kra} />
                  <KpiCell value={q1.kra} />
                  <KpiCell value={q1.metric} />
                  <KpiCell value={q1.actual} />
                  <KpiCell value={q1.varToMetric} tone />
                  <KpiCell value={q1.varToKra} tone />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-700">Quarter View</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1800px] border-collapse text-sm">
            <thead className="bg-slate-950 text-white">
              <tr>
                <th
                  rowSpan={2}
                  className="sticky left-0 z-20 bg-slate-950 px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em]"
                >
                  Row Labels
                </th>
                {quarterLabels.map((quarter) => (
                  <th
                    key={quarter.id}
                    colSpan={5}
                    className="border-l border-white/10 px-3 py-3 text-center text-xs font-semibold uppercase tracking-[0.14em]"
                  >
                    {quarter.label}
                  </th>
                ))}
              </tr>
              <tr>
                {quarterLabels.map((quarter) => (
                  <FragmentHeaders
                    key={`quarter-head-${quarter.id}`}
                    metricLabel={metricLabel}
                    varianceMetricLabel={varianceMetricLabel}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {quarterTotals.map(({ definition, quarters }, index) => (
                <tr
                  key={definition.key}
                  className={`border-b border-slate-100 ${
                    "total" in definition && definition.total
                      ? "bg-slate-100"
                      : index % 2 === 0
                        ? "bg-white"
                        : "bg-slate-50"
                  }`}
                >
                  <RowLabelCell definition={definition} />
                  {quarters.map(({ quarter, values }) => (
                    <ValueGroup key={`${definition.key}-${quarter.id}`} values={values} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-700">Month View</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[4200px] border-collapse text-sm">
            <thead className="bg-slate-950 text-white">
              <tr>
                <th
                  rowSpan={2}
                  className="sticky left-0 z-20 bg-slate-950 px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em]"
                >
                  Row Labels
                </th>
                {MONTHS.map((month) => (
                  <th
                    key={month.id}
                    colSpan={5}
                    className="border-l border-white/10 px-3 py-3 text-center text-xs font-semibold uppercase tracking-[0.14em]"
                  >
                    {month.label}
                  </th>
                ))}
              </tr>
              <tr>
                {MONTHS.map((month) => (
                  <FragmentHeaders
                    key={`month-head-${month.id}`}
                    metricLabel={metricLabel}
                    varianceMetricLabel={varianceMetricLabel}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {monthTotals.map(({ definition, months }, index) => (
                <tr
                  key={definition.key}
                  className={`border-b border-slate-100 ${
                    "total" in definition && definition.total
                      ? "bg-slate-100"
                      : index % 2 === 0
                        ? "bg-white"
                        : "bg-slate-50"
                  }`}
                >
                  <RowLabelCell definition={definition} />
                  {months.map(({ month, values }) => (
                    <ValueGroup key={`${definition.key}-${month.id}`} values={values} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function FragmentHeaders({
  metricLabel,
  varianceMetricLabel,
}: {
  metricLabel: string;
  varianceMetricLabel: string;
}) {
  return (
    <>
      <th className="border-l border-white/10 px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.12em]">
        {metricLabel}
      </th>
      <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.12em]">KRA</th>
      <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.12em]">Actual</th>
      <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.12em]">
        {varianceMetricLabel}
      </th>
      <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.12em]">Var to KRA</th>
    </>
  );
}

function ValueGroup({ values }: { values: SummaryValues }) {
  return (
    <>
      <KpiCell value={values.metric} />
      <KpiCell value={values.kra} />
      <KpiCell value={values.actual} />
      <KpiCell value={values.varToMetric} tone />
      <KpiCell value={values.varToKra} tone />
    </>
  );
}
