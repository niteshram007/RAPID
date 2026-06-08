"use client";

import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRightLeft,
  BrainCircuit,
  ChevronRight,
  Download,
  Layers3,
  LineChart as LineChartIcon,
  LoaderCircle,
  Orbit,
  RefreshCw,
  Save,
  Search,
  SlidersHorizontal,
  Table2,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Fragment, useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  Brush,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { TableFullscreenShell } from "@/components/table-fullscreen-shell";
import { Heatmap } from "@/components/analytics/heatmap";
import { MetricTile } from "@/components/analytics/metric-tile";
import { Sparkline } from "@/components/analytics/sparkline";
import { WaterfallChart } from "@/components/analytics/waterfall-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  RevenueDashboardData,
  RevenueDashboardFilters,
} from "@/lib/backend-api";
import { cn } from "@/lib/utils";

export type RevenueDashboardProps = {
  initialData: RevenueDashboardData;
};

type FilterState = {
  financialYears: string[];
  geographies: string[];
  practices: string[];
  geoHeads: string[];
  bdms: string[];
  accounts: string[];
  dealTypes: string[];
  businessTypes: string[];
  periodFrom: string;
  periodTo: string;
  comparisonMode: "absolute" | "percentage";
  comparisonMetric:
    | "budget_vs_actual"
    | "actual_vs_forecast"
    | "budget_vs_forecast";
  comparisonPeriod: "qoq" | "yoy";
  comparePrevious: boolean;
  breakdownDimension: "region" | "practice_head" | "bdm" | "customer_name";
  whatIfPct: number;
};

type SavedView = {
  id: string;
  name: string;
  filters: FilterState;
};

type TrendChartRow = RevenueDashboardData["trend"]["rows"][number] & {
  confidenceBase: number;
  confidenceBand: number;
};

type DisplayTrendRow = TrendChartRow & {
  label: string;
  currentValue: number;
  comparisonValue: number;
  delta: number;
  deltaPct: number;
};

type PerformerSortKey = "variance" | "actual" | "budget";
type VarianceSortMode = "highest_positive" | "lowest_negative" | "alphabetical";
type TrendGranularity = "month" | "quarter" | "year";
type TrendViewMode = "period" | "cumulative";
type ValueDisplayMode = "absolute" | "percentage" | "variance";
type MeasureType = "revenue" | "margin" | "growth" | "forecast_accuracy";
type SideBySideChartMode = "bar" | "line";

type DashboardLoadState = {
  dataState: "fresh" | "stale" | "fallback";
  reason?: "unauthorized" | "forbidden" | "backend_unavailable" | "timeout";
  message: string;
  lastSuccessAt?: string | null;
} | null;

function buildDashboardLoadState(meta: RevenueDashboardData["meta"]): DashboardLoadState {
  if (!meta || meta.dataState === "fresh") {
    return null;
  }
  const reason = meta.reason ?? "backend_unavailable";
  if (reason === "unauthorized") {
    return {
      dataState: meta.dataState,
      reason,
      message: "Session expired. Sign in again to refresh the dashboard.",
      lastSuccessAt: meta.lastSuccessAt ?? null,
    };
  }
  if (reason === "forbidden") {
    return {
      dataState: meta.dataState,
      reason,
      message: "Access scope changed. Showing the latest permitted dashboard snapshot.",
      lastSuccessAt: meta.lastSuccessAt ?? null,
    };
  }
  if (reason === "timeout") {
    return {
      dataState: meta.dataState,
      reason,
      message: "Request timed out. Showing the latest successful dashboard snapshot.",
      lastSuccessAt: meta.lastSuccessAt ?? null,
    };
  }
  return {
    dataState: meta.dataState,
    reason,
    message:
      meta.dataState === "fallback"
        ? "Backend is unavailable and no cached dashboard snapshot was found."
        : "Backend is unavailable. Showing the latest successful dashboard snapshot.",
    lastSuccessAt: meta.lastSuccessAt ?? null,
  };
}
type TableColumnKey =
  | "geography"
  | "practice"
  | "bdm"
  | "budget"
  | "actual"
  | "forecast"
  | "varianceBudget"
  | "varianceForecast"
  | "variancePct"
  | "contribution"
  | "trend";
type FilterChip = {
  field: keyof FilterState;
  value: string;
  label: string;
};

const SAVED_VIEWS_KEY = "rapid-revenue-saved-views";
const DASHBOARD_QUERY_KEYS = [
  "financialYears",
  "geographies",
  "practices",
  "geoHeads",
  "bdms",
  "accounts",
  "dealTypes",
  "businessTypes",
  "periodFrom",
  "periodTo",
  "comparisonMode",
  "comparisonMetric",
  "comparisonPeriod",
  "comparePrevious",
  "breakdownDimension",
  "whatIfPct",
] as const;
const SERIES_META = {
  budget: { label: "Budget", color: "#0f172a" },
  forecast: { label: "Forecast", color: "#0284c7" },
  actual: { label: "Actual", color: "#059669" },
  variance: { label: "Variance", color: "#dc2626" },
} as const;

function createFilterState(data: RevenueDashboardData): FilterState {
  return {
    financialYears: data.selectedFilters.financialYears ?? [],
    geographies: data.selectedFilters.geographies ?? [],
    practices: data.selectedFilters.practices ?? [],
    geoHeads: data.selectedFilters.geoHeads ?? [],
    bdms: data.selectedFilters.bdms ?? [],
    accounts: data.selectedFilters.accounts ?? [],
    dealTypes: data.selectedFilters.dealTypes ?? [],
    businessTypes: data.selectedFilters.businessTypes ?? [],
    periodFrom: data.selectedFilters.periodFrom ?? "Apr",
    periodTo: data.selectedFilters.periodTo ?? "Mar",
    comparisonMode: data.selectedFilters.comparisonMode ?? "absolute",
    comparisonMetric:
      data.selectedFilters.comparisonMetric ?? "budget_vs_actual",
    comparisonPeriod: data.selectedFilters.comparisonPeriod ?? "qoq",
    comparePrevious: data.selectedFilters.comparePrevious ?? false,
    breakdownDimension:
      data.selectedFilters.breakdownDimension ?? "region",
    whatIfPct: data.selectedFilters.whatIfPct ?? 0,
  };
}

function createClearedFilterState(): FilterState {
  return {
    financialYears: [],
    geographies: [],
    practices: [],
    geoHeads: [],
    bdms: [],
    accounts: [],
    dealTypes: [],
    businessTypes: [],
    periodFrom: "Apr",
    periodTo: "Mar",
    comparisonMode: "absolute",
    comparisonMetric: "budget_vs_actual",
    comparisonPeriod: "qoq",
    comparePrevious: false,
    breakdownDimension: "region",
    whatIfPct: 0,
  };
}

function toRequestFilters(filters: FilterState): RevenueDashboardFilters {
  return {
    financialYears: filters.financialYears,
    geographies: filters.geographies,
    practices: filters.practices,
    geoHeads: filters.geoHeads,
    bdms: filters.bdms,
    accounts: filters.accounts,
    dealTypes: filters.dealTypes,
    businessTypes: filters.businessTypes,
    periodFrom: filters.periodFrom,
    periodTo: filters.periodTo,
    comparisonMode: filters.comparisonMode,
    comparisonMetric: filters.comparisonMetric,
    comparisonPeriod: filters.comparisonPeriod,
    comparePrevious: filters.comparePrevious,
    breakdownDimension: filters.breakdownDimension,
    whatIfPct: filters.whatIfPct,
  };
}

function buildSearch(filters: RevenueDashboardFilters) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (Array.isArray(value)) {
      value.forEach((entry) => {
        const normalized = String(entry).trim();
        if (normalized) {
          search.append(key, normalized);
        }
      });
      continue;
    }

    if (typeof value === "boolean") {
      search.set(key, value ? "true" : "false");
      continue;
    }

    const normalized = String(value ?? "").trim();
    if (normalized) {
      search.set(key, normalized);
    }
  }
  return search.toString();
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCurrencyShort(value: number) {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (absolute >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (absolute >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return `${value.toFixed(0)}`;
}

function formatSigned(value: number, mode: "absolute" | "percentage") {
  if (mode === "percentage") {
    return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
  }
  return `${value >= 0 ? "+" : "-"}${formatCurrencyShort(Math.abs(value))}`;
}

function buildBreadcrumbs(filters: FilterState) {
  const crumbs: Array<{ label: string; value: string; depth: number }> = [];
  if (filters.geographies[0]) {
    crumbs.push({ label: "Geo", value: filters.geographies[0], depth: 0 });
  }
  if (filters.practices[0]) {
    crumbs.push({ label: "Practice", value: filters.practices[0], depth: 1 });
  }
  if (filters.bdms[0]) {
    crumbs.push({ label: "BDM", value: filters.bdms[0], depth: 2 });
  }
  if (filters.accounts[0]) {
    crumbs.push({ label: "Account", value: filters.accounts[0], depth: 3 });
  }
  return crumbs;
}

function inferNextBreakdown(
  filters: FilterState,
): FilterState["breakdownDimension"] {
  if (filters.accounts.length > 0) {
    return "customer_name";
  }
  if (filters.bdms.length > 0) {
    return "customer_name";
  }
  if (filters.practices.length > 0) {
    return "bdm";
  }
  if (filters.geographies.length > 0) {
    return "practice_head";
  }
  return "region";
}

function downloadBlob(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function sanitizeCsvCell(value: unknown) {
  const text = String(value ?? "");
  const trimmed = text.trim();
  if (
    trimmed.startsWith("=") ||
    trimmed.startsWith("+") ||
    trimmed.startsWith("@") ||
    trimmed.startsWith("\t") ||
    trimmed.startsWith("\r") ||
    (trimmed.startsWith("-") && trimmed.length > 1 && !/\d/.test(trimmed[1] ?? ""))
  ) {
    return `'${text}`;
  }
  return text;
}

function formatAppliedCount(filters: FilterState) {
  return (
    filters.financialYears.length +
    filters.geographies.length +
    filters.practices.length +
    filters.geoHeads.length +
    filters.bdms.length +
    filters.accounts.length +
    filters.dealTypes.length +
    filters.businessTypes.length
  );
}

function getComparisonNumbers(
  row: Pick<TrendChartRow, "actual" | "budget" | "forecast">,
  metric: FilterState["comparisonMetric"],
) {
  if (metric === "actual_vs_forecast") {
    const delta = row.actual - row.forecast;
    return {
      currentValue: row.actual,
      comparisonValue: row.forecast,
      delta,
      deltaPct: row.forecast ? (delta / row.forecast) * 100 : 0,
    };
  }

  if (metric === "budget_vs_forecast") {
    const delta = row.forecast - row.budget;
    return {
      currentValue: row.forecast,
      comparisonValue: row.budget,
      delta,
      deltaPct: row.budget ? (delta / row.budget) * 100 : 0,
    };
  }

  const delta = row.actual - row.budget;
  return {
    currentValue: row.actual,
    comparisonValue: row.budget,
    delta,
    deltaPct: row.budget ? (delta / row.budget) * 100 : 0,
  };
}

function buildActiveFilterChips(filters: FilterState): FilterChip[] {
  return [
    ...filters.financialYears.map((value) => ({
      field: "financialYears" as const,
      value,
      label: `FY ${value}`,
    })),
    ...filters.geographies.map((value) => ({
      field: "geographies" as const,
      value,
      label: `Geo ${value}`,
    })),
    ...filters.practices.map((value) => ({
      field: "practices" as const,
      value,
      label: `Practice ${value}`,
    })),
    ...filters.geoHeads.map((value) => ({
      field: "geoHeads" as const,
      value,
      label: `Geo Head ${value}`,
    })),
    ...filters.bdms.map((value) => ({
      field: "bdms" as const,
      value,
      label: `BDM ${value}`,
    })),
    ...filters.accounts.map((value) => ({
      field: "accounts" as const,
      value,
      label: `Account ${value}`,
    })),
    ...filters.dealTypes.map((value) => ({
      field: "dealTypes" as const,
      value,
      label: `Deal ${value}`,
    })),
    ...filters.businessTypes.map((value) => ({
      field: "businessTypes" as const,
      value,
      label: `Business ${value}`,
    })),
  ];
}

function aggregateTrendRows(
  rows: TrendChartRow[],
  metric: FilterState["comparisonMetric"],
  granularity: TrendGranularity,
  viewMode: TrendViewMode,
): DisplayTrendRow[] {
  const grouped =
    granularity === "year"
      ? { FY: rows }
      : granularity === "quarter"
      ? rows.reduce<Record<string, TrendChartRow[]>>((accumulator, row) => {
          accumulator[row.quarter] = [...(accumulator[row.quarter] ?? []), row];
          return accumulator;
        }, {})
      : rows.reduce<Record<string, TrendChartRow[]>>((accumulator, row) => {
          accumulator[row.month] = [row];
          return accumulator;
        }, {});

  const labels = Object.keys(grouped);
  const aggregated = labels.map((label) => {
    const slice = grouped[label] ?? [];
    const base = slice.reduce(
      (result, row) => ({
        month: row.month,
        quarter: row.quarter,
        budget: result.budget + row.budget,
        forecast: result.forecast + row.forecast,
        forecastLow: result.forecastLow + row.forecastLow,
        forecastHigh: result.forecastHigh + row.forecastHigh,
        actual: result.actual + row.actual,
        variance: result.variance + row.variance,
        variancePct: 0,
        anomaly: result.anomaly || row.anomaly,
        confidenceBase: 0,
        confidenceBand: 0,
      }),
      {
        month: label,
        quarter: slice[0]?.quarter ?? label,
        budget: 0,
        forecast: 0,
        forecastLow: 0,
        forecastHigh: 0,
        actual: 0,
        variance: 0,
        variancePct: 0,
        anomaly: false,
        confidenceBase: 0,
        confidenceBand: 0,
      } satisfies TrendChartRow,
    );

    const comparison = getComparisonNumbers(base, metric);
    return {
      ...base,
      label,
      variance: comparison.delta,
      variancePct: comparison.deltaPct,
      currentValue: comparison.currentValue,
      comparisonValue: comparison.comparisonValue,
      delta: comparison.delta,
      deltaPct: comparison.deltaPct,
      confidenceBase: base.forecastLow,
      confidenceBand: Math.max(0, base.forecastHigh - base.forecastLow),
    };
  });

  if (viewMode === "period") {
    return aggregated;
  }

  let runningBudget = 0;
  let runningForecast = 0;
  let runningForecastLow = 0;
  let runningForecastHigh = 0;
  let runningActual = 0;

  return aggregated.map((row) => {
    runningBudget += row.budget;
    runningForecast += row.forecast;
    runningForecastLow += row.forecastLow;
    runningForecastHigh += row.forecastHigh;
    runningActual += row.actual;
    const comparison = getComparisonNumbers(
      {
        budget: runningBudget,
        forecast: runningForecast,
        actual: runningActual,
      },
      metric,
    );

    return {
      ...row,
      budget: runningBudget,
      forecast: runningForecast,
      forecastLow: runningForecastLow,
      forecastHigh: runningForecastHigh,
      actual: runningActual,
      variance: comparison.delta,
      variancePct: comparison.deltaPct,
      currentValue: comparison.currentValue,
      comparisonValue: comparison.comparisonValue,
      delta: comparison.delta,
      deltaPct: comparison.deltaPct,
      confidenceBase: runningForecastLow,
      confidenceBand: Math.max(0, runningForecastHigh - runningForecastLow),
    };
  });
}

const FISCAL_MONTHS_ORDER = [
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

function formatRevenueTrendAxisLabel(
  label: string,
  granularity: TrendGranularity,
  financialYear: string | undefined,
) {
  if (granularity !== "month") {
    return label;
  }
  const month = String(label).trim().slice(0, 3);
  if (!FISCAL_MONTHS_ORDER.includes(month as (typeof FISCAL_MONTHS_ORDER)[number])) {
    return label;
  }
  const compact = (financialYear ?? "").replace(/\s/g, "");
  const match = compact.match(/^(\d{4})-(\d{4})$/);
  if (!match) {
    return month;
  }
  const y1 = match[1];
  const y2 = match[2];
  const q4 = month === "Jan" || month === "Feb" || month === "Mar";
  const yy = (q4 ? y2 : y1).slice(-2);
  return `${month} '${yy}`;
}

function buildSparklineValues(
  rows: DisplayTrendRow[],
  key: "budget" | "actual" | "forecast" | "delta",
) {
  return rows.slice(-6).map((row) => row[key]);
}

function buildLabelSparkline(
  heatmap: RevenueDashboardData["heatmap"],
  label: string,
) {
  const byMonth = new Map(
    heatmap.cells
      .filter((cell) => cell.y === label)
      .map((cell) => [cell.x, cell.actual]),
  );
  return heatmap.xLabels.map((month) => byMonth.get(month) ?? 0);
}

function TrendTooltip({
  active,
  payload,
  label,
  totalActual,
  mode,
}: {
  active?: boolean;
  payload?: Array<{ payload?: TrendChartRow }>;
  label?: string;
  totalActual: number;
  mode: "absolute" | "percentage";
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) {
    return null;
  }

  const actualContribution = totalActual ? (point.actual / totalActual) * 100 : 0;

  return (
    <div className="rounded-[22px] border border-slate-200 bg-white/95 px-4 py-3 shadow-2xl">
      <p className="text-sm font-semibold text-slate-950">{label}</p>
      <p className="mt-1 text-xs text-slate-500">Quarter {point.quarter}</p>
      <div className="mt-3 space-y-2 text-xs text-slate-600">
        <div className="flex items-center justify-between gap-6">
          <span>Budget</span>
          <span className="font-semibold text-slate-950">{formatCurrency(point.budget)}</span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span>Forecast</span>
          <span className="font-semibold text-slate-950">{formatCurrency(point.forecast)}</span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span>Actual</span>
          <span className="font-semibold text-slate-950">{formatCurrency(point.actual)}</span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span>Contribution</span>
          <span className="font-semibold text-slate-950">{actualContribution.toFixed(1)}%</span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span>Variance</span>
          <span
            className={cn(
              "font-semibold",
              point.variance >= 0 ? "text-emerald-600" : "text-rose-600",
            )}
          >
            {formatSigned(
              mode === "percentage" ? point.variancePct : point.variance,
              mode,
            )}
          </span>
        </div>
        <div className="rounded-2xl bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
          Forecast band {formatCurrency(point.forecastLow)} to {formatCurrency(point.forecastHigh)}
        </div>
      </div>
    </div>
  );
}

function BreakdownTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{
    value?: number;
    dataKey?: string;
    payload?: { contributionPct?: number; variance?: number };
  }>;
  label?: string;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  const row = payload[0]?.payload;

  return (
    <div className="rounded-[22px] border border-slate-200 bg-white/95 px-4 py-3 shadow-2xl">
      <p className="text-sm font-semibold text-slate-950">{label}</p>
      <div className="mt-3 space-y-2 text-xs text-slate-600">
        {payload.map((entry) => (
          <div
            key={`${label}-${entry.dataKey}`}
            className="flex items-center justify-between gap-6"
          >
            <span className="capitalize">{String(entry.dataKey).replaceAll("_", " ")}</span>
            <span className="font-semibold text-slate-950">{formatCurrency(Number(entry.value ?? 0))}</span>
          </div>
        ))}
        {typeof row?.contributionPct === "number" ? (
          <div className="flex items-center justify-between gap-6 rounded-2xl bg-slate-50 px-3 py-2">
            <span>Contribution</span>
            <span className="font-semibold text-slate-950">{row.contributionPct.toFixed(1)}%</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function InsightToneBadge({
  tone,
}: {
  tone: RevenueDashboardData["insights"][number]["tone"];
}) {
  const variant =
    tone === "positive"
      ? "emerald"
      : tone === "negative"
        ? "rose"
        : tone === "warning"
          ? "amber"
          : "neutral";

  return <Badge variant={variant}>{tone}</Badge>;
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex h-full min-h-40 items-center justify-center rounded-[26px] border border-dashed border-slate-200 bg-slate-50/80 px-6 text-center">
      <div className="max-w-sm space-y-2">
        <p className="text-sm font-semibold text-slate-950">{title}</p>
        <p className="text-sm leading-6 text-slate-500">{description}</p>
      </div>
    </div>
  );
}

export function RevenueDashboard({ initialData }: RevenueDashboardProps) {
  const initialFilterState = useMemo(() => createFilterState(initialData), [initialData]);
  const resetKey = useMemo(
    () => JSON.stringify(initialFilterState),
    [initialFilterState],
  );

  return (
    <RevenueDashboardContent
      key={resetKey}
      initialData={initialData}
      initialFilterState={initialFilterState}
    />
  );
}

function RevenueDashboardContent({
  initialData,
  initialFilterState,
}: RevenueDashboardProps & { initialFilterState: FilterState }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [draftFilters, setDraftFilters] = useState<FilterState>(initialFilterState);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(initialFilterState);
  const [presetName, setPresetName] = useState("");
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [visibleSeries, setVisibleSeries] = useState<
    Record<keyof typeof SERIES_META, boolean>
  >({
    budget: true,
    forecast: true,
    actual: true,
    variance: true,
  });
  const [performerTab, setPerformerTab] = useState<"top" | "bottom">("top");
  const [performerSortKey, setPerformerSortKey] =
    useState<PerformerSortKey>("variance");
  const [varianceSortMode, setVarianceSortMode] =
    useState<VarianceSortMode>("highest_positive");
  const [trendGranularity, setTrendGranularity] =
    useState<TrendGranularity>("month");
  const [trendViewMode, setTrendViewMode] =
    useState<TrendViewMode>("period");
  const [valueDisplayMode, setValueDisplayMode] =
    useState<ValueDisplayMode>(
      initialData.selectedFilters.comparisonMode === "percentage"
        ? "percentage"
        : "absolute",
    );
  const [selectedMeasure, setSelectedMeasure] =
    useState<MeasureType>("revenue");
  const [sideBySideChartMode, setSideBySideChartMode] =
    useState<SideBySideChartMode>("bar");
  const [tableSearch, setTableSearch] = useState("");
  const deferredTableSearch = useDeferredValue(tableSearch);
  const [focusLabel, setFocusLabel] = useState<string | null>(null);
  const [renamingViewId, setRenamingViewId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [compareLeftLabel, setCompareLeftLabel] = useState("");
  const [compareRightLabel, setCompareRightLabel] = useState("");
  const [expandedLabels, setExpandedLabels] = useState<string[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<
    Record<TableColumnKey, boolean>
  >({
    geography: true,
    practice: true,
    bdm: true,
    budget: true,
    actual: true,
    forecast: true,
    varianceBudget: true,
    varianceForecast: true,
    variancePct: true,
    contribution: true,
    trend: true,
  });
  const [loadState, setLoadState] = useState<DashboardLoadState>(() =>
    buildDashboardLoadState(initialData.meta),
  );
  const [lastGoodData, setLastGoodData] = useState<RevenueDashboardData>(initialData);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(SAVED_VIEWS_KEY);
        setSavedViews(raw ? (JSON.parse(raw) as SavedView[]) : []);
      } catch {
        setSavedViews([]);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(savedViews));
  }, [savedViews]);

  const appliedHash = useMemo(
    () => JSON.stringify(appliedFilters),
    [appliedFilters],
  );
  const appliedSearch = useMemo(
    () => buildSearch(toRequestFilters(appliedFilters)),
    [appliedFilters],
  );

  const query = useQuery({
    queryKey: ["revenue-dashboard", appliedHash, appliedSearch],
    queryFn: async () => {
      const response = await fetch(
        `/api/workspace/revenue-dashboard${appliedSearch ? `?${appliedSearch}` : ""}`,
        { cache: "no-store" },
      );
      const body = (await response.json().catch(() => null)) as RevenueDashboardData | null;
      if (!body) {
        throw new Error("Failed to refresh revenue analysis.");
      }
      const nextLoadState = buildDashboardLoadState(body.meta);
      setLoadState(nextLoadState);
      if (response.ok && (!body.meta || body.meta.dataState === "fresh")) {
        setLastGoodData(body);
        return body;
      }
      if (body.meta?.dataState === "stale") {
        if (lastGoodData) {
          return {
            ...lastGoodData,
            meta: body.meta,
          } as RevenueDashboardData;
        }
        return body;
      }
      if (response.ok && body.meta?.dataState === "fallback" && lastGoodData) {
        return {
          ...lastGoodData,
          meta: body.meta,
        } as RevenueDashboardData;
      }
      if (!response.ok && lastGoodData) {
        return {
          ...lastGoodData,
          meta: body.meta ?? {
            dataState: "stale",
            reason: "backend_unavailable",
            lastSuccessAt: lastGoodData.meta?.lastSuccessAt ?? null,
          },
        } as RevenueDashboardData;
      }
      throw new Error("Failed to refresh revenue analysis.");
    },
    initialData,
    placeholderData: (previous) => previous,
    staleTime: 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const data = query.data ?? lastGoodData ?? initialData;
  const hasData = data.summary.rowCount > 0;
  const activeFilterChips = useMemo(
    () => buildActiveFilterChips(appliedFilters),
    [appliedFilters],
  );
  const breadcrumbs = useMemo(
    () => buildBreadcrumbs(appliedFilters),
    [appliedFilters],
  );

  const rawTrendRows = useMemo<TrendChartRow[]>(() => {
    const baseRows =
      data.trend.rows.length > 0 ? data.trend.rows : data.monthlySeries;
    return baseRows.map((row) => ({
      ...row,
      confidenceBase: row.forecastLow,
      confidenceBand: Math.max(0, row.forecastHigh - row.forecastLow),
    }));
  }, [data.monthlySeries, data.trend.rows]);

  const trendRows = useMemo(
    () =>
      aggregateTrendRows(
        rawTrendRows,
        appliedFilters.comparisonMetric,
        trendGranularity,
        trendViewMode,
      ),
    [appliedFilters.comparisonMetric, rawTrendRows, trendGranularity, trendViewMode],
  );

  const totalTrendActual = useMemo(
    () => trendRows.reduce((sum, row) => sum + row.actual, 0),
    [trendRows],
  );

  const summarySparklineValues = useMemo(
    () => ({
      budget: buildSparklineValues(trendRows, "budget"),
      actual: buildSparklineValues(trendRows, "actual"),
      forecast: buildSparklineValues(trendRows, "forecast"),
      delta: buildSparklineValues(trendRows, "delta"),
    }),
    [trendRows],
  );

  const contributionRows = useMemo(() => {
    if (data.contribution.rows.length > 0) {
      return data.contribution.rows;
    }
    return data.topRegions.map((row) => ({
      ...row,
      forecast: row.outlook,
      contributionPct: data.summary.totalActual
        ? (row.actual / data.summary.totalActual) * 100
        : 0,
    }));
  }, [data.contribution.rows, data.summary.totalActual, data.topRegions]);

  const performerRows = useMemo(() => {
    const sorted = [...data.performers.rows].sort((left, right) => {
      return right[performerSortKey] - left[performerSortKey];
    });
    return performerTab === "top"
      ? sorted.slice(0, 8)
      : sorted.reverse().slice(0, 8);
  }, [data.performers.rows, performerSortKey, performerTab]);

  const varianceRows = useMemo(() => {
    const rows = contributionRows.map((row) => {
      const varianceBudget = row.actual - row.budget;
      const varianceForecast = row.actual - (row.forecast ?? row.outlook ?? 0);
      return {
        ...row,
        varianceBudget,
        varianceForecast,
        variancePct: row.budget ? (varianceBudget / row.budget) * 100 : 0,
      };
    });

    if (varianceSortMode === "alphabetical") {
      return [...rows].sort((left, right) => left.label.localeCompare(right.label));
    }

    if (varianceSortMode === "lowest_negative") {
      return [...rows].sort((left, right) => left.varianceBudget - right.varianceBudget);
    }

    return [...rows].sort((left, right) => right.varianceBudget - left.varianceBudget);
  }, [contributionRows, varianceSortMode]);

  const compareOptions = useMemo(
    () => contributionRows.map((row) => row.label),
    [contributionRows],
  );

  const comparePanels = useMemo(() => {
    const left = compareLeftLabel || compareOptions[0] || "";
    const right =
      compareRightLabel ||
      compareOptions.find((label) => label !== left) ||
      compareOptions[1] ||
      "";

    return {
      left,
      right,
    };
  }, [compareLeftLabel, compareOptions, compareRightLabel]);

  const sideBySideRows = useMemo(() => {
    const lookup = new Map(varianceRows.map((row) => [row.label, row]));
    return [comparePanels.left, comparePanels.right]
      .filter(Boolean)
      .map((label) => {
        const row = lookup.get(label);
        if (!row) {
          return null;
        }
        return {
          ...row,
          sparkline: buildLabelSparkline(data.heatmap, row.label),
        };
      })
      .filter((row) => row !== null);
  }, [comparePanels.left, comparePanels.right, data.heatmap, varianceRows]);

  const tableRows = useMemo(() => {
    const rows = data.performers.rows.map((row) => {
      const varianceBudget = row.actual - row.budget;
      const varianceForecast = row.actual - row.forecast;
      return {
        ...row,
        varianceBudget,
        varianceForecast,
        variancePctBudget: row.budget ? (varianceBudget / row.budget) * 100 : 0,
        contributionPct: data.summary.totalActual
          ? (row.actual / data.summary.totalActual) * 100
          : 0,
      };
    });

    const queryText = deferredTableSearch.trim().toLowerCase();
    const filtered = queryText
      ? rows.filter((row) =>
          [
            row.label,
            row.region,
            row.practiceHead,
            row.bdm,
            row.account,
          ].some((value) => value.toLowerCase().includes(queryText)),
        )
      : rows;

    return [...filtered].sort((left, right) => {
      if (performerSortKey === "actual") {
        return right.actual - left.actual;
      }
      if (performerSortKey === "budget") {
        return right.budget - left.budget;
      }
      return right.varianceBudget - left.varianceBudget;
    });
  }, [data.performers.rows, data.summary.totalActual, deferredTableSearch, performerSortKey]);

  const focusedRow = useMemo(
    () =>
      tableRows.find((row) => row.label === focusLabel) ??
      tableRows[0] ??
      null,
    [focusLabel, tableRows],
  );

  const explainChange = useMemo(() => {
    if (!focusedRow) {
      return null;
    }

    const biggestContributor = varianceRows[0];
    const previousValue =
      appliedFilters.comparisonMetric === "actual_vs_forecast"
        ? focusedRow.forecast
        : focusedRow.budget;
    const changeAmount =
      appliedFilters.comparisonMetric === "actual_vs_forecast"
        ? focusedRow.varianceForecast
        : focusedRow.varianceBudget;
    const changePct = previousValue ? (changeAmount / previousValue) * 100 : 0;

    return {
      label: focusedRow.label,
      actual: focusedRow.actual,
      previousValue,
      changeAmount,
      changePct,
      contributor: biggestContributor?.label ?? "Current slice",
      explanation: `Actual revenue is ${
        changeAmount >= 0 ? "up" : "down"
      } ${Math.abs(changePct).toFixed(1)}% for ${focusedRow.label}, mainly influenced by ${biggestContributor?.label ?? "the current mix"} in the selected view.`,
    };
  }, [appliedFilters.comparisonMetric, focusedRow, varianceRows]);

  const comparisonDeltaLabel = formatSigned(
    valueDisplayMode === "percentage"
      ? data.comparison.deltaPct
      : data.comparison.delta,
    valueDisplayMode === "percentage" ? "percentage" : "absolute",
  );

  const comparisonTone =
    data.comparison.delta >= 0 ? "positive" : "negative";
  const datasetLabel = data.dataset.financialYear
    ? `${data.dataset.financialYear} dataset`
    : "No active dataset";
  const varianceVsBudget = data.summary.totalActual - data.summary.totalBudget;
  const varianceVsBudgetPct = data.summary.totalBudget
    ? (varianceVsBudget / data.summary.totalBudget) * 100
    : 0;
  const varianceVsForecast = data.summary.totalActual - data.summary.totalOutlook;
  const varianceVsForecastPct = data.summary.totalOutlook
    ? (varianceVsForecast / data.summary.totalOutlook) * 100
    : 0;
  const visibleColumnCount =
    1 + Object.values(visibleColumns).filter(Boolean).length;

  function syncUrl(nextFilters: FilterState) {
    const next = new URLSearchParams(searchParams.toString());
    for (const key of DASHBOARD_QUERY_KEYS) {
      next.delete(key);
    }

    const search = new URLSearchParams(buildSearch(toRequestFilters(nextFilters)));
    search.forEach((value, key) => {
      next.append(key, value);
    });

    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  function updateFilter<K extends keyof FilterState>(
    key: K,
    value: FilterState[K],
  ) {
    setDraftFilters((current) => ({ ...current, [key]: value }));
  }

  function applyFilters(next?: FilterState) {
    const nextFilters = next ?? draftFilters;
    setAppliedFilters(nextFilters);
    syncUrl(nextFilters);
  }

  function resetFilters() {
    const next = initialFilterState;
    setDraftFilters(next);
    setAppliedFilters(next);
    setValueDisplayMode(
      next.comparisonMode === "percentage" ? "percentage" : "absolute",
    );
    syncUrl(next);
  }

  function clearAllFilters() {
    const next = createClearedFilterState();
    setDraftFilters(next);
    setAppliedFilters(next);
    setValueDisplayMode("absolute");
    syncUrl(next);
  }

  function toggleSeries(key: keyof typeof SERIES_META) {
    setVisibleSeries((current) => ({ ...current, [key]: !current[key] }));
  }

  function applyBrush(startIndex?: number, endIndex?: number) {
    if (startIndex == null || endIndex == null) {
      return;
    }
    const quarterBounds: Record<string, [string, string]> = {
      Q1: ["Apr", "Jun"],
      Q2: ["Jul", "Sep"],
      Q3: ["Oct", "Dec"],
      Q4: ["Jan", "Mar"],
    };
    const startRow = trendRows[startIndex];
    const endRow = trendRows[endIndex];
    const startMonth =
      trendGranularity === "quarter"
        ? quarterBounds[startRow?.label ?? ""]?.[0]
        : trendGranularity === "year"
          ? "Apr"
        : startRow?.month;
    const endMonth =
      trendGranularity === "quarter"
        ? quarterBounds[endRow?.label ?? ""]?.[1]
        : trendGranularity === "year"
          ? "Mar"
        : endRow?.month;
    const normalizedStartMonth =
      trendGranularity === "year" ? "Apr" : startMonth;
    if (!startMonth || !endMonth) {
      return;
    }

    const next = {
      ...draftFilters,
      periodFrom: normalizedStartMonth,
      periodTo: endMonth,
    };
    setDraftFilters(next);
    applyFilters(next);
  }

  function drillDown(label: string) {
    const next = { ...appliedFilters };
    if (data.contribution.dimension === "region") {
      next.geographies = [label];
    } else if (data.contribution.dimension === "practice_head") {
      next.practices = [label];
    } else if (data.contribution.dimension === "bdm") {
      next.bdms = [label];
    } else {
      next.accounts = [label];
    }
    next.breakdownDimension = inferNextBreakdown(next);
    setDraftFilters(next);
    setFocusLabel(label);
    applyFilters(next);
  }

  function resetToBreadcrumb(depth: number) {
    const next = { ...appliedFilters };
    if (depth < 3) {
      next.accounts = [];
    }
    if (depth < 2) {
      next.bdms = [];
    }
    if (depth < 1) {
      next.practices = [];
    }
    if (depth < 0) {
      next.geographies = [];
    }
    next.breakdownDimension = inferNextBreakdown(next);
    setDraftFilters(next);
    applyFilters(next);
  }

  function saveCurrentView() {
    const name = presetName.trim();
    if (!name) {
      return;
    }
    setSavedViews((current) => [
      { id: `${Date.now()}`, name, filters: draftFilters },
      ...current.slice(0, 7),
    ]);
    setPresetName("");
    setSaveDialogOpen(false);
  }

  function applySavedView(view: SavedView) {
    setDraftFilters(view.filters);
    applyFilters(view.filters);
  }

  function deleteSavedView(id: string) {
    setSavedViews((current) => current.filter((view) => view.id !== id));
  }

  function renameSavedView(id: string) {
    const name = renameValue.trim();
    if (!name) {
      return;
    }
    setSavedViews((current) =>
      current.map((view) => (view.id === id ? { ...view, name } : view)),
    );
    setRenamingViewId(null);
    setRenameValue("");
  }

  function removeFilterChip(chip: FilterChip) {
    const next: FilterState = {
      ...appliedFilters,
      [chip.field]: (appliedFilters[chip.field] as string[]).filter(
        (value) => value !== chip.value,
      ),
    };
    if (chip.field === "geographies" && !next.geographies.length) {
      next.practices = [];
      next.bdms = [];
      next.accounts = [];
    }
    next.breakdownDimension = inferNextBreakdown(next);
    setDraftFilters(next);
    applyFilters(next);
  }

  function applyPeriodPreset(preset: "month" | "quarter" | "year") {
    const next = { ...draftFilters };
    if (preset === "month") {
      next.periodTo = next.periodFrom;
    } else if (preset === "quarter") {
      const quarterMap: Record<string, [string, string]> = {
        Apr: ["Apr", "Jun"],
        May: ["Apr", "Jun"],
        Jun: ["Apr", "Jun"],
        Jul: ["Jul", "Sep"],
        Aug: ["Jul", "Sep"],
        Sep: ["Jul", "Sep"],
        Oct: ["Oct", "Dec"],
        Nov: ["Oct", "Dec"],
        Dec: ["Oct", "Dec"],
        Jan: ["Jan", "Mar"],
        Feb: ["Jan", "Mar"],
        Mar: ["Jan", "Mar"],
      };
      const [periodFrom, periodTo] = quarterMap[next.periodFrom];
      next.periodFrom = periodFrom;
      next.periodTo = periodTo;
    } else {
      next.periodFrom = "Apr";
      next.periodTo = "Mar";
    }
    setDraftFilters(next);
  }

  function toggleExpandedRow(label: string) {
    setExpandedLabels((current) =>
      current.includes(label)
        ? current.filter((entry) => entry !== label)
        : [...current, label],
    );
    setFocusLabel(label);
  }

  function toggleColumn(column: TableColumnKey) {
    setVisibleColumns((current) => ({ ...current, [column]: !current[column] }));
  }

  async function exportCsv() {
    const headers = [
      "Label",
      "Geography",
      "Practice",
      "BDM",
      "Budget",
      "Actual",
      "Forecast",
      "Variance vs Budget",
      "Variance vs Forecast",
      "Variance %",
      "Contribution %",
    ];
    const csv = [
      ["generated_by", "current-user"],
      ["generated_at", new Date().toISOString()],
      [],
      headers,
      ...tableRows.map((row) => [
      row.label,
      row.region,
      row.practiceHead,
      row.bdm,
      row.budget,
      row.actual,
      row.forecast,
      row.varianceBudget,
      row.varianceForecast,
      row.variancePctBudget,
      row.contributionPct,
    ]),
    ]
      .map((row) =>
        row.map((cell) => `"${sanitizeCsvCell(cell).replaceAll("\"", "\"\"")}"`).join(","),
      )
      .join("\n");

    const auditResponse = await fetch("/api/exports/audit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "export.dashboard_csv",
        description: "Downloaded dashboard CSV export.",
        metadata: {
          rows: tableRows.length,
          generatedAt: new Date().toISOString(),
        },
      }),
    });
    if (!auditResponse.ok) {
      return;
    }

    downloadBlob(
      `rapid-performance-table-${Date.now()}.csv`,
      csv,
      "text/csv;charset=utf-8",
    );
  }

  return (
    <div className="space-y-6">
      {loadState ? (
        <section
          className={`rounded-[18px] border px-4 py-3 text-sm ${
            loadState.dataState === "fallback"
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          <p>{loadState.message}</p>
          {loadState.lastSuccessAt ? (
            <p className="mt-1 text-xs opacity-85">
              Last successful sync: {new Date(loadState.lastSuccessAt).toLocaleString()}
            </p>
          ) : null}
        </section>
      ) : null}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="dashboard-frame surface-card overflow-hidden px-6 py-6 lg:px-8"
      >
        <div className="soft-grid absolute inset-0 opacity-40" />
        <div className="relative max-w-4xl">
          <div className="max-w-4xl">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-700">
              Comparison Workspace
            </p>
            <h3 className="font-display mt-4 max-w-3xl text-4xl tracking-tight text-slate-950 lg:text-[3rem] lg:leading-[1]">
              Compare budget, actual, forecast, and variance across dimensions
            </h3>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600 lg:text-base">
              Use staged slicers, linked comparison views, and drill paths to
              understand where revenue is ahead, behind, or changing versus plan.
            </p>
          </div>
        </div>
      </motion.section>

      <div className="space-y-6">
        <motion.section
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.45, delay: 0.05 }}
          className="space-y-4"
        >
          <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <Badge variant="sky" className="w-fit gap-2">
                <ArrowRightLeft className="h-3.5 w-3.5" />
                Comparison controls
              </Badge>
              <CardTitle>Comparison, measure, and drill logic</CardTitle>
              <CardDescription>
                Configure how the workspace compares revenue values before
                applying the next operating slice.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <Tabs
                value={valueDisplayMode}
                onValueChange={(value) =>
                  {
                    const nextMode = value as ValueDisplayMode;
                    setValueDisplayMode(nextMode);
                    updateFilter(
                      "comparisonMode",
                      nextMode === "percentage" ? "percentage" : "absolute",
                    );
                  }
                }
              >
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="absolute">Absolute</TabsTrigger>
                  <TabsTrigger value="percentage">Percentage</TabsTrigger>
                  <TabsTrigger value="variance">Variance</TabsTrigger>
                </TabsList>
              </Tabs>
              {activeFilterChips.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {activeFilterChips.map((chip) => (
                    <button
                      key={`${chip.field}-${chip.value}`}
                      type="button"
                      onClick={() => removeFilterChip(chip)}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-sky-300 hover:text-slate-950"
                    >
                      {chip.label}
                      <span aria-hidden="true">×</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  Use the right-side slicer to focus practice, BDM, geo, and account views.
                </p>
              )}
              <div className="grid gap-4 md:grid-cols-[repeat(2,minmax(0,1fr))_auto]">
                <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  From period
                  <select
                    value={draftFilters.periodFrom}
                    onChange={(event) => updateFilter("periodFrom", event.target.value)}
                    className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 outline-none focus:border-sky-400"
                  >
                    {data.filters.periods.map((period) => (
                      <option key={period} value={period}>
                        {period}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  To period
                  <select
                    value={draftFilters.periodTo}
                    onChange={(event) => updateFilter("periodTo", event.target.value)}
                    className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 outline-none focus:border-sky-400"
                  >
                    {data.filters.periods.map((period) => (
                      <option key={period} value={period}>
                        {period}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex flex-wrap items-end gap-2">
                  {(["month", "quarter", "year"] as const).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => applyPeriodPreset(preset)}
                      className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold capitalize text-slate-600 hover:border-sky-300 hover:text-slate-950"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-2">
                <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Comparison type
                  <select
                    value={draftFilters.comparisonMetric}
                    onChange={(event) =>
                      updateFilter(
                        "comparisonMetric",
                        event.target.value as FilterState["comparisonMetric"],
                      )
                    }
                    className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 outline-none focus:border-sky-400"
                  >
                    <option value="budget_vs_actual">Budget vs Actual</option>
                    <option value="actual_vs_forecast">Actual vs Forecast</option>
                    <option value="budget_vs_forecast">Budget vs Forecast</option>
                  </select>
                </label>
                <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Measure
                  <select
                    value={selectedMeasure}
                    onChange={(event) =>
                      setSelectedMeasure(event.target.value as MeasureType)
                    }
                    className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 outline-none focus:border-sky-400"
                  >
                    <option value="revenue">Revenue</option>
                    <option value="margin" disabled>
                      Margin (when modeled)
                    </option>
                    <option value="growth" disabled>
                      Growth % (when modeled)
                    </option>
                    <option value="forecast_accuracy" disabled>
                      Forecast Accuracy (when modeled)
                    </option>
                  </select>
                </label>
                <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Time granularity
                  <select
                    value={trendGranularity}
                    onChange={(event) =>
                      setTrendGranularity(event.target.value as TrendGranularity)
                    }
                    className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 outline-none focus:border-sky-400"
                  >
                    <option value="month">Monthly</option>
                    <option value="quarter">Quarterly</option>
                    <option value="year">Yearly</option>
                  </select>
                </label>
                <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Comparison basis
                  <select
                    value={draftFilters.comparisonPeriod}
                    onChange={(event) =>
                      updateFilter(
                        "comparisonPeriod",
                        event.target.value as FilterState["comparisonPeriod"],
                      )
                    }
                    className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 outline-none focus:border-sky-400"
                  >
                    <option value="qoq">Quarter over quarter</option>
                    <option value="yoy">Year over year</option>
                  </select>
                </label>
                <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Group by
                  <select
                    value={draftFilters.breakdownDimension}
                    onChange={(event) =>
                      updateFilter(
                        "breakdownDimension",
                        event.target.value as FilterState["breakdownDimension"],
                      )
                    }
                    className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 outline-none focus:border-sky-400"
                  >
                    <option value="region">Geography</option>
                    <option value="practice_head">Practice</option>
                    <option value="bdm">BDM</option>
                    <option value="customer_name">Account</option>
                  </select>
                </label>
              </div>
              <div className="flex items-center justify-between rounded-[24px] border border-slate-200 bg-slate-50/80 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">
                    Compare with previous period
                  </p>
                  <p className="text-xs text-slate-500">
                    Overlay QoQ or YoY context in the insights panel.
                  </p>
                </div>
                <Switch
                  checked={draftFilters.comparePrevious}
                  onCheckedChange={(checked) =>
                    updateFilter("comparePrevious", checked)
                  }
                />
              </div>
              <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-slate-950">
                      What-if forecast
                    </p>
                    <p className="text-xs text-slate-500">
                      Simulate upside or downside pressure against forecast.
                    </p>
                  </div>
                  <Badge variant="sky">
                    {draftFilters.whatIfPct >= 0 ? "+" : ""}
                    {draftFilters.whatIfPct}%
                  </Badge>
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <SlidersHorizontal className="h-4 w-4 text-slate-400" />
                  <input
                    type="range"
                    min={-20}
                    max={20}
                    step={1}
                    value={draftFilters.whatIfPct}
                    onChange={(event) =>
                      updateFilter("whatIfPct", Number(event.target.value))
                    }
                    className="h-2 w-full cursor-pointer accent-sky-600"
                  />
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <Button onClick={() => applyFilters()}>
                  <RefreshCw className="h-4 w-4" />
                  Apply filters
                </Button>
                <Button variant="secondary" onClick={resetFilters}>
                  Reset filters
                </Button>
                <Button variant="secondary" onClick={clearAllFilters}>
                  Clear all
                </Button>
              </div>
              <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Save current preset</DialogTitle>
                    <DialogDescription>
                      Store this slice locally so leadership-ready views are one
                      click away next time.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <Input
                      value={presetName}
                      onChange={(event) => setPresetName(event.target.value)}
                      placeholder="Quarterly APAC leadership review"
                    />
                    <div className="flex justify-end gap-3">
                      <DialogClose asChild>
                        <Button variant="secondary">Cancel</Button>
                      </DialogClose>
                      <Button onClick={saveCurrentView}>Save preset</Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
              <div className="space-y-3">
              <Badge variant="neutral" className="w-fit gap-2">
                <Save className="h-3.5 w-3.5" />
                Saved views
              </Badge>
              <CardTitle>Reusable slices</CardTitle>
              <CardDescription>
                Keep leadership, BDM, and finance views ready for quick recall.
              </CardDescription>
              </div>
              <Button variant="secondary" onClick={() => setSaveDialogOpen(true)}>
                New preset
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {savedViews.length === 0 ? (
                <p className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/80 px-4 py-4 text-sm text-slate-500">
                  Save your first preset to keep high-value filter
                  combinations reusable.
                </p>
              ) : (
                savedViews.map((view) => (
                  <div
                    key={view.id}
                    className="rounded-[24px] border border-slate-200 bg-white/90 px-4 py-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        {renamingViewId === view.id ? (
                          <div className="space-y-2">
                            <Input
                              value={renameValue}
                              onChange={(event) => setRenameValue(event.target.value)}
                              placeholder="Rename saved view"
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => renameSavedView(view.id)}
                              >
                                Save
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  setRenamingViewId(null);
                                  setRenameValue("");
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm font-semibold text-slate-950">
                            {view.name}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-slate-500">
                          {formatAppliedCount(view.filters)} filters saved
                        </p>
                      </div>
                      {renamingViewId === view.id ? null : (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setRenamingViewId(view.id);
                              setRenameValue(view.name);
                            }}
                          >
                            Rename
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteSavedView(view.id)}
                          >
                            Remove
                          </Button>
                        </div>
                      )}
                    </div>
                    <Button
                      variant="secondary"
                      className="mt-3 w-full"
                      onClick={() => applySavedView(view)}
                    >
                      Apply view
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
          </div>
        </motion.section>

        <div className="space-y-6">
          <AnimatePresence>
            {query.isFetching ? (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="fixed right-6 top-24 z-30"
              >
                <Badge variant="neutral" className="gap-2 bg-white shadow-xl">
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  Refreshing analysis
                </Badge>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="sky">{datasetLabel}</Badge>
              <Badge variant="neutral">
                {data.dataset.importedRows} imported rows
              </Badge>
              {data.comparison.previousLabel ? (
                <Badge variant="amber">
                  Comparing with {data.comparison.previousLabel}
                </Badge>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-3">
              <Dialog
                open={detailDialogOpen}
                onOpenChange={setDetailDialogOpen}
              >
                <DialogTrigger asChild>
                  <Button variant="secondary">
                    <Table2 className="h-4 w-4" />
                    Detailed table
                  </Button>
                </DialogTrigger>
                <DialogContent className="w-[min(96vw,72rem)]">
                  <DialogHeader>
                    <DialogTitle>Detailed resource view</DialogTitle>
                    <DialogDescription>
                      Drill-through table for the currently selected slice.
                    </DialogDescription>
                  </DialogHeader>
                  <TableFullscreenShell
                    title="Detailed resource view"
                    description="Open the drill-through table in a full-page view."
                    className="max-h-[70vh] rounded-[24px] border border-slate-200"
                  >
                    <table className="min-w-full border-collapse text-left text-sm">
                      <thead className="sticky top-0 bg-slate-50">
                        <tr className="border-b border-slate-200 text-xs uppercase tracking-[0.18em] text-slate-500">
                          <th className="px-4 py-3">Resource</th>
                          <th className="px-4 py-3">Account</th>
                          <th className="px-4 py-3">Project</th>
                          <th className="px-4 py-3">Ownership</th>
                          <th className="px-4 py-3 text-right">Budget</th>
                          <th className="px-4 py-3 text-right">Outlook</th>
                          <th className="px-4 py-3 text-right">Variance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.resourceTable.map((row) => (
                          <tr
                            key={`${row.resourceId}-${row.resourceName}-${row.projectName}`}
                            className="border-b border-slate-100 text-slate-700"
                          >
                            <td className="px-4 py-3">
                              <div>
                                <p className="font-semibold text-slate-950">
                                  {row.resourceName}
                                </p>
                                <p className="text-xs text-slate-500">
                                  {row.resourceId || "No resource ID"}
                                </p>
                              </div>
                            </td>
                            <td className="px-4 py-3">{row.customerName}</td>
                            <td className="px-4 py-3">{row.projectName}</td>
                            <td className="px-4 py-3">
                              <div className="space-y-1 text-xs">
                                <p>{row.region}</p>
                                <p>{row.practiceHead}</p>
                                <p>{row.geoHead}</p>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right font-medium">
                              {formatCurrency(row.budget)}
                            </td>
                            <td className="px-4 py-3 text-right font-medium">
                              {formatCurrency(row.outlook)}
                            </td>
                            <td
                              className={cn(
                                "px-4 py-3 text-right font-semibold",
                                row.variance >= 0
                                  ? "text-emerald-600"
                                  : "text-rose-600",
                              )}
                            >
                              {formatCurrency(row.variance)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableFullscreenShell>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {breadcrumbs.length > 0 ? (
            <Card>
              <CardContent className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 hover:border-slate-300 hover:text-slate-950"
                  >
                    All scopes
                  </button>
                  {breadcrumbs.map((crumb) => (
                    <div key={`${crumb.label}-${crumb.value}`} className="flex items-center gap-2">
                      <ChevronRight className="h-4 w-4 text-slate-300" />
                      <button
                        type="button"
                        onClick={() => resetToBreadcrumb(crumb.depth)}
                        className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-sky-300 hover:text-slate-950"
                      >
                        <span className="text-slate-400">{crumb.label}</span>{" "}
                        {crumb.value}
                      </button>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-slate-500">
                  Click contribution bars or heatmap rows to move deeper into
                  the hierarchy.
                </p>
              </CardContent>
            </Card>
          ) : null}

          {!hasData ? (
            <Card>
              <CardContent className="px-6 py-10">
                <EmptyState
                  title="No data is visible for the current slice."
                  description="Upload or activate a workbook from the admin dashboard, or broaden the filters to bring records into view."
                />
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-5">
                <MetricTile
                  label="Total Budget"
                  value={formatCurrency(data.summary.totalBudget)}
                  detail={`${data.trend.fromPeriod} to ${data.trend.toPeriod} across ${data.dataset.financialYear ?? "the active"} financial plan.`}
                  delta={formatSigned(varianceVsBudgetPct, "percentage")}
                  tone={varianceVsBudget >= 0 ? "positive" : "negative"}
                  tooltip="Planned budget value for the selected slice and period."
                  sparklineValues={summarySparklineValues.budget}
                />
                <MetricTile
                  label="Total Actual"
                  value={formatCurrency(data.summary.totalActual)}
                  detail={`${data.summary.resourceCount} resources across ${data.summary.customerCount} customers are visible in this slice.`}
                  delta={comparisonDeltaLabel}
                  tone={comparisonTone}
                  tooltip="Recognized actual revenue for the currently applied slice."
                  sparklineValues={summarySparklineValues.actual}
                />
                <MetricTile
                  label="Total Forecast"
                  value={formatCurrency(data.summary.totalOutlook)}
                  detail={`What-if model is set to ${data.trend.whatIfPct >= 0 ? "+" : ""}${data.trend.whatIfPct}% over the selected time window.`}
                  delta={formatSigned(varianceVsForecastPct, "percentage")}
                  tone={varianceVsForecast >= 0 ? "positive" : "negative"}
                  tooltip="Forecasted revenue after any what-if adjustment."
                  sparklineValues={summarySparklineValues.forecast}
                />
                <MetricTile
                  label="Variance vs Budget"
                  value={formatCurrency(varianceVsBudget)}
                  detail="Actual minus budget for the selected period. Use this to isolate operating outperformance or shortfall."
                  delta={formatSigned(varianceVsBudgetPct, "percentage")}
                  tone={varianceVsBudget >= 0 ? "positive" : "negative"}
                  tooltip="Difference between actual revenue and budget."
                  sparklineValues={summarySparklineValues.delta}
                />
                <MetricTile
                  label="Variance vs Forecast"
                  value={formatCurrency(varianceVsForecast)}
                  detail={
                    data.comparison.previousLabel
                      ? `Previous comparison window: ${data.comparison.previousLabel}.`
                      : "Turn on previous-period comparison to add QoQ or YoY context."
                  }
                  delta={formatSigned(varianceVsForecastPct, "percentage")}
                  tone={varianceVsForecast >= 0 ? "positive" : "negative"}
                  tooltip="Difference between actual revenue and forecast."
                  sparklineValues={summarySparklineValues.actual}
                />
              </div>

              <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.72fr)]">
                <Card>
                  <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <Badge variant="neutral" className="w-fit gap-2">
                        <LineChartIcon className="h-3.5 w-3.5" />
                        Revenue trend
                      </Badge>
                      <CardTitle>Budget, actual, and forecast trajectory</CardTitle>
                      <CardDescription>
                        Confidence band shows forecast uncertainty, the red area
                        shows variance, and anomaly markers call out sudden
                        movement.
                      </CardDescription>
                    </div>
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <Tabs
                          value={trendGranularity}
                          onValueChange={(value) =>
                            setTrendGranularity(value as TrendGranularity)
                          }
                        >
                          <TabsList>
                            <TabsTrigger value="month">Monthly</TabsTrigger>
                            <TabsTrigger value="quarter">Quarterly</TabsTrigger>
                          </TabsList>
                        </Tabs>
                        <Tabs
                          value={trendViewMode}
                          onValueChange={(value) =>
                            setTrendViewMode(value as TrendViewMode)
                          }
                        >
                          <TabsList>
                            <TabsTrigger value="period">Period</TabsTrigger>
                            <TabsTrigger value="cumulative">Cumulative</TabsTrigger>
                          </TabsList>
                        </Tabs>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(Object.keys(SERIES_META) as Array<
                          keyof typeof SERIES_META
                        >).map((key) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => toggleSeries(key)}
                            className={cn(
                              "rounded-full border px-3 py-1.5 text-xs font-semibold",
                              visibleSeries[key]
                                ? "border-slate-200 bg-white text-slate-800"
                                : "border-slate-100 bg-slate-100 text-slate-400",
                            )}
                          >
                            <span
                              className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle"
                              style={{ backgroundColor: SERIES_META[key].color }}
                            />
                            {SERIES_META[key].label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-4 py-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Current value
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-slate-950">
                          {formatCurrency(data.comparison.currentValue)}
                        </p>
                      </div>
                      <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-4 py-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Baseline
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-slate-950">
                          {formatCurrency(data.comparison.baselineValue)}
                        </p>
                      </div>
                      <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-4 py-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Delta
                        </p>
                        <p
                          className={cn(
                            "mt-2 text-2xl font-semibold",
                            comparisonTone === "positive"
                              ? "text-emerald-600"
                              : "text-rose-600",
                          )}
                        >
                          {comparisonDeltaLabel}
                        </p>
                      </div>
                    </div>
                    <div className="h-[420px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={trendRows}>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#e2e8f0"
                          />
                          <XAxis
                            dataKey="label"
                            tick={{ fontSize: 11, fill: "#64748b" }}
                            tickFormatter={(value) =>
                              formatRevenueTrendAxisLabel(
                                String(value),
                                trendGranularity,
                                appliedFilters.financialYears[0],
                              )
                            }
                            interval="preserveStartEnd"
                            minTickGap={32}
                            height={48}
                          />
                          <YAxis
                            tick={{ fontSize: 12, fill: "#64748b" }}
                            tickFormatter={formatCurrencyShort}
                          />
                          <YAxis yAxisId="variance" hide />
                          <RechartsTooltip
                            content={
                              <TrendTooltip
                                totalActual={totalTrendActual}
                                mode={
                                  valueDisplayMode === "percentage"
                                    ? "percentage"
                                    : "absolute"
                                }
                              />
                            }
                          />
                          {visibleSeries.variance ? (
                            <Area
                              yAxisId="variance"
                              type="monotone"
                              dataKey="variance"
                              stroke="none"
                              fill="#fb7185"
                              fillOpacity={0.12}
                              isAnimationActive={false}
                            />
                          ) : null}
                          <Area
                            type="monotone"
                            dataKey="confidenceBase"
                            stackId="confidence"
                            stroke="none"
                            fill="transparent"
                            isAnimationActive={false}
                          />
                          <Area
                            type="monotone"
                            dataKey="confidenceBand"
                            stackId="confidence"
                            stroke="none"
                            fill="#38bdf8"
                            fillOpacity={0.12}
                            isAnimationActive={false}
                          />
                          {visibleSeries.budget ? (
                            <Line
                              type="monotone"
                              dataKey="budget"
                              stroke={SERIES_META.budget.color}
                              strokeWidth={2.4}
                              dot={false}
                              activeDot={{ r: 5 }}
                            />
                          ) : null}
                          {visibleSeries.forecast ? (
                            <Line
                              type="monotone"
                              dataKey="forecast"
                              stroke={SERIES_META.forecast.color}
                              strokeWidth={2.4}
                              strokeDasharray="5 5"
                              dot={false}
                              activeDot={{ r: 5 }}
                            />
                          ) : null}
                          {visibleSeries.actual ? (
                            <Line
                              type="monotone"
                              dataKey="actual"
                              stroke={SERIES_META.actual.color}
                              strokeWidth={3}
                              dot={false}
                              activeDot={{ r: 6 }}
                            />
                          ) : null}
                          {visibleSeries.actual
                            ? trendRows.map((row) =>
                                row.anomaly ? (
                                  <ReferenceDot
                                    key={`anomaly-${row.label}`}
                                    x={row.label}
                                    y={row.actual}
                                    r={5}
                                    fill="#f97316"
                                    stroke="#fff"
                                    strokeWidth={2}
                                  />
                                ) : null,
                              )
                            : null}
                          <Brush
                            dataKey="label"
                            height={28}
                            stroke="#0f7cff"
                            travellerWidth={10}
                            onChange={({ startIndex, endIndex }) =>
                              applyBrush(startIndex, endIndex)
                            }
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <Badge variant="sky" className="w-fit gap-2">
                      <BrainCircuit className="h-3.5 w-3.5" />
                      Smart insights
                    </Badge>
                    <CardTitle>Automatic narrative highlights</CardTitle>
                    <CardDescription>
                      Rule-based intelligence summarizes momentum, concentration,
                      anomalies, and comparison context.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {data.insights.map((insight, index) => (
                      <motion.div
                        key={`${insight.headline}-${index}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: index * 0.05 }}
                        className="rounded-[24px] border border-slate-200 bg-white/90 px-4 py-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-950">
                            {insight.headline}
                          </p>
                          <InsightToneBadge tone={insight.tone} />
                        </div>
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          {insight.detail}
                        </p>
                      </motion.div>
                    ))}
                    <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm text-slate-600">
                      <p className="font-semibold text-slate-950">Dataset context</p>
                      <p className="mt-2">
                        Source workbook:{" "}
                        <span className="font-medium text-slate-800">
                          {data.dataset.originalFilename ?? "Unavailable"}
                        </span>
                      </p>
                      <p className="mt-1">
                        Parsed sheets:{" "}
                        {(data.dataset.parsedSheets.length > 0
                          ? data.dataset.parsedSheets
                          : ["None"]).join(", ")}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-6 2xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <Card>
                  <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                    <Badge variant="neutral" className="w-fit gap-2">
                      <ArrowRightLeft className="h-3.5 w-3.5" />
                      Variance explorer
                    </Badge>
                    <CardTitle>
                      Actual vs budget by {data.contribution.dimensionLabel}
                    </CardTitle>
                    <CardDescription>
                      Sort the selected grain, then click a bar to drill into the
                      next level of the operating hierarchy.
                    </CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {([
                        ["highest_positive", "Highest positive"],
                        ["lowest_negative", "Lowest negative"],
                        ["alphabetical", "Alphabetical"],
                      ] as Array<[VarianceSortMode, string]>).map(
                        ([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setVarianceSortMode(value)}
                            className={cn(
                              "rounded-full border px-3 py-1.5 text-xs font-semibold",
                              varianceSortMode === value
                                ? "border-slate-950 bg-slate-950 text-white"
                                : "border-slate-200 bg-white text-slate-600",
                            )}
                          >
                            {label}
                          </button>
                        ),
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {varianceRows.length === 0 ? (
                      <EmptyState
                        title="Variance ranking is waiting for segment data."
                        description="Open the slice further or widen the filters to compare contribution segments."
                      />
                    ) : (
                      <div className="h-[340px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            layout="vertical"
                            data={varianceRows.slice(0, 10)}
                            margin={{ left: 12, right: 18 }}
                            onClick={(state) => {
                              const label = state?.activeLabel;
                              if (typeof label === "string") {
                                drillDown(label);
                              }
                            }}
                          >
                            <CartesianGrid
                              strokeDasharray="3 3"
                              stroke="#e2e8f0"
                            />
                            <XAxis
                              type="number"
                              tick={{ fontSize: 12, fill: "#64748b" }}
                              tickFormatter={formatCurrencyShort}
                            />
                            <YAxis
                              type="category"
                              dataKey="label"
                              width={130}
                              tick={{ fontSize: 12, fill: "#64748b" }}
                              tickFormatter={(value: string) =>
                                value.length > 18 ? `${value.slice(0, 18)}…` : value
                              }
                            />
                            <RechartsTooltip
                              content={({ active, payload }) => {
                                const point = payload?.[0]?.payload as
                                  | (typeof varianceRows)[number]
                                  | undefined;
                                if (!active || !point) {
                                  return null;
                                }
                                return (
                                  <div className="rounded-[22px] border border-slate-200 bg-white/95 px-4 py-3 shadow-2xl">
                                    <p className="text-sm font-semibold text-slate-950">
                                      {point.label}
                                    </p>
                                    <div className="mt-3 space-y-2 text-xs text-slate-600">
                                      <div className="flex items-center justify-between gap-8">
                                        <span>Budget</span>
                                        <span className="font-semibold text-slate-950">
                                          {formatCurrency(point.budget)}
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between gap-8">
                                        <span>Actual</span>
                                        <span className="font-semibold text-slate-950">
                                          {formatCurrency(point.actual)}
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between gap-8">
                                        <span>Variance</span>
                                        <span
                                          className={cn(
                                            "font-semibold",
                                            point.varianceBudget >= 0
                                              ? "text-emerald-600"
                                              : "text-rose-600",
                                          )}
                                        >
                                          {formatCurrency(point.varianceBudget)}
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between gap-8">
                                        <span>Variance %</span>
                                        <span className="font-semibold text-slate-950">
                                          {point.variancePct.toFixed(1)}%
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              }}
                            />
                            <Bar
                              dataKey="varianceBudget"
                              radius={[0, 10, 10, 0]}
                            >
                              {varianceRows.slice(0, 10).map((row) => (
                                <Cell
                                  key={row.label}
                                  fill={
                                    row.varianceBudget >= 0
                                      ? "#10b981"
                                      : "#f43f5e"
                                  }
                                />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <Badge variant="sky" className="w-fit gap-2">
                        <Layers3 className="h-3.5 w-3.5" />
                        Contribution analysis
                      </Badge>
                      <CardTitle>
                        Revenue mix by {data.contribution.dimensionLabel}
                      </CardTitle>
                      <CardDescription>
                        Click any bar to drill into the next operating level.
                      </CardDescription>
                    </div>
                    <Badge variant="neutral">
                      Active grain: {data.contribution.dimensionLabel}
                    </Badge>
                  </CardHeader>
                  <CardContent>
                    {contributionRows.length === 0 ? (
                      <EmptyState
                        title="No contribution rows are available."
                        description="Widen the filters to bring segment-level mix into view."
                      />
                    ) : (
                      <div className="h-[340px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={contributionRows}
                            onClick={(state) => {
                              const label = state?.activeLabel;
                              if (typeof label === "string") {
                                drillDown(label);
                              }
                            }}
                          >
                            <CartesianGrid
                              strokeDasharray="3 3"
                              stroke="#e2e8f0"
                            />
                            <XAxis
                              dataKey="label"
                              tick={{ fontSize: 11, fill: "#64748b" }}
                              tickFormatter={(value) =>
                                formatRevenueTrendAxisLabel(
                                  String(value),
                                  trendGranularity,
                                  appliedFilters.financialYears[0],
                                )
                              }
                              interval="preserveStartEnd"
                              minTickGap={28}
                              height={48}
                            />
                            <YAxis
                              tick={{ fontSize: 12, fill: "#64748b" }}
                              tickFormatter={formatCurrencyShort}
                            />
                            <RechartsTooltip content={<BreakdownTooltip />} />
                            <Bar
                              dataKey="budget"
                              fill="#0f172a"
                              radius={[8, 8, 0, 0]}
                            />
                            <Bar
                              dataKey="forecast"
                              fill="#38bdf8"
                              radius={[8, 8, 0, 0]}
                            />
                            <Bar
                              dataKey="actual"
                              fill="#10b981"
                              radius={[8, 8, 0, 0]}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-6 2xl:grid-cols-2">
                <Card>
                  <CardHeader>
                    <Badge variant="neutral" className="w-fit gap-2">
                      <Layers3 className="h-3.5 w-3.5" />
                      Heatmap
                    </Badge>
                    <CardTitle>Variance intensity map</CardTitle>
                    <CardDescription>
                      Geography, practice, BDM, or account variance by month.
                      Click a row label to drill into it.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {data.heatmap.yLabels.length === 0 ? (
                      <EmptyState
                        title="Heatmap is waiting for segment-level data."
                        description="Expand the current slice or upload a workbook with populated monthly values."
                      />
                    ) : (
                      <Heatmap
                        xLabels={data.heatmap.xLabels}
                        yLabels={data.heatmap.yLabels}
                        cells={data.heatmap.cells}
                        onRowClick={drillDown}
                      />
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <Badge variant="sky" className="w-fit gap-2">
                      <ArrowRightLeft className="h-3.5 w-3.5" />
                      Waterfall bridge
                    </Badge>
                    <CardTitle>Movement from baseline to current outcome</CardTitle>
                    <CardDescription>
                      Visualizes the biggest drivers behind the selected
                      comparison metric.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {data.waterfall.steps.length === 0 ? (
                      <EmptyState
                        title="Waterfall is not available yet."
                        description="The current slice does not have enough data to build the driver bridge."
                      />
                    ) : (
                      <WaterfallChart steps={data.waterfall.steps} />
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-6 2xl:grid-cols-[minmax(320px,0.78fr)_minmax(0,1.22fr)]">
                <Card>
                  <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <Badge variant="neutral" className="w-fit gap-2">
                        <Orbit className="h-3.5 w-3.5" />
                        Side-by-side compare
                      </Badge>
                      <CardTitle>
                        Compare two {data.contribution.dimensionLabel.toLowerCase()} slices
                      </CardTitle>
                      <CardDescription>
                        Compare KPI levels, sparkline direction, and variance
                        strength without leaving the current drill path.
                      </CardDescription>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Left entity
                        <select
                          value={comparePanels.left}
                          onChange={(event) => setCompareLeftLabel(event.target.value)}
                          className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 outline-none focus:border-sky-400"
                        >
                          {compareOptions.map((option) => (
                            <option key={`left-${option}`} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Right entity
                        <select
                          value={comparePanels.right}
                          onChange={(event) => setCompareRightLabel(event.target.value)}
                          className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 outline-none focus:border-sky-400"
                        >
                          {compareOptions.map((option) => (
                            <option
                              key={`right-${option}`}
                              value={option}
                              disabled={option === comparePanels.left}
                            >
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {sideBySideRows.length < 2 ? (
                      <EmptyState
                        title="Pick two entities to compare."
                        description="Use the selectors above after narrowing the operating slice."
                      />
                    ) : (
                      <div className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <Tabs
                            value={sideBySideChartMode}
                            onValueChange={(value) =>
                              setSideBySideChartMode(value as SideBySideChartMode)
                            }
                          >
                            <TabsList>
                              <TabsTrigger value="bar">Bar</TabsTrigger>
                              <TabsTrigger value="line">Line</TabsTrigger>
                            </TabsList>
                          </Tabs>
                          <p className="text-sm text-slate-500">
                            Grouped by {data.contribution.dimensionLabel.toLowerCase()}
                          </p>
                        </div>
                        <div className="grid gap-4 lg:grid-cols-2">
                          {sideBySideRows.map((panel) => (
                            <div
                              key={panel.label}
                              className="rounded-[24px] border border-slate-200 bg-white/90 px-4 py-4"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-slate-950">
                                    {panel.label}
                                  </p>
                                  <p className="text-xs text-slate-500">
                                    {data.contribution.dimensionLabel} comparison slice
                                  </p>
                                </div>
                                <Badge
                                  variant={
                                    panel.varianceBudget >= 0 ? "emerald" : "rose"
                                  }
                                >
                                  {formatSigned(panel.varianceBudget, "absolute")}
                                </Badge>
                              </div>
                              <div className="mt-4 grid grid-cols-2 gap-3">
                                <div className="rounded-2xl bg-slate-50 px-3 py-3">
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                    Actual
                                  </p>
                                  <p className="mt-2 text-lg font-semibold text-slate-950">
                                    {formatCurrency(panel.actual)}
                                  </p>
                                </div>
                                <div className="rounded-2xl bg-slate-50 px-3 py-3">
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                    Budget
                                  </p>
                                  <p className="mt-2 text-lg font-semibold text-slate-950">
                                    {formatCurrency(panel.budget)}
                                  </p>
                                </div>
                                <div className="rounded-2xl bg-slate-50 px-3 py-3">
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                    Forecast
                                  </p>
                                  <p className="mt-2 text-lg font-semibold text-slate-950">
                                    {formatCurrency(panel.forecast ?? panel.outlook ?? 0)}
                                  </p>
                                </div>
                                <div className="rounded-2xl bg-slate-50 px-3 py-3">
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                    Contribution
                                  </p>
                                  <p className="mt-2 text-lg font-semibold text-slate-950">
                                    {(panel.contributionPct ?? 0).toFixed(1)}%
                                  </p>
                                </div>
                              </div>
                              <div className="mt-4 flex items-center justify-between gap-4">
                                <Sparkline
                                  values={panel.sparkline}
                                  tone={panel.varianceBudget >= 0 ? "positive" : "negative"}
                                />
                                <p className="text-xs leading-5 text-slate-500">
                                  Actual revenue trend across the visible periods.
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4">
                          <div className="h-[280px]">
                            <ResponsiveContainer width="100%" height="100%">
                              {sideBySideChartMode === "bar" ? (
                                <BarChart data={sideBySideRows}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                  <XAxis
                                    dataKey="label"
                                    tick={{ fontSize: 11, fill: "#64748b" }}
                                    tickFormatter={(value) =>
                                      formatRevenueTrendAxisLabel(
                                        String(value),
                                        trendGranularity,
                                        appliedFilters.financialYears[0],
                                      )
                                    }
                                    interval="preserveStartEnd"
                                    minTickGap={28}
                                    height={48}
                                  />
                                  <YAxis
                                    tick={{ fontSize: 12, fill: "#64748b" }}
                                    tickFormatter={formatCurrencyShort}
                                  />
                                  <Legend />
                                  <RechartsTooltip
                                    content={({ active, payload }) => {
                                      const point = payload?.[0]?.payload as
                                        | (typeof sideBySideRows)[number]
                                        | undefined;
                                      if (!active || !point) {
                                        return null;
                                      }
                                      return (
                                        <div className="rounded-[22px] border border-slate-200 bg-white/95 px-4 py-3 shadow-2xl">
                                          <p className="text-sm font-semibold text-slate-950">
                                            {point.label}
                                          </p>
                                          <div className="mt-3 space-y-2 text-xs text-slate-600">
                                            <div className="flex items-center justify-between gap-8">
                                              <span>Budget</span>
                                              <span className="font-semibold text-slate-950">
                                                {formatCurrency(point.budget)}
                                              </span>
                                            </div>
                                            <div className="flex items-center justify-between gap-8">
                                              <span>Actual</span>
                                              <span className="font-semibold text-slate-950">
                                                {formatCurrency(point.actual)}
                                              </span>
                                            </div>
                                            <div className="flex items-center justify-between gap-8">
                                              <span>Forecast</span>
                                              <span className="font-semibold text-slate-950">
                                                {formatCurrency(point.forecast ?? point.outlook ?? 0)}
                                              </span>
                                            </div>
                                            <div className="flex items-center justify-between gap-8">
                                              <span>Variance %</span>
                                              <span className="font-semibold text-slate-950">
                                                {point.variancePct.toFixed(1)}%
                                              </span>
                                            </div>
                                            <div className="flex items-center justify-between gap-8">
                                              <span>Contribution</span>
                                              <span className="font-semibold text-slate-950">
                                                {(point.contributionPct ?? 0).toFixed(1)}%
                                              </span>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    }}
                                  />
                                  {visibleSeries.budget ? (
                                    <Bar
                                      dataKey="budget"
                                      fill={SERIES_META.budget.color}
                                      radius={[8, 8, 0, 0]}
                                    />
                                  ) : null}
                                  {visibleSeries.actual ? (
                                    <Bar
                                      dataKey="actual"
                                      fill={SERIES_META.actual.color}
                                      radius={[8, 8, 0, 0]}
                                    />
                                  ) : null}
                                  {visibleSeries.forecast ? (
                                    <Bar
                                      dataKey="forecast"
                                      fill={SERIES_META.forecast.color}
                                      radius={[8, 8, 0, 0]}
                                    />
                                  ) : null}
                                </BarChart>
                              ) : (
                                <ComposedChart data={sideBySideRows}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                  <XAxis
                                    dataKey="label"
                                    tick={{ fontSize: 11, fill: "#64748b" }}
                                    tickFormatter={(value) =>
                                      formatRevenueTrendAxisLabel(
                                        String(value),
                                        trendGranularity,
                                        appliedFilters.financialYears[0],
                                      )
                                    }
                                    interval="preserveStartEnd"
                                    minTickGap={28}
                                    height={48}
                                  />
                                  <YAxis
                                    tick={{ fontSize: 12, fill: "#64748b" }}
                                    tickFormatter={formatCurrencyShort}
                                  />
                                  <Legend />
                                  <RechartsTooltip content={<BreakdownTooltip />} />
                                  {visibleSeries.budget ? (
                                    <Line
                                      type="monotone"
                                      dataKey="budget"
                                      stroke={SERIES_META.budget.color}
                                      strokeWidth={2.4}
                                      dot={{ r: 4 }}
                                    />
                                  ) : null}
                                  {visibleSeries.actual ? (
                                    <Line
                                      type="monotone"
                                      dataKey="actual"
                                      stroke={SERIES_META.actual.color}
                                      strokeWidth={2.8}
                                      dot={{ r: 4 }}
                                    />
                                  ) : null}
                                  {visibleSeries.forecast ? (
                                    <Line
                                      type="monotone"
                                      dataKey="forecast"
                                      stroke={SERIES_META.forecast.color}
                                      strokeWidth={2.4}
                                      strokeDasharray="5 5"
                                      dot={{ r: 4 }}
                                    />
                                  ) : null}
                                </ComposedChart>
                              )}
                            </ResponsiveContainer>
                          </div>
                        </div>
                        <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-4 py-4">
                          <table className="min-w-full border-collapse text-left text-sm">
                            <thead className="sticky top-0 z-10 bg-slate-50">
                              <tr className="border-b border-slate-200 text-xs uppercase tracking-[0.18em] text-slate-500">
                                <th className="px-2 py-3">Metric</th>
                                {sideBySideRows.map((panel) => (
                                  <th key={`compare-head-${panel.label}`} className="px-2 py-3 text-right">
                                    {panel.label}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              <tr className="border-b border-slate-100">
                                <td className="px-2 py-3 font-medium text-slate-600">Actual</td>
                                {sideBySideRows.map((panel) => (
                                  <td key={`actual-${panel.label}`} className="px-2 py-3 text-right font-semibold text-slate-950">
                                    {formatCurrency(panel.actual)}
                                  </td>
                                ))}
                              </tr>
                              <tr className="border-b border-slate-100">
                                <td className="px-2 py-3 font-medium text-slate-600">Variance vs Budget</td>
                                {sideBySideRows.map((panel) => (
                                  <td
                                    key={`var-budget-${panel.label}`}
                                    className={cn(
                                      "px-2 py-3 text-right font-semibold",
                                      panel.varianceBudget >= 0
                                        ? "text-emerald-600"
                                        : "text-rose-600",
                                    )}
                                  >
                                    {formatCurrency(panel.varianceBudget)}
                                  </td>
                                ))}
                              </tr>
                              <tr>
                                <td className="px-2 py-3 font-medium text-slate-600">Variance vs Forecast</td>
                                {sideBySideRows.map((panel) => (
                                  <td
                                    key={`var-forecast-${panel.label}`}
                                    className={cn(
                                      "px-2 py-3 text-right font-semibold",
                                      panel.varianceForecast >= 0
                                        ? "text-emerald-600"
                                        : "text-rose-600",
                                    )}
                                  >
                                    {formatCurrency(panel.varianceForecast)}
                                  </td>
                                ))}
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="space-y-4">
                    <div className="space-y-2">
                      <Badge variant="sky" className="w-fit gap-2">
                        <BrainCircuit className="h-3.5 w-3.5" />
                        Explain change
                      </Badge>
                      <CardTitle>Focused variance explanation</CardTitle>
                      <CardDescription>
                        Select a row in the working table to see the previous
                        baseline, current delta, and likely driver in plain English.
                      </CardDescription>
                    </div>
                    <Tabs
                      value={performerTab}
                      onValueChange={(value) =>
                        setPerformerTab(value as "top" | "bottom")
                      }
                    >
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="top">Top movers</TabsTrigger>
                        <TabsTrigger value="bottom">Bottom movers</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {explainChange ? (
                      <>
                        <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-4 py-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Focus entity
                          </p>
                          <p className="mt-2 text-lg font-semibold text-slate-950">
                            {explainChange.label}
                          </p>
                          <p className="mt-3 text-sm leading-6 text-slate-600">
                            {explainChange.explanation}
                          </p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                              Actual
                            </p>
                            <p className="mt-2 text-xl font-semibold text-slate-950">
                              {formatCurrency(explainChange.actual)}
                            </p>
                          </div>
                          <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                              Baseline
                            </p>
                            <p className="mt-2 text-xl font-semibold text-slate-950">
                              {formatCurrency(explainChange.previousValue)}
                            </p>
                          </div>
                          <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                              Change
                            </p>
                            <p
                              className={cn(
                                "mt-2 text-xl font-semibold",
                                explainChange.changeAmount >= 0
                                  ? "text-emerald-600"
                                  : "text-rose-600",
                              )}
                            >
                              {formatCurrency(explainChange.changeAmount)}
                            </p>
                          </div>
                          <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                              Biggest contributor
                            </p>
                            <p className="mt-2 text-xl font-semibold text-slate-950">
                              {explainChange.contributor}
                            </p>
                          </div>
                        </div>
                      </>
                    ) : (
                      <EmptyState
                        title="Select a row to explain the change."
                        description="The explainer activates when someone clicks a row in the table below."
                      />
                    )}
                    <div className="rounded-[24px] border border-slate-200 bg-white/90 px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        {performerTab === "top" ? "Top movers" : "Bottom movers"}
                      </p>
                      <div className="mt-3 space-y-2">
                        {performerRows.slice(0, 5).map((row) => (
                          <button
                            key={`${row.label}-${row.account}`}
                            type="button"
                            onClick={() => setFocusLabel(row.label)}
                            className="flex w-full items-center justify-between rounded-2xl border border-slate-200 px-3 py-3 text-left hover:border-sky-300"
                          >
                            <div>
                              <p className="text-sm font-semibold text-slate-950">
                                {row.label}
                              </p>
                              <p className="text-xs text-slate-500">
                                {row.region} / {row.practiceHead}
                              </p>
                            </div>
                            <span
                              className={cn(
                                "text-sm font-semibold",
                                row.variance >= 0
                                  ? "text-emerald-600"
                                  : "text-rose-600",
                              )}
                            >
                              {formatCurrency(row.variance)}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <Badge variant="sky" className="w-fit gap-2">
                      <Table2 className="h-3.5 w-3.5" />
                      Comparison matrix
                    </Badge>
                    <CardTitle>Operational comparison matrix</CardTitle>
                    <CardDescription>
                      Search, sort, expand, and export the current slice. This
                      table is meant for weekly operating review, not just summary viewing.
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        value={tableSearch}
                        onChange={(event) => setTableSearch(event.target.value)}
                        placeholder="Search geography, practice, BDM, or account"
                        className="w-72 pl-9"
                      />
                    </div>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="secondary">
                          <SlidersHorizontal className="h-4 w-4" />
                          Columns
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-60">
                        <div className="space-y-3">
                          <p className="text-sm font-semibold text-slate-950">
                            Visible columns
                          </p>
                          {(Object.entries(visibleColumns) as Array<
                            [TableColumnKey, boolean]
                          >).map(([column, enabled]) => (
                            <label
                              key={column}
                              className="flex items-center justify-between gap-3 text-sm text-slate-600"
                            >
                              <span>{column.replace(/([A-Z])/g, " $1")}</span>
                              <input
                                type="checkbox"
                                checked={enabled}
                                onChange={() => toggleColumn(column)}
                                className="h-4 w-4 rounded border-slate-300"
                              />
                            </label>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                    <Button variant="secondary" onClick={exportCsv}>
                      <Download className="h-4 w-4" />
                      Export CSV
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex gap-2">
                      {(["variance", "actual", "budget"] as PerformerSortKey[]).map(
                        (key) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setPerformerSortKey(key)}
                            className={cn(
                              "rounded-full border px-3 py-1.5 text-xs font-semibold capitalize",
                              performerSortKey === key
                                ? "border-slate-950 bg-slate-950 text-white"
                                : "border-slate-200 bg-white text-slate-600",
                            )}
                          >
                            Sort by {key}
                          </button>
                        ),
                      )}
                    </div>
                    <p className="text-sm text-slate-500">
                      {tableRows.length} rows in the current slice
                    </p>
                  </div>
                  {tableRows.length === 0 ? (
                    <EmptyState
                      title="No table rows are available."
                      description="Broaden the filters or change the drill path to bring data into the table."
                    />
                  ) : (
                    <TableFullscreenShell
                      title="Operational comparison matrix"
                      description="Open the current comparison matrix in a full-page table view."
                      className="max-h-[560px] rounded-[24px] border border-slate-200"
                    >
                      <table className="min-w-full border-collapse text-left text-sm">
                        <thead className="sticky top-0 z-10 bg-slate-50">
                          <tr className="border-b border-slate-200 text-xs uppercase tracking-[0.18em] text-slate-500">
                            <th className="px-4 py-3">Entity</th>
                            {visibleColumns.geography ? (
                              <th className="px-4 py-3">Geography</th>
                            ) : null}
                            {visibleColumns.practice ? (
                              <th className="px-4 py-3">Practice</th>
                            ) : null}
                            {visibleColumns.bdm ? (
                              <th className="px-4 py-3">BDM</th>
                            ) : null}
                            {visibleColumns.budget ? (
                              <th className="px-4 py-3 text-right">Budget</th>
                            ) : null}
                            {visibleColumns.actual ? (
                              <th className="px-4 py-3 text-right">Actual</th>
                            ) : null}
                            {visibleColumns.forecast ? (
                              <th className="px-4 py-3 text-right">Forecast</th>
                            ) : null}
                            {visibleColumns.varianceBudget ? (
                              <th className="px-4 py-3 text-right">Var vs Budget</th>
                            ) : null}
                            {visibleColumns.varianceForecast ? (
                              <th className="px-4 py-3 text-right">Var vs Forecast</th>
                            ) : null}
                            {visibleColumns.variancePct ? (
                              <th className="px-4 py-3 text-right">% Var</th>
                            ) : null}
                            {visibleColumns.contribution ? (
                              <th className="px-4 py-3 text-right">Contribution</th>
                            ) : null}
                            {visibleColumns.trend ? (
                              <th className="px-4 py-3 text-right">Trend</th>
                            ) : null}
                          </tr>
                        </thead>
                        <tbody>
                          {tableRows.map((row) => {
                            const isExpanded = expandedLabels.includes(row.label);
                            const isFocused = focusLabel === row.label;
                            return (
                              <Fragment key={`${row.label}-${row.account}`}>
                                <tr
                                  className={cn(
                                    "border-b border-slate-100 align-top",
                                    isFocused ? "bg-sky-50/70" : "bg-white",
                                  )}
                                >
                                  <td className="px-4 py-3">
                                    <button
                                      type="button"
                                      onClick={() => toggleExpandedRow(row.label)}
                                      className="flex items-start gap-3 text-left"
                                    >
                                      <ChevronRight
                                        className={cn(
                                          "mt-0.5 h-4 w-4 text-slate-400 transition-transform",
                                          isExpanded ? "rotate-90" : "",
                                        )}
                                      />
                                      <div>
                                        <p className="font-semibold text-slate-950">
                                          {row.label}
                                        </p>
                                        <p className="text-xs text-slate-500">
                                          {row.account}
                                        </p>
                                      </div>
                                    </button>
                                  </td>
                                  {visibleColumns.geography ? (
                                    <td className="px-4 py-3 text-slate-600">{row.region}</td>
                                  ) : null}
                                  {visibleColumns.practice ? (
                                    <td className="px-4 py-3 text-slate-600">{row.practiceHead}</td>
                                  ) : null}
                                  {visibleColumns.bdm ? (
                                    <td className="px-4 py-3 text-slate-600">{row.bdm}</td>
                                  ) : null}
                                  {visibleColumns.budget ? (
                                    <td className="px-4 py-3 text-right font-medium text-slate-700">
                                      {formatCurrency(row.budget)}
                                    </td>
                                  ) : null}
                                  {visibleColumns.actual ? (
                                    <td className="px-4 py-3 text-right font-medium text-slate-700">
                                      {formatCurrency(row.actual)}
                                    </td>
                                  ) : null}
                                  {visibleColumns.forecast ? (
                                    <td className="px-4 py-3 text-right font-medium text-slate-700">
                                      {formatCurrency(row.forecast)}
                                    </td>
                                  ) : null}
                                  {visibleColumns.varianceBudget ? (
                                    <td
                                      className={cn(
                                        "px-4 py-3 text-right font-semibold",
                                        row.varianceBudget >= 0
                                          ? "text-emerald-600"
                                          : "text-rose-600",
                                      )}
                                    >
                                      {formatCurrency(row.varianceBudget)}
                                    </td>
                                  ) : null}
                                  {visibleColumns.varianceForecast ? (
                                    <td
                                      className={cn(
                                        "px-4 py-3 text-right font-semibold",
                                        row.varianceForecast >= 0
                                          ? "text-emerald-600"
                                          : "text-rose-600",
                                      )}
                                    >
                                      {formatCurrency(row.varianceForecast)}
                                    </td>
                                  ) : null}
                                  {visibleColumns.variancePct ? (
                                    <td className="px-4 py-3 text-right text-slate-700">
                                      {row.variancePctBudget.toFixed(1)}%
                                    </td>
                                  ) : null}
                                  {visibleColumns.contribution ? (
                                    <td className="px-4 py-3 text-right text-slate-700">
                                      {row.contributionPct.toFixed(1)}%
                                    </td>
                                  ) : null}
                                  {visibleColumns.trend ? (
                                    <td className="px-4 py-3">
                                      <div className="flex justify-end">
                                        <Sparkline values={row.sparkline} tone={row.tone} />
                                      </div>
                                    </td>
                                  ) : null}
                                </tr>
                                {isExpanded ? (
                                  <tr className="border-b border-slate-100 bg-slate-50/80">
                                    <td colSpan={visibleColumnCount} className="px-4 py-4">
                                      <div className="grid gap-4 md:grid-cols-4">
                                        <div>
                                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                            Account
                                          </p>
                                          <p className="mt-2 text-sm font-medium text-slate-950">
                                            {row.account}
                                          </p>
                                        </div>
                                        <div>
                                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                            Geography / Practice
                                          </p>
                                          <p className="mt-2 text-sm font-medium text-slate-950">
                                            {row.region} / {row.practiceHead}
                                          </p>
                                        </div>
                                        <div>
                                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                            BDM
                                          </p>
                                          <p className="mt-2 text-sm font-medium text-slate-950">
                                            {row.bdm}
                                          </p>
                                        </div>
                                        <div>
                                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                            Narrative
                                          </p>
                                          <p className="mt-2 text-sm leading-6 text-slate-600">
                                            {row.actual >= row.budget
                                              ? "Actual is currently ahead of budget for this slice."
                                              : "Actual is trailing budget for this slice and should be reviewed with the owning team."}
                                          </p>
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                ) : null}
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </TableFullscreenShell>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
