"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatCurrency } from "@/lib/format";

function toAmount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

type DatasetType = "budget" | "global_revenue" | "forecast";

const MONTH_KEYS = [
  { key: "apr_2026", label: "Apr" },
  { key: "may_2026", label: "May" },
  { key: "jun_2026", label: "Jun" },
  { key: "jul_2026", label: "Jul" },
  { key: "aug_2026", label: "Aug" },
  { key: "sep_2026", label: "Sep" },
  { key: "oct_2026", label: "Oct" },
  { key: "nov_2026", label: "Nov" },
  { key: "dec_2026", label: "Dec" },
  { key: "jan_2027", label: "Jan" },
  { key: "feb_2027", label: "Feb" },
  { key: "mar_2027", label: "Mar" },
] as const;

type MasterdataRow = Record<string, unknown>;

async function fetchRows(datasetType: DatasetType) {
  const search = new URLSearchParams({ datasetType, limit: "5000" });
  const response = await fetch(`/api/masterdata?${search.toString()}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Unable to load masterdata.");
  }
  const body = (await response.json()) as { rows?: MasterdataRow[] };
  return body.rows ?? [];
}

function summarize(rows: MasterdataRow[]) {
  const monthly = Object.fromEntries(
    MONTH_KEYS.map((month) => [month.key, 0]),
  ) as Record<(typeof MONTH_KEYS)[number]["key"], number>;

  let fyTotal = 0;
  for (const row of rows) {
    fyTotal += toAmount(row.fy);
    for (const month of MONTH_KEYS) {
      monthly[month.key] += toAmount(row[month.key]);
    }
  }

  return { fyTotal, monthly };
}

export function BudgetGlobalComparison() {
  const budgetQuery = useQuery({
    queryKey: ["masterdata-budget-compare"],
    queryFn: () => fetchRows("budget"),
  });
  const globalQuery = useQuery({
    queryKey: ["masterdata-global-compare"],
    queryFn: () => fetchRows("global_revenue"),
  });
  const forecastQuery = useQuery({
    queryKey: ["masterdata-forecast-compare"],
    queryFn: () => fetchRows("forecast"),
  });

  const budgetSummary = summarize(budgetQuery.data ?? []);
  const globalSummary = summarize(globalQuery.data ?? []);
  const forecastSummary = summarize(forecastQuery.data ?? []);
  const monthlyRows = MONTH_KEYS.map((month) => ({
    month: month.label,
    budget: budgetSummary.monthly[month.key],
    globalRevenue: globalSummary.monthly[month.key],
    forecast: forecastSummary.monthly[month.key],
  }));

  return (
    <section className="surface-card px-6 py-5 lg:px-8">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Monthly Comparison</p>
      <div className="mt-3 grid gap-3 md:grid-cols-4">
        <article className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Budget FY</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{formatCurrency(budgetSummary.fyTotal)}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Actuals FY</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{formatCurrency(globalSummary.fyTotal)}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Forecast FY</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{formatCurrency(forecastSummary.fyTotal)}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Variance</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">
            {formatCurrency(globalSummary.fyTotal - budgetSummary.fyTotal)}
          </p>
        </article>
      </div>

      <div className="mt-4 h-[330px] rounded-2xl border border-slate-200 bg-white px-2 py-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={monthlyRows}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip formatter={(value) => formatCurrency(toAmount(value))} />
            <Legend />
            <Bar dataKey="budget" name="Budget" fill="#0f766e" radius={[4, 4, 0, 0]} />
            <Bar dataKey="globalRevenue" name="Actuals" fill="#1d4ed8" radius={[4, 4, 0, 0]} />
            <Bar dataKey="forecast" name="Forecast" fill="#b45309" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
