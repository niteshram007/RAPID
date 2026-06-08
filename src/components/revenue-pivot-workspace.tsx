"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
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
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download, LoaderCircle, Plus, Save, Sparkles, Trash2 } from "lucide-react";
import { toPng } from "html-to-image";

import { TableFullscreenShell } from "@/components/table-fullscreen-shell";

type DatasetType = "budget" | "global_revenue" | "forecast";
type ChartType = "bar" | "line" | "area" | "pie" | "donut" | "scatter" | "heatmap" | "table";
type AggregationType = "sum" | "avg" | "count" | "min" | "max";

type SchemaColumn = {
  name: string;
  label: string;
  kind: "numeric" | "categorical" | "date";
};
type SchemaPayload = {
  columns: SchemaColumn[];
  rowCount: number;
};
type Suggestion = {
  id: string;
  title: string;
  description: string;
  chartType: ChartType;
  config: { xAxis?: string; measures?: string[]; aggregation?: AggregationType; groupBy?: string[] };
};
type SuggestionsPayload = { suggestions: Suggestion[] };
type ChartPayload = {
  rows: Array<Record<string, unknown>>;
  measureAliases: string[];
  xAxis: string | null;
  insights: string[];
  meta: { rowCount: number };
};

type FilterRow = {
  id: string;
  field: string;
  operator: "eq" | "neq" | "contains" | "gte" | "lte" | "between" | "in";
  value: string;
};

export type RevenuePivotWorkspaceProps = { title: string; subtitle: string };

const DATASET_OPTIONS: Array<{ value: DatasetType; label: string }> = [
  { value: "budget", label: "Budget" },
  { value: "global_revenue", label: "Actuals" },
  { value: "forecast", label: "Forecast" },
];
const CHART_OPTIONS: ChartType[] = ["bar", "line", "area", "pie", "donut", "scatter", "heatmap", "table"];
const SERIES_COLORS = ["#0f172a", "#0284c7", "#059669", "#f97316", "#8b5cf6"];

function parseFilterValue(operator: FilterRow["operator"], value: string) {
  if (operator === "between" || operator === "in") {
    return value.split(",").map((entry) => entry.trim()).filter(Boolean);
  }
  return value.trim();
}

function toDisplay(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function RevenuePivotWorkspace({ title, subtitle }: RevenuePivotWorkspaceProps) {
  const chartRef = useRef<HTMLDivElement | null>(null);
  const [datasetType, setDatasetType] = useState<DatasetType>("budget");
  const [financialYear, setFinancialYear] = useState("2025-2026");
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [aggregation, setAggregation] = useState<AggregationType>("sum");
  const [xAxis, setXAxis] = useState("");
  const [measures, setMeasures] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState<string[]>([]);
  const [filters, setFilters] = useState<FilterRow[]>([]);
  const [chartData, setChartData] = useState<ChartPayload | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState("");

  const schemaQuery = useQuery({
    queryKey: ["analytics-schema", datasetType, financialYear],
    queryFn: async () => {
      const search = new URLSearchParams({ datasetType, financialYear });
      const response = await fetch(`/api/analytics/schema?${search.toString()}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Schema load failed.");
      return (await response.json()) as SchemaPayload;
    },
  });
  const suggestionsQuery = useQuery({
    queryKey: ["analytics-suggestions", datasetType, financialYear],
    queryFn: async () => {
      const search = new URLSearchParams({ datasetType, financialYear });
      const response = await fetch(`/api/analytics/chart-suggestions?${search.toString()}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Suggestions load failed.");
      return (await response.json()) as SuggestionsPayload;
    },
  });

  const numericColumns = useMemo(
    () => (schemaQuery.data?.columns ?? []).filter((column) => column.kind === "numeric"),
    [schemaQuery.data?.columns],
  );
  const dimensionColumns = useMemo(
    () => (schemaQuery.data?.columns ?? []).filter((column) => column.kind !== "numeric"),
    [schemaQuery.data?.columns],
  );

  async function runChart(custom: Partial<Record<string, unknown>> = {}) {
    setIsRunning(true);
    setMessage("");
    try {
      const payload = {
        datasetType,
        financialYear,
        chartType,
        xAxis,
        yAxis: measures[0] ?? null,
        measures,
        aggregation,
        groupBy,
        filters: filters
          .filter((filter) => filter.field && filter.value.trim())
          .map((filter) => ({ field: filter.field, operator: filter.operator, value: parseFilterValue(filter.operator, filter.value) })),
        limit: 120,
        ...custom,
      };
      const response = await fetch("/api/analytics/generate-chart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as ChartPayload & { detail?: string };
      if (!response.ok) throw new Error(data.detail ?? "Chart generation failed.");
      setChartData(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Chart generation failed.");
    } finally {
      setIsRunning(false);
    }
  }

  function addFilter() {
    setFilters((current) => [...current, { id: crypto.randomUUID(), field: "", operator: "eq", value: "" }]);
  }

  async function saveConfig() {
    const response = await fetch("/api/analytics/save-dashboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: "workspace-user",
        name: `${datasetType}-${new Date().toISOString().slice(0, 10)}`,
        datasetType,
        layout: { chartType, xAxis, measures, aggregation, groupBy, filters },
        charts: [{ name: title, chartType, xAxis, yAxis: measures[0] ?? "", config: { measures, aggregation, groupBy }, filters }],
      }),
    });
    setMessage(response.ok ? "Dashboard view saved." : "Unable to save dashboard view.");
  }

  async function exportPng() {
    if (!chartRef.current) return;
    const dataUrl = await toPng(chartRef.current, { cacheBust: true, pixelRatio: 2 });
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `${datasetType}-${chartType}.png`;
    link.click();
  }

  const xKey = chartData?.xAxis ?? xAxis;
  const seriesKey = chartData?.measureAliases?.[0] ?? "";
  const rows = chartData?.rows ?? [];
  const total = rows.reduce((sum, row) => sum + toNumber(row[seriesKey]), 0);

  return (
    <div className="space-y-6">
      <section className="surface-card px-6 py-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Intelligent Charts</p>
            <h2 className="mt-2 text-3xl font-semibold text-slate-950">{title}</h2>
            <p className="mt-2 text-sm text-slate-600">{subtitle}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void runChart()} className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white">{isRunning ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Apply</button>
            <button type="button" onClick={saveConfig} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700"><Save className="h-4 w-4" />Save</button>
            <button type="button" onClick={exportPng} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700"><Download className="h-4 w-4" />PNG</button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-6">
          <select className="auth-input" value={datasetType} onChange={(event) => setDatasetType(event.target.value as DatasetType)}>{DATASET_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
          <input className="auth-input" value={financialYear} onChange={(event) => setFinancialYear(event.target.value)} />
          <select className="auth-input" value={chartType} onChange={(event) => setChartType(event.target.value as ChartType)}>{CHART_OPTIONS.map((option) => <option key={option} value={option}>{option.toUpperCase()}</option>)}</select>
          <select className="auth-input" value={aggregation} onChange={(event) => setAggregation(event.target.value as AggregationType)}>{(["sum","avg","count","min","max"] as AggregationType[]).map((option) => <option key={option} value={option}>{option.toUpperCase()}</option>)}</select>
          <select className="auth-input" value={xAxis} onChange={(event) => setXAxis(event.target.value)}><option value="">X Axis</option>{dimensionColumns.map((column) => <option key={column.name} value={column.name}>{column.label}</option>)}</select>
          <select className="auth-input" value={measures[0] ?? ""} onChange={(event) => setMeasures(event.target.value ? [event.target.value] : [])}><option value="">Measure</option>{numericColumns.map((column) => <option key={column.name} value={column.name}>{column.label}</option>)}</select>
        </div>
        {message ? <p className="mt-3 text-sm text-slate-700">{message}</p> : null}
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.35fr_0.65fr]">
        <article className="surface-card px-5 py-5">
          <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Smart Recommendations</h3>
          <div className="mt-3 space-y-3">{(suggestionsQuery.data?.suggestions ?? []).map((suggestion) => <button key={suggestion.id} type="button" onClick={() => { setChartType(suggestion.chartType); setXAxis(suggestion.config.xAxis ?? ""); setMeasures(suggestion.config.measures ?? []); setAggregation(suggestion.config.aggregation ?? "sum"); setGroupBy(suggestion.config.groupBy ?? []); void runChart({ chartType: suggestion.chartType, xAxis: suggestion.config.xAxis ?? "", measures: suggestion.config.measures ?? [], yAxis: suggestion.config.measures?.[0] ?? null, aggregation: suggestion.config.aggregation ?? "sum", groupBy: suggestion.config.groupBy ?? [] }); }} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-left hover:bg-slate-50"><p className="text-sm font-semibold text-slate-900">{suggestion.title}</p><p className="mt-1 text-xs text-slate-600">{suggestion.description}</p></button>)}</div>
        </article>

        <article className="surface-card px-5 py-5">
          <div className="flex items-center justify-between"><h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Filters & Grouping</h3><button type="button" onClick={addFilter} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-slate-700"><Plus className="h-3.5 w-3.5" />Filter</button></div>
          <div className="mt-3 space-y-2">{filters.map((filter) => <div key={filter.id} className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 lg:grid-cols-[1fr_130px_1fr_auto]"><select className="auth-input" value={filter.field} onChange={(event) => setFilters((current) => current.map((entry) => entry.id === filter.id ? { ...entry, field: event.target.value } : entry))}><option value="">Field</option>{schemaQuery.data?.columns.map((column) => <option key={column.name} value={column.name}>{column.label}</option>)}</select><select className="auth-input" value={filter.operator} onChange={(event) => setFilters((current) => current.map((entry) => entry.id === filter.id ? { ...entry, operator: event.target.value as FilterRow["operator"] } : entry))}>{(["eq","neq","contains","gte","lte","between","in"] as FilterRow["operator"][]).map((option) => <option key={option} value={option}>{option}</option>)}</select><input className="auth-input" value={filter.value} onChange={(event) => setFilters((current) => current.map((entry) => entry.id === filter.id ? { ...entry, value: event.target.value } : entry))} placeholder="Value" /><button type="button" onClick={() => setFilters((current) => current.filter((entry) => entry.id !== filter.id))} className="inline-flex items-center justify-center rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700"><Trash2 className="h-4 w-4" /></button></div>)}</div>
          <div className="mt-3 flex flex-wrap gap-2">{dimensionColumns.map((column) => <button key={column.name} type="button" onClick={() => setGroupBy((current) => current.includes(column.name) ? current.filter((entry) => entry !== column.name) : [...current, column.name])} className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${groupBy.includes(column.name) ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700"}`}>{column.label}</button>)}</div>
        </article>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="metric-chip"><p className="text-sm text-slate-500">Dataset Rows</p><p className="mt-2 text-2xl font-bold text-slate-950">{schemaQuery.data?.rowCount.toLocaleString("en-US") ?? "-"}</p></article>
        <article className="metric-chip"><p className="text-sm text-slate-500">Visual Rows</p><p className="mt-2 text-2xl font-bold text-slate-950">{chartData?.meta.rowCount.toLocaleString("en-US") ?? "0"}</p></article>
        <article className="metric-chip"><p className="text-sm text-slate-500">Aggregate</p><p className="mt-2 text-2xl font-bold text-slate-950">{total.toLocaleString("en-US", { maximumFractionDigits: 2 })}</p></article>
      </section>

      <section ref={chartRef} className="surface-card px-6 py-6 lg:px-8">
        {isRunning ? <div className="flex h-[360px] items-center justify-center text-slate-600"><LoaderCircle className="mr-2 h-5 w-5 animate-spin" />Running query...</div> : rows.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-600">No chart data yet.</div> : chartType === "table" || chartType === "heatmap" ? <TableFullscreenShell title="Comparison matrix" description="Open the current comparison matrix in a full-page table view." className="rounded-[24px] border border-slate-200"><table className="min-w-full text-left text-xs"><thead className="sticky top-0 z-10 bg-slate-50"><tr className="border-b border-slate-200 bg-slate-50">{Object.keys(rows[0] ?? {}).map((key) => <th key={key} className="px-3 py-2 font-semibold text-slate-700">{toDisplay(key)}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex} className="border-b border-slate-100">{Object.entries(row).map(([key, value]) => <td key={`${rowIndex}-${key}`} className="px-3 py-2 text-slate-700" style={chartType === "heatmap" && key === seriesKey ? { background: `rgba(2,132,199,${0.08 + Math.min(1, Math.abs(toNumber(value)) / (total || 1)) * 0.42})` } : undefined}>{String(value ?? "")}</td>)}</tr>)}</tbody></table></TableFullscreenShell> : <div className="h-[420px]"><ResponsiveContainer width="100%" height="100%">{chartType === "line" ? <LineChart data={rows}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey={xKey ?? undefined} /><YAxis /><Tooltip /><Legend />{(chartData?.measureAliases ?? []).map((alias, index) => <Line key={alias} dataKey={alias} stroke={SERIES_COLORS[index % SERIES_COLORS.length]} strokeWidth={2} />)}</LineChart> : chartType === "area" ? <AreaChart data={rows}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey={xKey ?? undefined} /><YAxis /><Tooltip /><Legend />{(chartData?.measureAliases ?? []).map((alias, index) => <Area key={alias} dataKey={alias} stroke={SERIES_COLORS[index % SERIES_COLORS.length]} fill={SERIES_COLORS[index % SERIES_COLORS.length]} fillOpacity={0.2} />)}</AreaChart> : chartType === "pie" || chartType === "donut" ? <PieChart><Pie data={rows} dataKey={seriesKey} nameKey={xKey ?? undefined} innerRadius={chartType === "donut" ? 90 : 0} outerRadius={145}>{rows.map((_, index) => <Cell key={index} fill={SERIES_COLORS[index % SERIES_COLORS.length]} />)}</Pie><Tooltip /><Legend /></PieChart> : chartType === "scatter" ? <ScatterChart><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" dataKey={xKey ?? seriesKey} /><YAxis type="number" dataKey={seriesKey} /><Tooltip /><Scatter data={rows as Array<Record<string, number>>} fill="#0284c7" /></ScatterChart> : <BarChart data={rows}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey={xKey ?? undefined} /><YAxis /><Tooltip /><Legend />{(chartData?.measureAliases ?? []).map((alias, index) => <Bar key={alias} dataKey={alias} fill={SERIES_COLORS[index % SERIES_COLORS.length]} />)}</BarChart>}</ResponsiveContainer></div>}
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="surface-card px-6 py-6 lg:px-8"><h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Intelligent Insights</h3><ul className="mt-3 space-y-2">{(chartData?.insights ?? ["Run analytics to generate insights."]).map((insight, index) => <li key={index} className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">{insight}</li>)}</ul></article>
        <article className="surface-card px-6 py-6 lg:px-8"><h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Schema Attributes</h3><div className="mt-3 flex flex-wrap gap-2">{(schemaQuery.data?.columns ?? []).map((column) => <span key={column.name} className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${column.kind === "numeric" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : column.kind === "date" ? "border-sky-200 bg-sky-50 text-sky-800" : "border-slate-200 bg-white text-slate-700"}`}>{column.label}</span>)}</div></article>
      </section>
    </div>
  );
}
