"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
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
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BarChart3,
  Download,
  LoaderCircle,
  MessageSquare,
  Search,
  Sparkles,
  Table2,
  X,
} from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";

import { TableFullscreenShell } from "@/components/table-fullscreen-shell";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDrillDown } from "@/hooks/useDrillDown";
import {
  buildRapidRevenueSearch,
  readRapidRevenueFiltersFromSearch,
  type RevenueDataMeta,
  type RevenueMetaReason,
  type RevenueComparisonResponse,
} from "@/lib/rapid-revenue";
import {
  mergeDrillDownFilters,
  normalizeDrillDownFilters,
  type DrillDownContext,
} from "@/lib/drilldown";
import { appendSharedWorkspaceSearch } from "@/lib/workspace-search";

export type BirdeyeAnalyticsKioskProps = {
  variant?: "kiosk" | "dashboard";
  showRestrictedRoleBudgets?: boolean;
};

type ChartKind = "bar" | "hbar" | "line" | "area" | "donut" | "pie" | "treemap";
type ViewMode = "table" | "graph";
type TableDataMode = "compare" | "budgetOnly" | "matrix";
type RevenueRow = RevenueComparisonResponse["rows"][number];
type ChartClickState = {
  name?: string;
  value?: number | [number, number];
  payload?: Record<string, unknown>;
} | null;
type ChartTooltipPayloadEntry = {
  name?: string | number;
  value?: string | number;
  color?: string;
};
type ChartTooltipProps = {
  active?: boolean;
  label?: string | number;
  payload?: ChartTooltipPayloadEntry[];
};
type ChartHoverMetric = {
  name: string;
  value: number;
  color?: string;
};
type ChartHoverSnapshot = {
  label: string;
  metrics: ChartHoverMetric[];
};
type RawDrilldownFilters = Record<string, string[]>;
type RawDrilldownFiltersByLabel = Record<string, RawDrilldownFilters>;

type AnalyticsTableRow = {
  label: string;
  budget: number;
  forecast: number;
  actual: number;
  varianceForecastVsActual: number;
  variancePctForecastVsActual: number;
};

type QuarterMatrixRow = {
  label: string;
  apr: number;
  may: number;
  jun: number;
  q1: number;
};

type AnalyticsTable = {
  id: string;
  title: string;
  rowHeader: string;
  chartKind: ChartKind;
  dataMode: TableDataMode;
  rows: AnalyticsTableRow[];
  matrixRows?: QuarterMatrixRow[];
  description?: string;
  isCustomerTable?: boolean;
  rawDrilldownFiltersByLabel?: RawDrilldownFiltersByLabel;
};

type TableDefinition = {
  id: string;
  title: string;
  rowHeader: string;
  chartKind: ChartKind;
  dataMode?: Exclude<TableDataMode, "matrix">;
  resolveLabel: (row: RevenueComparisonResponse["rows"][number]) => string;
  allowRow?: (row: RevenueComparisonResponse["rows"][number]) => boolean;
  description?: string;
  isCustomerTable?: boolean;
  includeComparableOnly?: boolean;
  expectedLabels?: string[];
  onlyExpectedLabels?: boolean;
};

type CommentDialogState = {
  tableId: string;
  tableTitle: string;
  rowLabel: string;
  variancePercent: number;
  comment: string;
};

type VarianceCommentRow = {
  tableId: string;
  rowLabel: string;
  comment: string;
};

type DrillDownMetric = "budget" | "forecast" | "actual" | "variance";
type TableExportFormat = "csv" | "xlsx";

type AnalyticalInsightState = {
  tableId: string;
  tableTitle: string;
  loading: boolean;
  content: string;
  error: string | null;
  generatedAt: string | null;
} | null;

const CORPORATE_COLORS = [
  "#0A2342",
  "#165C7D",
  "#0E8A8A",
  "#2E7D32",
  "#D97706",
  "#B91C1C",
] as const;
const CUSTOMER_EE_COLORS = [
  "#0A2342",
  "#0F4C81",
  "#1A5F7A",
  "#165C7D",
  "#2D6A8A",
  "#3B7A57",
] as const;
const MATRIX_COLORS = {
  apr: "#0A2342",
  may: "#0E8A8A",
  jun: "#D97706",
  q1: "#B91C1C",
};
const HOVER_METRIC_COLORS = {
  budget: "#0f4c81",
  forecast: "#0ea5a4",
  actual: "#1d4ed8",
  variance: "#475569",
};
const MONTH_SEQUENCE = [
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
const EMPTY_PAYLOAD: RevenueComparisonResponse = {
  database: {
    status: "offline",
    message: "Comparison data is unavailable.",
  },
  financialYear: "",
  comparisonMonth: "Apr",
  summary: {
    rowCount: 0,
    budget: 0,
    forecast: 0,
    actual: 0,
    varianceVsBudget: 0,
    varianceVsForecast: 0,
  },
  rows: [],
};
type AnalyticsLoadState = {
  dataState: "fresh" | "stale" | "fallback";
  reason?: RevenueMetaReason;
  message: string;
  lastSuccessAt?: string | null;
  resolvedPeriodLabel?: string | null;
};

function toNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : Number(value ?? 0) || 0;
}

function toText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeKey(value: string) {
  return toText(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function areHoverSnapshotsEqual(
  left: ChartHoverSnapshot | null,
  right: ChartHoverSnapshot | null,
) {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  if (left.label !== right.label || left.metrics.length !== right.metrics.length) {
    return false;
  }
  return left.metrics.every((metric, index) => {
    const other = right.metrics[index];
    return (
      metric.name === other?.name &&
      metric.value === other?.value &&
      metric.color === other?.color
    );
  });
}

function mapHttpStatusReason(statusCode: number): RevenueMetaReason {
  if (statusCode === 401) {
    return "unauthorized";
  }
  if (statusCode === 403) {
    return "forbidden";
  }
  if (statusCode === 408 || statusCode === 504) {
    return "timeout";
  }
  return "backend_unavailable";
}

function formatResolvedPeriod(meta: RevenueDataMeta | null | undefined) {
  const resolved = meta?.resolvedPeriod;
  if (!resolved) {
    return null;
  }
  const from = toText(resolved.periodFrom).slice(0, 3);
  const to = toText(resolved.periodTo).slice(0, 3);
  if (from && to && from !== to) {
    return `${from} - ${to}`;
  }
  return from || to || null;
}

function buildLoadState(
  meta: RevenueDataMeta | null | undefined,
  overrideReason?: RevenueMetaReason,
): AnalyticsLoadState | null {
  const reason = overrideReason ?? meta?.reason;
  const dataState = meta?.dataState ?? "fallback";
  if (reason === "no_data_period") {
    const resolvedPeriodLabel = formatResolvedPeriod(meta);
    return {
      dataState: "fresh",
      reason,
      message: resolvedPeriodLabel
        ? `Selected period has no actuals. Showing YTD ${resolvedPeriodLabel}.`
        : "Selected period has no actuals. Showing latest available YTD actuals.",
      lastSuccessAt: meta?.lastSuccessAt ?? null,
      resolvedPeriodLabel,
    };
  }

  if (dataState === "fresh" && !reason) {
    return null;
  }

  if (reason === "unauthorized") {
    return {
      dataState,
      reason,
      message: "Session expired. Sign in again to refresh analytics.",
      lastSuccessAt: meta?.lastSuccessAt ?? null,
      resolvedPeriodLabel: formatResolvedPeriod(meta),
    };
  }
  if (reason === "forbidden") {
    return {
      dataState,
      reason,
      message: "Access scope changed. You no longer have permission for this analytics view.",
      lastSuccessAt: meta?.lastSuccessAt ?? null,
      resolvedPeriodLabel: formatResolvedPeriod(meta),
    };
  }
  if (reason === "timeout") {
    return {
      dataState,
      reason,
      message: "Request timed out. Showing the latest successful analytics snapshot.",
      lastSuccessAt: meta?.lastSuccessAt ?? null,
      resolvedPeriodLabel: formatResolvedPeriod(meta),
    };
  }
  return {
    dataState,
    reason: reason ?? "backend_unavailable",
    message:
      dataState === "fallback"
        ? "Backend is unavailable and no cached analytics snapshot was found."
        : "Backend is unavailable. Showing the latest successful analytics snapshot.",
    lastSuccessAt: meta?.lastSuccessAt ?? null,
    resolvedPeriodLabel: formatResolvedPeriod(meta),
  };
}

function resolveDrillDownMetric(
  table: AnalyticsTable,
  label: string,
  metric: DrillDownMetric,
  value: number,
) {
  if (table.dataMode === "budgetOnly" || table.dataMode === "matrix") {
    return { metric, value };
  }

  const row = table.rows.find((item) => normalizeKey(item.label) === normalizeKey(label));
  if (!row) {
    return { metric, value };
  }

  const budget = toNumber(row.budget);
  const forecast = toNumber(row.forecast);
  const actual = toNumber(row.actual);
  const hasBudget = budget !== 0;
  const hasForecast = forecast !== 0;
  const hasActual = actual !== 0;

  if (metric === "budget" && !hasBudget && hasActual) {
    return { metric: "actual" as const, value: actual };
  }
  if (metric === "actual" && !hasActual && hasBudget) {
    return { metric: "budget" as const, value: budget };
  }
  if (metric === "forecast" && !hasForecast) {
    if (hasActual) {
      return { metric: "actual" as const, value: actual };
    }
    if (hasBudget) {
      return { metric: "budget" as const, value: budget };
    }
  }
  if (metric === "variance") {
    if (hasActual && !hasBudget) {
      return { metric: "actual" as const, value: actual };
    }
    if (hasBudget && !hasActual) {
      return { metric: "budget" as const, value: budget };
    }
  }

  return { metric, value };
}

function normalizeMsps(value: string) {
  const compact = normalizeKey(value);
  if (compact.startsWith("ms")) {
    return "MS";
  }
  if (compact.startsWith("ps")) {
    return "PS";
  }
  return toText(value) || "Unassigned";
}

function normalizeGeography(value: string) {
  const normalized = toText(value).toUpperCase().replace(/[^A-Z]/g, "");
  if (!normalized) {
    return "Unassigned";
  }
  if (
    normalized === "US" ||
    normalized === "USA" ||
    normalized.startsWith("US") ||
    normalized === "UNITEDSTATES" ||
    normalized === "UNITEDSTATESOFAMERICA" ||
    normalized === "NORTHAMERICA"
  ) {
    return "US";
  }
  if (normalized === "ROW" || normalized === "RESTOFWORLD") {
    return "ROW";
  }
  return normalized;
}

function normalizeRowUs(value: string) {
  if (!toText(value)) {
    return "Unassigned";
  }
  const normalized = normalizeGeography(value);
  if (normalized === "US") {
    return "US";
  }
  return "ROW";
}

function normalizeVertical(value: string) {
  const text = toText(value);
  if (!text) {
    return "TBD";
  }
  const compact = text.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (compact === "its" || compact === "na") {
    return "TBD";
  }
  return text;
}

function normalizeStrategic(value: string) {
  const text = toText(value).toLowerCase();
  if (!text) {
    return "Unassigned";
  }
  if (
    text === "y" ||
    text === "yes" ||
    text === "1" ||
    text === "true" ||
    text.includes("yes")
  ) {
    return "Yes";
  }
  if (text === "n" || text === "no" || text === "0" || text === "false" || text.includes("no")) {
    return "No";
  }
  return "Unassigned";
}

function normalizeEeennn(value: string) {
  const text = toText(value).toUpperCase();
  if (text.startsWith("EE")) {
    return "EE";
  }
  if (text.startsWith("EN")) {
    return "EN";
  }
  if (text.startsWith("NN")) {
    return "NN";
  }
  return text || "Unassigned";
}

function normalizeDealType(value: string) {
  const text = toText(value);
  if (!text) {
    return "Unassigned";
  }
  const key = normalizeKey(text);
  if (key.includes("exist")) {
    return "Existing";
  }
  if (key.includes("renew")) {
    return "Renewal";
  }
  if (key.includes("new") || key.includes("growth")) {
    return "New";
  }
  return text;
}

function resolvePeriodMonths(periodFrom: string, periodTo: string) {
  const from = _resolveMonthIndex(periodFrom);
  const to = _resolveMonthIndex(periodTo);
  if (from < 0 || to < 0) {
    return [];
  }
  if (from <= to) {
    return MONTH_SEQUENCE.slice(from, to + 1);
  }
  return [...MONTH_SEQUENCE.slice(from), ...MONTH_SEQUENCE.slice(0, to + 1)];
}

function _resolveMonthIndex(value: string) {
  const shortMonth = toText(value).slice(0, 3);
  return MONTH_SEQUENCE.findIndex((month) => month === shortMonth);
}

function pushUniqueRawFilterValue(filters: RawDrilldownFilters, key: string, value: unknown) {
  const text = toText(value);
  if (!text) {
    return;
  }
  const existing = filters[key] ?? [];
  if (existing.some((item) => normalizeKey(item) === normalizeKey(text))) {
    return;
  }
  existing.push(text);
  filters[key] = existing;
}

function serializeRawDrilldownFilters(
  byLabel: Map<string, RawDrilldownFilters>,
): RawDrilldownFiltersByLabel {
  const output: RawDrilldownFiltersByLabel = {};
  for (const [labelKey, filters] of byLabel.entries()) {
    if (Object.keys(filters).length > 0) {
      output[labelKey] = filters;
    }
  }
  return output;
}

function collectRawDrilldownFiltersForTableRow(
  tableId: string,
  labelKey: string,
  row: RevenueRow,
  byLabel: Map<string, RawDrilldownFilters>,
) {
  const filters = byLabel.get(labelKey) ?? {};
  switch (tableId) {
    case "msps-budget":
      pushUniqueRawFilterValue(filters, "ms_ps", row.msps);
      break;
    case "row-us":
      pushUniqueRawFilterValue(filters, "row_us", row.geography);
      break;
    case "strategic-account":
      pushUniqueRawFilterValue(filters, "strategic_account", row.strategicAccount);
      break;
    case "deal-type":
      pushUniqueRawFilterValue(filters, "deal_type", row.dealType);
      break;
    case "eeennn":
      pushUniqueRawFilterValue(filters, "eeennn", row.eeennn);
      break;
    case "company":
      pushUniqueRawFilterValue(filters, "entity", row.entity);
      break;
    case "hi-vertical":
      pushUniqueRawFilterValue(filters, "vertical", row.vertical);
      break;
    case "bdm-strategic-yes":
    case "bdm-strategic-no":
      pushUniqueRawFilterValue(filters, "bdm", row.bdm);
      pushUniqueRawFilterValue(filters, "strategic_account", row.strategicAccount);
      break;
    case "customer-ms":
      if (toText(row.customerDimension)) {
        pushUniqueRawFilterValue(filters, "customer_dimension", row.customerDimension);
      } else if (toText(row.groupCompany)) {
        pushUniqueRawFilterValue(filters, "group_company", row.groupCompany);
      } else if (toText(row.customerName)) {
        pushUniqueRawFilterValue(filters, "customer_name", row.customerName);
      }
      pushUniqueRawFilterValue(filters, "ms_ps", row.msps);
      break;
    case "customer-name-ms":
      if (toText(row.customerName)) {
        pushUniqueRawFilterValue(filters, "customer_name", row.customerName);
      }
      pushUniqueRawFilterValue(filters, "ms_ps", row.msps);
      break;
    case "customer-ee":
      if (toText(row.customerDimension)) {
        pushUniqueRawFilterValue(filters, "customer_dimension", row.customerDimension);
      } else if (toText(row.groupCompany)) {
        pushUniqueRawFilterValue(filters, "group_company", row.groupCompany);
      } else if (toText(row.customerName)) {
        pushUniqueRawFilterValue(filters, "customer_name", row.customerName);
      }
      pushUniqueRawFilterValue(filters, "eeennn", row.eeennn);
      break;
    case "bdm-company":
      pushUniqueRawFilterValue(filters, "entity", row.entity);
      pushUniqueRawFilterValue(filters, "bdm", row.bdm);
      break;
    default:
      break;
  }
  if (Object.keys(filters).length > 0) {
    byLabel.set(labelKey, filters);
  }
}

function buildTableSpecificFilters(table: AnalyticsTable, label: string) {
  const normalizedLabel = toText(label);
  switch (table.id) {
    case "msps-budget":
      return { ms_ps: normalizeMsps(normalizedLabel) };
    case "row-us":
      return normalizeRowUs(normalizedLabel) === "US"
        ? { row_us: ["US", "USA", "USN", "USW", "USE", "USS", "USC"] }
        : { row_us: "ROW" };
    case "strategic-account":
      return { strategic_account: normalizeStrategic(normalizedLabel) };
    case "deal-type":
      return { deal_type: normalizeDealType(normalizedLabel) };
    case "eeennn":
      return { eeennn: normalizeEeennn(normalizedLabel) };
    case "company":
      return normalizedLabel ? { entity: normalizedLabel } : {};
    case "hi-vertical":
      return normalizeVertical(normalizedLabel) === "TBD"
        ? { vertical: ["TBD", "ITS", "#N/A", "N/A", "NA"] }
        : { vertical: normalizedLabel };
    case "bdm-strategic-yes":
      return { bdm: normalizedLabel, strategic_account: "Yes" };
    case "bdm-strategic-no":
      return { bdm: normalizedLabel, strategic_account: "No" };
    case "customer-ms":
      return { customer_dimension: normalizedLabel, ms_ps: "MS" };
    case "customer-name-ms":
      return { customer_name: normalizedLabel, ms_ps: "MS" };
    case "customer-ee":
      return { customer_dimension: normalizedLabel, eeennn: "EE" };
    case "bdm-company": {
      const [entity, bdm] = normalizedLabel.split("/").map((value) => toText(value));
      if (entity && bdm) {
        return { entity, bdm };
      }
      if (entity) {
        return { entity };
      }
      if (bdm) {
        return { bdm };
      }
      return {};
    }
    case "q1-eeennn-ms":
      return { eeennn: normalizedLabel, ms_ps: "MS", month: ["Apr", "May", "Jun"] };
    case "q1-eeennn-ps":
      return { eeennn: normalizedLabel, ms_ps: "PS", month: ["Apr", "May", "Jun"] };
    default:
      return {};
  }
}

function buildRawAwareTableFilters(table: AnalyticsTable, label: string) {
  const labelKey = normalizeKey(label);
  const rawFilters = table.rawDrilldownFiltersByLabel?.[labelKey];
  if (!rawFilters) {
    return buildTableSpecificFilters(table, label);
  }
  return normalizeDrillDownFilters(rawFilters);
}

function isMs(value: string) {
  return normalizeKey(value).startsWith("ms");
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatExactCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
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

function formatCompactMillions(value: number) {
  const millions = value / 1_000_000;
  const absMillions = Math.abs(millions);
  const digits = absMillions >= 100 ? 0 : absMillions >= 10 ? 1 : 2;
  return `${millions.toFixed(digits)}m`;
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

function buildVisibleTableExportRows(options: {
  table: AnalyticsTable;
  hideBudget: boolean;
  financialYear: string;
  actualsLabel: string;
}) {
  const { table, hideBudget, financialYear, actualsLabel } = options;
  if (table.dataMode === "matrix") {
    const headers = [table.rowHeader, "Apr", "May", "Jun", "Q1"];
    const rows = (table.matrixRows ?? []).map((row) => ({
      [table.rowHeader]: row.label,
      Apr: row.apr,
      May: row.may,
      Jun: row.jun,
      Q1: row.q1,
    }));
    return { headers, rows };
  }

  const isBudgetOnly = table.dataMode === "budgetOnly";
  const headers = [table.rowHeader];
  if (!hideBudget) {
    headers.push(`Budget FY ${financialYear}`);
  }
  if (!isBudgetOnly) {
    headers.push(`Forecast FY ${financialYear}`);
    headers.push(`Actuals YTD through ${actualsLabel}`);
    headers.push(hideBudget ? "Variance (Actuals - Forecast)" : "Variance (Actuals - Budget)");
  }

  const rows = table.rows.map((row) => {
    const rowData: Record<string, string | number> = {
      [table.rowHeader]: row.label,
    };
    if (!hideBudget) {
      rowData[`Budget FY ${financialYear}`] = row.budget;
    }
    if (!isBudgetOnly) {
      rowData[`Forecast FY ${financialYear}`] = row.forecast;
      rowData[`Actuals YTD through ${actualsLabel}`] = row.actual;
      rowData[hideBudget ? "Variance (Actuals - Forecast)" : "Variance (Actuals - Budget)"] =
        hideBudget ? row.actual - row.forecast : row.varianceForecastVsActual;
    }
    return rowData;
  });
  return { headers, rows };
}

function resolveKioskPath(pathname: string) {
  if (pathname.startsWith("/practice-head")) {
    return "/practice-head/analytics-kiosk";
  }
  if (pathname.startsWith("/buh")) {
    return "/buh/analytics-kiosk";
  }
  if (pathname.startsWith("/bdm")) {
    return "/bdm/analytics-kiosk";
  }
  if (pathname.startsWith("/geo-head")) {
    return "/geo-head/analytics-kiosk";
  }
  return "/executive/slicer";
}

const TABLE_DEFINITIONS: TableDefinition[] = [
  {
    id: "msps-budget",
    title: "FY by MS/PS Budget",
    rowHeader: "MS/PS Budget",
    chartKind: "line",
    dataMode: "compare",
    resolveLabel: (row) => normalizeMsps(row.msps),
    includeComparableOnly: false,
    expectedLabels: ["MS", "PS"],
    onlyExpectedLabels: true,
  },
  {
    id: "row-us",
    title: "FY by ROW/US",
    rowHeader: "ROW/US",
    chartKind: "line",
    dataMode: "compare",
    resolveLabel: (row) => normalizeRowUs(row.geography),
    includeComparableOnly: false,
    expectedLabels: ["ROW", "US"],
    onlyExpectedLabels: true,
  },
  {
    id: "strategic-account",
    title: "FY by Strategic Account",
    rowHeader: "Strategic Account",
    chartKind: "line",
    dataMode: "compare",
    resolveLabel: (row) => normalizeStrategic(row.strategicAccount),
    expectedLabels: ["Yes", "No"],
    onlyExpectedLabels: true,
  },
  {
    id: "deal-type",
    title: "FY by Deal Type",
    rowHeader: "Deal Type",
    chartKind: "bar",
    dataMode: "budgetOnly",
    resolveLabel: (row) => normalizeDealType(row.dealType),
    expectedLabels: ["Existing", "Renewal", "New"],
    onlyExpectedLabels: true,
    description:
      "Budget-only view for Existing, Renewal, and New deal types.",
  },
  {
    id: "eeennn",
    title: "FY by EEENNN",
    rowHeader: "EEENNN",
    chartKind: "bar",
    dataMode: "compare",
    resolveLabel: (row) => normalizeEeennn(row.eeennn),
    includeComparableOnly: false,
    expectedLabels: ["EE", "EN", "NN"],
    onlyExpectedLabels: true,
  },
  {
    id: "company",
    title: "FY by Company",
    rowHeader: "Company",
    chartKind: "bar",
    dataMode: "compare",
    resolveLabel: (row) => toText(row.entity) || "Unassigned",
    includeComparableOnly: false,
  },
  {
    id: "hi-vertical",
    title: "FY by Vertical",
    rowHeader: "Vertical",
    chartKind: "line",
    dataMode: "compare",
    resolveLabel: (row) => normalizeVertical(row.vertical),
    includeComparableOnly: false,
  },
  {
    id: "bdm-strategic-yes",
    title: "FY by BDM (Strategic: Yes)",
    rowHeader: "BDM",
    chartKind: "area",
    dataMode: "budgetOnly",
    resolveLabel: (row) => toText(row.bdm) || "Unassigned",
    allowRow: (row) =>
      normalizeStrategic(row.strategicAccount) === "Yes" &&
      Boolean(toText(row.bdm)),
    includeComparableOnly: false,
    description: "Budget-only strategic view by BDM for strategic account = Yes.",
  },
  {
    id: "bdm-strategic-no",
    title: "FY by BDM (Strategic: No)",
    rowHeader: "BDM",
    chartKind: "area",
    dataMode: "budgetOnly",
    resolveLabel: (row) => toText(row.bdm) || "Unassigned",
    allowRow: (row) =>
      normalizeStrategic(row.strategicAccount) === "No" &&
      Boolean(toText(row.bdm)),
    includeComparableOnly: false,
    description: "Budget-only strategic view by BDM for strategic account = No.",
  },
  {
    id: "customer-ms",
    title: "FY by Group Company (MS)",
    rowHeader: "Group Company",
    chartKind: "bar",
    dataMode: "compare",
    resolveLabel: (row) =>
      toText(row.groupCompany) ||
      toText(row.customerDimension) ||
      toText(row.customerName) ||
      "Unassigned",
    allowRow: (row) => isMs(row.msps),
    includeComparableOnly: false,
    isCustomerTable: true,
  },
  {
    id: "customer-name-ms",
    title: "FY by Customer Name (MS)",
    rowHeader: "Customer Name",
    chartKind: "bar",
    dataMode: "compare",
    resolveLabel: (row) =>
      toText(row.customerName) ||
      toText(row.customerDimension) ||
      toText(row.groupCompany) ||
      "Unassigned",
    allowRow: (row) => isMs(row.msps),
    includeComparableOnly: false,
    isCustomerTable: true,
  },
  {
    id: "customer-ee",
    title: "FY by Customer Name (EE)",
    rowHeader: "Group Company",
    chartKind: "treemap",
    dataMode: "compare",
    resolveLabel: (row) =>
      toText(row.groupCompany) ||
      toText(row.customerDimension) ||
      toText(row.customerName) ||
      "Unassigned",
    allowRow: (row) => normalizeEeennn(row.eeennn) === "EE",
    includeComparableOnly: false,
    isCustomerTable: true,
  },
  {
    id: "bdm-company",
    title: "FY by BDM (Company Filter)",
    rowHeader: "Company / BDM",
    chartKind: "hbar",
    dataMode: "compare",
    resolveLabel: (row) =>
      `${toText(row.entity) || "Unassigned"} / ${
        toText(row.bdm) || "Unassigned"
      }`,
    allowRow: (row) => Boolean(toText(row.entity)),
    includeComparableOnly: false,
  },
];

function createEmptyAnalyticsRow(label: string): AnalyticsTableRow {
  return {
    label,
    budget: 0,
    forecast: 0,
    actual: 0,
    varianceForecastVsActual: 0,
    variancePctForecastVsActual: 0,
  };
}

function buildAnalyticsTable(
  definition: TableDefinition,
  rows: RevenueRow[],
): AnalyticsTable {
  const expected = definition.expectedLabels ?? [];
  const expectedSet = new Set(expected.map((value) => normalizeKey(value)));
  const buckets = new Map<string, AnalyticsTableRow>();
  const rawDrilldownFiltersByLabel = new Map<string, RawDrilldownFilters>();
  const scopedRows = definition.allowRow
    ? rows.filter((row) => definition.allowRow?.(row))
    : rows;

  for (const row of scopedRows) {
    const label = definition.resolveLabel(row);
    if (!label) {
      continue;
    }
    if (
      definition.onlyExpectedLabels &&
      expectedSet.size > 0 &&
      !expectedSet.has(normalizeKey(label))
    ) {
      continue;
    }
    const key = normalizeKey(label);
    const current = buckets.get(key) ?? createEmptyAnalyticsRow(label);
    collectRawDrilldownFiltersForTableRow(
      definition.id,
      key,
      row,
      rawDrilldownFiltersByLabel,
    );
    const normalizedForecast = toNumber(row.forecast);
    current.budget += toNumber(row.budget);
    current.forecast += normalizedForecast;
    current.actual += toNumber(row.actual);
    current.varianceForecastVsActual = current.actual - current.forecast;
    const varianceBase = current.forecast !== 0 ? current.forecast : current.budget;
    current.variancePctForecastVsActual =
      varianceBase !== 0
        ? (current.varianceForecastVsActual / varianceBase) * 100
        : 0;
    buckets.set(key, current);
  }

  for (const label of expected) {
    const key = normalizeKey(label);
    if (!buckets.has(key)) {
      buckets.set(key, createEmptyAnalyticsRow(label));
    }
  }

  let bodyRows = Array.from(buckets.values());
  if (definition.onlyExpectedLabels && expected.length > 0) {
    bodyRows = bodyRows.filter((row) =>
      expectedSet.has(normalizeKey(row.label)),
    );
  }

  const includeComparableOnly =
    definition.includeComparableOnly ?? definition.dataMode === "compare";
  const dataMode = definition.dataMode ?? "compare";

  const filteredRows = bodyRows.filter((row) => {
    if (dataMode === "budgetOnly") {
      return row.budget !== 0 || expectedSet.has(normalizeKey(row.label));
    }
    if (includeComparableOnly) {
      return row.budget !== 0 && row.actual !== 0;
    }
    return (
      row.budget !== 0 ||
      row.forecast !== 0 ||
      row.actual !== 0 ||
      expectedSet.has(normalizeKey(row.label))
    );
  });

  const sortedRows = [...filteredRows].sort((left, right) => {
    if (expected.length > 0 && definition.onlyExpectedLabels) {
      return (
        expected.findIndex(
          (value) => normalizeKey(value) === normalizeKey(left.label),
        ) -
        expected.findIndex(
          (value) => normalizeKey(value) === normalizeKey(right.label),
        )
      );
    }
    if (dataMode === "budgetOnly") {
      return right.budget - left.budget;
    }
    return right.actual - left.actual;
  });

  const filteredTotals = sortedRows.reduce(
    (accumulator, row) => {
      accumulator.budget += row.budget;
      accumulator.forecast += row.forecast;
      accumulator.actual += row.actual;
      accumulator.varianceForecastVsActual += row.varianceForecastVsActual;
      return accumulator;
    },
    { budget: 0, forecast: 0, actual: 0, varianceForecastVsActual: 0 },
  );
  const totalBudget = filteredTotals.budget;
  const totalForecast = filteredTotals.forecast;
  const totalActual = filteredTotals.actual;
  const totalVariance = filteredTotals.varianceForecastVsActual;
  const totalVarianceBase = totalForecast !== 0 ? totalForecast : totalBudget;

  const grandTotal: AnalyticsTableRow = {
    label: "Grand Total",
    budget: totalBudget,
    forecast: totalForecast,
    actual: totalActual,
    varianceForecastVsActual: totalVariance,
    variancePctForecastVsActual:
      totalVarianceBase !== 0
        ? (totalVariance / totalVarianceBase) * 100
        : 0,
  };

  return {
    id: definition.id,
    title: definition.title,
    rowHeader: definition.rowHeader,
    chartKind: definition.chartKind,
    dataMode,
    rows: [...sortedRows, grandTotal],
    description:
      definition.description ??
      (dataMode === "budgetOnly"
        ? "Budget-only view from uploaded budget data."
        : "Budget, Forecast, and Actuals aggregated for selected YTD slicer scope."),
    isCustomerTable: definition.isCustomerTable,
    rawDrilldownFiltersByLabel: serializeRawDrilldownFilters(rawDrilldownFiltersByLabel),
  };
}

function buildQ1EeennnSegmentMatrix(
  payload: RevenueComparisonResponse,
  segment: "MS" | "PS",
): AnalyticsTable {
  const categoryOrder: Array<"EE" | "EN" | "NN"> = ["EE", "EN", "NN"];
  const categories: Record<"EE" | "EN" | "NN", QuarterMatrixRow> = {
    EE: { label: "EE", apr: 0, may: 0, jun: 0, q1: 0 },
    EN: { label: "EN", apr: 0, may: 0, jun: 0, q1: 0 },
    NN: { label: "NN", apr: 0, may: 0, jun: 0, q1: 0 },
  };
  const rawDrilldownFiltersByLabel = new Map<string, RawDrilldownFilters>();

  for (const row of payload.rows) {
    const month = toText(row.month).slice(0, 3);
    if (!["Apr", "May", "Jun"].includes(month)) {
      continue;
    }
    if (normalizeMsps(row.msps) !== segment) {
      continue;
    }
    const ee = normalizeEeennn(row.eeennn);
    if (!categoryOrder.includes(ee as "EE" | "EN" | "NN")) {
      continue;
    }
    const labelKey = normalizeKey(ee);
    const labelFilters = rawDrilldownFiltersByLabel.get(labelKey) ?? {};
    pushUniqueRawFilterValue(labelFilters, "eeennn", row.eeennn);
    pushUniqueRawFilterValue(labelFilters, "ms_ps", row.msps);
    if (Object.keys(labelFilters).length > 0) {
      rawDrilldownFiltersByLabel.set(labelKey, labelFilters);
    }
    const value = toNumber(row.budget);
    if (month === "Apr") {
      categories[ee as "EE" | "EN" | "NN"].apr += value;
    } else if (month === "May") {
      categories[ee as "EE" | "EN" | "NN"].may += value;
    } else if (month === "Jun") {
      categories[ee as "EE" | "EN" | "NN"].jun += value;
    }
    categories[ee as "EE" | "EN" | "NN"].q1 += value;
  }

  const matrixRows: QuarterMatrixRow[] = categoryOrder.map((key) => categories[key]);
  const totals = matrixRows.reduce(
    (accumulator, row) => {
      accumulator.apr += row.apr;
      accumulator.may += row.may;
      accumulator.jun += row.jun;
      accumulator.q1 += row.q1;
      return accumulator;
    },
    { apr: 0, may: 0, jun: 0, q1: 0 },
  );
  matrixRows.push({
    label: "Grand Total",
    apr: totals.apr,
    may: totals.may,
    jun: totals.jun,
    q1: totals.q1,
  });

  return {
    id: segment === "MS" ? "q1-eeennn-ms" : "q1-eeennn-ps",
    title: `Q1 by EEENNN (${segment})`,
    rowHeader: "EEENNN",
    chartKind: "bar",
    dataMode: "matrix",
    matrixRows,
    rows: matrixRows.map((row) => ({
      label: row.label,
      budget: row.q1,
      forecast: 0,
      actual: 0,
      varianceForecastVsActual: 0,
      variancePctForecastVsActual: 0,
    })),
    description: `Budget matrix for Apr-May-Jun and Q1 totals for ${segment} projects.`,
    rawDrilldownFiltersByLabel: serializeRawDrilldownFilters(rawDrilldownFiltersByLabel),
  };
}

function buildAnalyticsTables(
  payload: RevenueComparisonResponse,
  options?: { includeTableIds?: string[] },
) {
  const include = options?.includeTableIds ? new Set(options.includeTableIds) : null;
  const tables = TABLE_DEFINITIONS
    .filter((definition) => !include || include.has(definition.id))
    .map((definition) => buildAnalyticsTable(definition, payload.rows));

  if (!include || include.has("q1-eeennn-ms")) {
    tables.push(buildQ1EeennnSegmentMatrix(payload, "MS"));
  }
  if (!include || include.has("q1-eeennn-ps")) {
    tables.push(buildQ1EeennnSegmentMatrix(payload, "PS"));
  }
  return tables;
}

function commentKey(tableId: string, rowLabel: string) {
  return `${tableId}::${normalizeKey(rowLabel)}`;
}

function MetricCell({ value }: { value: number }) {
  return <span className="tabular-nums">{formatCurrency(value)}</span>;
}

function isGrandTotalLabel(label: string) {
  return normalizeKey(label) === normalizeKey("Grand Total");
}

function buildGrandTotalRow(rows: AnalyticsTableRow[]): AnalyticsTableRow {
  const totals = rows.reduce(
    (accumulator, row) => {
      accumulator.budget += row.budget;
      accumulator.forecast += row.forecast;
      accumulator.actual += row.actual;
      accumulator.varianceForecastVsActual += row.varianceForecastVsActual;
      return accumulator;
    },
    { budget: 0, forecast: 0, actual: 0, varianceForecastVsActual: 0 },
  );
  const varianceBase = totals.forecast !== 0 ? totals.forecast : totals.budget;
  return {
    label: "Grand Total",
    budget: totals.budget,
    forecast: totals.forecast,
    actual: totals.actual,
    varianceForecastVsActual: totals.varianceForecastVsActual,
    variancePctForecastVsActual:
      varianceBase !== 0
        ? (totals.varianceForecastVsActual / varianceBase) * 100
        : 0,
  };
}

function buildGrandTotalMatrixRow(rows: QuarterMatrixRow[]): QuarterMatrixRow {
  const totals = rows.reduce(
    (accumulator, row) => {
      accumulator.apr += row.apr;
      accumulator.may += row.may;
      accumulator.jun += row.jun;
      accumulator.q1 += row.q1;
      return accumulator;
    },
    { apr: 0, may: 0, jun: 0, q1: 0 },
  );
  return { label: "Grand Total", ...totals };
}

function filterAnalyticsTable(table: AnalyticsTable, rowFilter: string): AnalyticsTable {
  const needle = rowFilter.trim().toLowerCase();
  if (!needle) {
    return table;
  }

  if (table.dataMode === "matrix") {
    const bodyRows = (table.matrixRows ?? []).filter(
      (row) =>
        !isGrandTotalLabel(row.label) &&
        row.label.toLowerCase().includes(needle),
    );
    const grandTotal = buildGrandTotalMatrixRow(bodyRows);
    const matrixRows = [...bodyRows, grandTotal];
    return {
      ...table,
      matrixRows,
      rows: matrixRows.map((row) => ({
        label: row.label,
        budget: row.q1,
        forecast: 0,
        actual: 0,
        varianceForecastVsActual: 0,
        variancePctForecastVsActual: 0,
      })),
    };
  }

  const bodyRows = table.rows.filter(
    (row) =>
      !isGrandTotalLabel(row.label) &&
      row.label.toLowerCase().includes(needle),
  );
  return {
    ...table,
    rows: [...bodyRows, buildGrandTotalRow(bodyRows)],
  };
}

function getTableSubtotal(table: AnalyticsTable) {
  if (table.dataMode === "matrix") {
    return (table.matrixRows ?? []).find((row) => isGrandTotalLabel(row.label)) ??
      buildGrandTotalMatrixRow([]);
  }
  return table.rows.find((row) => isGrandTotalLabel(row.label)) ?? buildGrandTotalRow([]);
}

function buildAnalyticalPrompt(options: {
  table: AnalyticsTable;
  financialYear: string;
  periodFrom: string;
  periodTo: string;
  hideBudget: boolean;
}) {
  const { table, financialYear, periodFrom, periodTo, hideBudget } = options;
  const rows =
    table.dataMode === "matrix"
      ? (table.matrixRows ?? []).slice(0, 12).map((row) => ({
          label: row.label,
          apr: row.apr,
          may: row.may,
          jun: row.jun,
          q1: row.q1,
        }))
      : table.rows
          .filter((row) => normalizeKey(row.label) !== normalizeKey("Grand Total"))
          .slice(0, 20)
          .map((row) => ({
            label: row.label,
            budget: row.budget,
            forecast: row.forecast,
            actual: row.actual,
            variance: row.varianceForecastVsActual,
            variancePct: row.variancePctForecastVsActual,
          }));

  const totals =
    table.dataMode === "matrix"
      ? (table.matrixRows ?? []).find((row) => normalizeKey(row.label) === normalizeKey("Grand Total"))
      : table.rows.find((row) => normalizeKey(row.label) === normalizeKey("Grand Total"));

  return [
    "You are RAPID analytics copilot.",
    "Write clear business insights in plain words with short sentences.",
    "Do not use markdown tables or code blocks.",
    "Format as readable text sections:",
    "Summary:",
    "Key Observations:",
    "Risk Flags:",
    "Recommended Actions:",
    "Keep the response under 180 words and avoid jargon.",
    "",
    `Table: ${table.title}`,
    `Financial Year: ${financialYear || "N/A"}`,
    `Period: ${periodFrom} to ${periodTo}`,
    `Role Budget Visibility: ${hideBudget ? "Restricted (no budget column in UI)" : "Visible"}`,
    `Data Mode: ${table.dataMode}`,
    `Rows: ${JSON.stringify(rows)}`,
    `Totals: ${JSON.stringify(totals ?? {})}`,
  ].join("\n");
}

function GlassPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative h-full overflow-hidden rounded-[26px] border border-white/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.82),rgba(224,242,254,0.48),rgba(240,253,250,0.42))] p-3 shadow-[0_24px_70px_rgba(15,23,42,0.13)] backdrop-blur-2xl">
      <div className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-cyan-300/25 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-12 left-8 h-32 w-32 rounded-full bg-emerald-300/20 blur-2xl" />
      <div className="relative h-full">{children}</div>
    </div>
  );
}

function TreeMapGrid({
  rows,
  palette = CORPORATE_COLORS,
  onOpenDetails,
}: {
  rows: Array<{ name: string; budget: number; forecast: number; actual: number; variance: number }>;
  palette?: readonly string[];
  onOpenDetails: (label: string, metric: "budget" | "forecast" | "actual" | "variance", value: number) => void;
}) {
  const total = rows.slice(0, 10).reduce((sum, row) => sum + Math.abs(row.actual || row.budget), 0) || 1;
  return (
    <GlassPanel>
      <div className="grid h-full grid-cols-4 grid-rows-3 gap-2">
        {rows.slice(0, 10).map((row, index) => {
          const span = Math.max(1, Math.min(2, Math.round((Math.abs(row.actual || row.budget) / total) * 8)));
          return (
            <button
              key={`${row.name}-${index}`}
              type="button"
              onClick={() => onOpenDetails(row.name, row.actual !== 0 ? "actual" : "budget", row.actual || row.budget)}
              className={`min-h-0 rounded-2xl border border-white/60 p-2 text-left text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] transition hover:-translate-y-0.5`}
              style={{
                gridColumn: `span ${span}`,
                background: `linear-gradient(145deg, ${palette[index % palette.length]}, rgba(15,23,42,0.82))`,
              }}
            >
              <p className="line-clamp-2 text-[10px] font-semibold leading-4">{row.name}</p>
              <p className="mt-1 text-xs font-bold">{formatCompactCurrency(row.actual || row.budget)}</p>
            </button>
          );
        })}
      </div>
    </GlassPanel>
  );
}

function CompactChartTooltip({ active, label, payload }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  const rows = payload.filter((item) => item && item.value !== undefined);
  if (rows.length === 0) {
    return null;
  }
  return (
    <div className="rounded-lg border border-slate-200/90 bg-white/95 px-2.5 py-1.5 shadow-[0_8px_20px_rgba(15,23,42,0.14)]">
      <p className="text-[10px] font-semibold text-slate-500">{toText(label)}</p>
      {rows.slice(0, 3).map((item, index) => (
        <p
          key={`${toText(item.name)}-${index}`}
          className="mt-0.5 text-[10px] font-semibold text-slate-800"
          style={{ color: item.color || undefined }}
        >
          {toText(item.name) || "Value"}: {formatCompactMillions(toNumber(item.value))}
        </p>
      ))}
    </div>
  );
}

function AnalyticsChart({
  table,
  hideBudget = false,
  compact = false,
  preferPinnedTooltip = false,
  showTooltip = true,
  onOpenDetails,
  onHoverSnapshotChange,
}: {
  table: AnalyticsTable;
  hideBudget?: boolean;
  compact?: boolean;
  preferPinnedTooltip?: boolean;
  showTooltip?: boolean;
  onOpenDetails?: (options: {
    label: string;
    metric: "budget" | "forecast" | "actual" | "variance";
    value: number;
  }) => void;
  onHoverSnapshotChange?: (snapshot: ChartHoverSnapshot | null) => void;
}) {
  const tooltipFormatter = (value: unknown) => formatCompactMillions(toNumber(value));
  const fullCoverageChartTableIds = new Set([
    "msps-budget",
    "row-us",
    "company",
    "hi-vertical",
  ]);
  const rowLimit = fullCoverageChartTableIds.has(table.id)
    ? Number.MAX_SAFE_INTEGER
    : table.id === "bdm-company"
      ? compact
        ? 10
        : 14
    : table.id === "customer-ms" || table.id === "customer-name-ms"
      ? compact
        ? 6
        : 8
      : compact
        ? 10
        : 12;
  const matrixChartRows = (table.matrixRows ?? []).slice(0, 8).map((row) => ({
    name: row.label,
    apr: row.apr,
    may: row.may,
    jun: row.jun,
    q1: row.q1,
  }));
  const rows = table.rows
    .filter((row) => row.label.toLowerCase() !== "grand total")
    .slice(0, rowLimit)
    .map((row) => ({
      name: row.label,
      budget: row.budget,
      forecast: row.forecast,
      actual: row.actual,
      variance: row.varianceForecastVsActual,
    }));
  const resolveSnapshotFromLabel = (label: string) => {
    const normalizedLabel = normalizeKey(label);
    if (!normalizedLabel) {
      return null;
    }
    if (table.dataMode === "matrix") {
      const row = matrixChartRows.find((item) => normalizeKey(item.name) === normalizedLabel);
      if (!row) {
        return null;
      }
      return {
        label: row.name,
        metrics: [
          { name: "Apr", value: toNumber(row.apr), color: MATRIX_COLORS.apr },
          { name: "May", value: toNumber(row.may), color: MATRIX_COLORS.may },
          { name: "Jun", value: toNumber(row.jun), color: MATRIX_COLORS.jun },
          { name: "Q1", value: toNumber(row.q1), color: MATRIX_COLORS.q1 },
        ],
      } satisfies ChartHoverSnapshot;
    }
    const row = rows.find((item) => normalizeKey(item.name) === normalizedLabel);
    if (!row) {
      return null;
    }
    const metrics: ChartHoverMetric[] = [];
    if (!hideBudget) {
      metrics.push({
        name: "Budget",
        value: toNumber(row.budget),
        color: HOVER_METRIC_COLORS.budget,
      });
    }
    if (table.dataMode === "compare") {
      metrics.push({
        name: "Forecast",
        value: toNumber(row.forecast),
        color: HOVER_METRIC_COLORS.forecast,
      });
      metrics.push({
        name: "Actuals",
        value: toNumber(row.actual),
        color: HOVER_METRIC_COLORS.actual,
      });
    } else if (metrics.length === 0) {
      metrics.push({
        name: "Budget",
        value: toNumber(row.budget),
        color: HOVER_METRIC_COLORS.budget,
      });
    }
    return {
      label: row.name,
      metrics,
    } satisfies ChartHoverSnapshot;
  };
  const emitHoverSnapshot = (state: unknown) => {
    if (!onHoverSnapshotChange) {
      return;
    }
    const event = state as {
      activeLabel?: unknown;
      label?: unknown;
      name?: unknown;
      value?: unknown;
      payload?: unknown;
      activePayload?: Array<{
        name?: unknown;
        dataKey?: unknown;
        value?: unknown;
        color?: unknown;
      }>;
      color?: unknown;
      fill?: unknown;
    };
    const label = toText(
      event?.activeLabel ?? event?.label ?? event?.name ?? (event?.payload as { name?: unknown })?.name,
    );
    if (label) {
      const snapshot = resolveSnapshotFromLabel(label);
      if (snapshot) {
        onHoverSnapshotChange(snapshot);
        return;
      }
    }
    const activePayload = Array.isArray(event?.activePayload)
      ? event.activePayload
      : Array.isArray(event?.payload)
        ? (event.payload as Array<{
            name?: unknown;
            dataKey?: unknown;
            value?: unknown;
            color?: unknown;
          }>)
        : [];
    const metrics: ChartHoverMetric[] = [];
    for (const entry of activePayload) {
      const metricName = toText(entry?.name ?? entry?.dataKey);
      if (!metricName || normalizeKey(metricName) === "variance") {
        continue;
      }
      metrics.push({
        name: metricName,
        value: toNumber(entry?.value),
        color: typeof entry?.color === "string" ? entry.color : undefined,
      });
    }
    if (metrics.length === 0 && event?.payload && typeof event.payload === "object") {
      const payloadRecord = event.payload as Record<string, unknown>;
      if (!hideBudget) {
        metrics.push({
          name: "Budget",
          value: toNumber(payloadRecord.budget),
        });
      }
      if (table.dataMode === "compare") {
        metrics.push({
          name: "Forecast",
          value: toNumber(payloadRecord.forecast),
        });
        metrics.push({
          name: "Actuals",
          value: toNumber(payloadRecord.actual),
        });
      }
    }
    if (metrics.length === 0) {
      const fallbackName = label || "Value";
      const fallbackValue = toNumber(event?.value);
      if (fallbackName || fallbackValue !== 0) {
        metrics.push({
          name: fallbackName || "Value",
          value: fallbackValue,
          color:
            typeof event?.color === "string"
              ? event.color
              : typeof event?.fill === "string"
                ? event.fill
                : undefined,
        });
      }
    }
    if (!label && metrics.length === 0) {
      onHoverSnapshotChange(null);
      return;
    }
    onHoverSnapshotChange({
      label: label || "Selection",
      metrics: metrics.slice(0, 4),
    });
  };
  const emitHoverSnapshotForLabel = (label: string) => {
    if (!onHoverSnapshotChange) {
      return;
    }
    const snapshot = resolveSnapshotFromLabel(label);
    if (snapshot) {
      onHoverSnapshotChange(snapshot);
    }
  };
  const tooltipProps = {
    formatter: tooltipFormatter,
    offset: preferPinnedTooltip ? 8 : 24,
    allowEscapeViewBox: { x: true, y: true },
    cursor: { fill: "rgba(15,23,42,0.06)" },
    wrapperStyle: { pointerEvents: "none" as const, zIndex: 40 },
    contentStyle: {
      borderRadius: "10px",
      border: "1px solid rgba(148,163,184,0.42)",
      boxShadow: "0 12px 30px rgba(15,23,42,0.14)",
      padding: preferPinnedTooltip ? "6px 8px" : undefined,
    },
    position: preferPinnedTooltip ? { x: compact ? 8 : 14, y: 8 } : undefined,
    content: preferPinnedTooltip ? <CompactChartTooltip /> : undefined,
  };
  const axisTickFormatter = (value: unknown) => {
    const text = toText(value);
    const maxLength = compact ? 12 : 16;
    if (text.length <= maxLength) {
      return text;
    }
    return `${text.slice(0, Math.max(maxLength - 2, 8))}...`;
  };
  const showLegend = !compact;
  const emitDrillDown = (
    label: string,
    metric: "budget" | "forecast" | "actual" | "variance",
    value: number,
  ) => {
    if (!onOpenDetails || !label) {
      return;
    }
    onOpenDetails({ label, metric, value });
  };

  if (table.dataMode === "matrix") {
    if (matrixChartRows.length === 0) {
      return (
        <div className="flex h-full items-center justify-center text-xs font-semibold text-slate-500">
          No data available
        </div>
      );
    }
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={matrixChartRows}
          margin={{ top: 8, right: compact ? 8 : 12, left: 0, bottom: compact ? 24 : 34 }}
          onMouseMove={emitHoverSnapshot}
          onMouseLeave={() => onHoverSnapshotChange?.(null)}
        >
          <CartesianGrid stroke="#dbe3f0" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: compact ? 9 : 10, fill: "#334155" }}
            angle={compact ? -10 : -16}
            textAnchor="end"
            interval={0}
            height={compact ? 32 : 44}
            tickFormatter={axisTickFormatter}
          />
          <YAxis
            tick={{ fontSize: compact ? 9 : 10, fill: "#334155" }}
            tickFormatter={(value) => formatCompactMillions(Number(value))}
            width={compact ? 64 : 72}
          />
          {showTooltip ? <Tooltip {...tooltipProps} /> : null}
          {showLegend ? (
            <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
          ) : null}
          <Bar
            dataKey="apr"
            name="Apr"
            fill={MATRIX_COLORS.apr}
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
            onClick={(state: ChartClickState) => emitDrillDown(toText(state?.payload?.name), "budget", toNumber(state?.payload?.apr))}
          />
          <Bar
            dataKey="may"
            name="May"
            fill={MATRIX_COLORS.may}
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
            onClick={(state: ChartClickState) => emitDrillDown(toText(state?.payload?.name), "budget", toNumber(state?.payload?.may))}
          />
          <Bar
            dataKey="jun"
            name="Jun"
            fill={MATRIX_COLORS.jun}
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
            onClick={(state: ChartClickState) => emitDrillDown(toText(state?.payload?.name), "budget", toNumber(state?.payload?.jun))}
          />
          <Bar
            dataKey="q1"
            name="Q1"
            fill={MATRIX_COLORS.q1}
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
            onClick={(state: ChartClickState) => emitDrillDown(toText(state?.payload?.name), "budget", toNumber(state?.payload?.q1))}
          />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs font-semibold text-slate-500">
        No data available
      </div>
    );
  }

  const budgetKey = hideBudget
    ? rows.some((row) => row.actual !== 0)
      ? "actual"
      : "forecast"
    : "budget";
  const pieInnerRadius = table.chartKind === "donut" ? (compact ? 34 : 42) : 0;
  const pieOuterRadius = table.chartKind === "donut" ? (compact ? 60 : 74) : compact ? 64 : 80;

  if (table.chartKind === "treemap") {
    return (
      <TreeMapGrid
        rows={rows}
        palette={table.id === "customer-ee" ? CUSTOMER_EE_COLORS : CORPORATE_COLORS}
        onOpenDetails={emitDrillDown}
      />
    );
  }

  if (table.chartKind === "donut" || table.chartKind === "pie") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart onMouseLeave={() => onHoverSnapshotChange?.(null)}>
          {showTooltip ? <Tooltip {...tooltipProps} /> : null}
          {showLegend ? (
            <Legend
              layout="horizontal"
              verticalAlign="bottom"
              align="center"
              wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
            />
          ) : null}
          <Pie
            data={rows}
            dataKey={budgetKey}
            nameKey="name"
            innerRadius={pieInnerRadius}
            outerRadius={pieOuterRadius}
            isAnimationActive={false}
            onMouseEnter={(state: ChartClickState) =>
              emitHoverSnapshotForLabel(toText(state?.name ?? state?.payload?.name))
            }
            onMouseMove={(state: ChartClickState) =>
              emitHoverSnapshotForLabel(toText(state?.name ?? state?.payload?.name))
            }
            onClick={(state: ChartClickState) => {
              const label = toText(state?.name ?? state?.payload?.name);
              const metric = budgetKey === "budget" ? "budget" : budgetKey === "forecast" ? "forecast" : "actual";
              emitDrillDown(label, metric, toNumber(state?.value ?? state?.payload?.[budgetKey]));
            }}
          >
            {rows.map((row, index) => (
              <Cell
                key={`${row.name}-${index}`}
                fill={CORPORATE_COLORS[index % CORPORATE_COLORS.length]}
              />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (table.chartKind === "hbar") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 8, right: compact ? 8 : 16, left: compact ? 18 : 42, bottom: compact ? 10 : 14 }}
          onMouseMove={emitHoverSnapshot}
          onMouseLeave={() => onHoverSnapshotChange?.(null)}
        >
          <defs>
            <linearGradient id={`hbar-budget-${table.id}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#0f4c81" stopOpacity={0.95} />
              <stop offset="100%" stopColor="#0b3c5d" stopOpacity={0.72} />
            </linearGradient>
            <linearGradient id={`hbar-forecast-${table.id}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#0ea5a4" stopOpacity={0.94} />
              <stop offset="100%" stopColor="#0d9488" stopOpacity={0.7} />
            </linearGradient>
            <linearGradient id={`hbar-actual-${table.id}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#2f7dd5" stopOpacity={0.95} />
              <stop offset="100%" stopColor="#1e40af" stopOpacity={0.72} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#d6deea" strokeDasharray="3 3" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: compact ? 9 : 10, fill: "#334155" }}
            tickFormatter={(value) => formatCompactMillions(Number(value))}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={table.id === "bdm-company" ? (compact ? 190 : 260) : compact ? 120 : 180}
            tick={{ fontSize: compact ? 9 : 10, fill: "#334155" }}
            tickFormatter={(value) => {
              const text = toText(value);
              const maxLength = table.id === "bdm-company" ? (compact ? 24 : 34) : compact ? 14 : 20;
              return text.length > maxLength ? `${text.slice(0, Math.max(maxLength - 2, 8))}...` : text;
            }}
          />
          {showTooltip ? <Tooltip {...tooltipProps} /> : null}
          {showLegend ? <Legend wrapperStyle={{ fontSize: "11px" }} /> : null}
          {!hideBudget ? (
            <Bar
              dataKey="budget"
              name="Budget"
              fill={`url(#hbar-budget-${table.id})`}
              radius={[0, 4, 4, 0]}
              maxBarSize={compact ? 14 : 16}
              isAnimationActive={false}
              onClick={(state: ChartClickState) => emitDrillDown(toText(state?.payload?.name), "budget", toNumber(state?.payload?.budget))}
            />
          ) : null}
          {table.dataMode === "compare" ? (
            <Bar
              dataKey="forecast"
              name="Forecast"
              fill={`url(#hbar-forecast-${table.id})`}
              radius={[0, 4, 4, 0]}
              maxBarSize={compact ? 14 : 16}
              isAnimationActive={false}
              onClick={(state: ChartClickState) => emitDrillDown(toText(state?.payload?.name), "forecast", toNumber(state?.payload?.forecast))}
            />
          ) : null}
          {table.dataMode === "compare" ? (
            <Bar
              dataKey="actual"
              name="Actuals"
              fill={`url(#hbar-actual-${table.id})`}
              radius={[0, 4, 4, 0]}
              maxBarSize={compact ? 14 : 16}
              isAnimationActive={false}
              onClick={(state: ChartClickState) => emitDrillDown(toText(state?.payload?.name), "actual", toNumber(state?.payload?.actual))}
            />
          ) : null}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (table.chartKind === "line") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={rows}
          margin={{ top: 8, right: compact ? 8 : 10, left: 0, bottom: compact ? 24 : 34 }}
          onMouseMove={emitHoverSnapshot}
          onMouseLeave={() => onHoverSnapshotChange?.(null)}
        >
          <CartesianGrid stroke="#dbe3f0" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: compact ? 9 : 10, fill: "#334155" }}
            angle={compact ? -10 : -18}
            textAnchor="end"
            interval={0}
            height={compact ? 32 : 44}
            tickFormatter={axisTickFormatter}
          />
          <YAxis
            tick={{ fontSize: compact ? 9 : 10, fill: "#334155" }}
            tickFormatter={(value) => formatCompactMillions(Number(value))}
            width={compact ? 64 : 72}
          />
          {showTooltip ? <Tooltip {...tooltipProps} /> : null}
          {showLegend ? <Legend wrapperStyle={{ fontSize: "11px" }} /> : null}
          {!hideBudget ? (
            <Line
              type="natural"
              dataKey="budget"
              name="Budget"
              stroke={CORPORATE_COLORS[0]}
              strokeWidth={3}
              isAnimationActive={false}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: CORPORATE_COLORS[0] }}
              strokeLinecap="round"
              strokeLinejoin="round"
              onClick={(state: ChartClickState) => emitDrillDown(toText(state?.payload?.name), "budget", toNumber(state?.payload?.budget))}
            />
          ) : null}
          {table.dataMode === "compare" ? (
            <Line
              type="natural"
              dataKey="forecast"
              name="Forecast"
              stroke={CORPORATE_COLORS[1]}
              strokeWidth={3}
              isAnimationActive={false}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: CORPORATE_COLORS[1] }}
              strokeLinecap="round"
              strokeLinejoin="round"
              onClick={(state: ChartClickState) => emitDrillDown(toText(state?.payload?.name), "forecast", toNumber(state?.payload?.forecast))}
            />
          ) : null}
          {table.dataMode === "compare" ? (
            <Line
              type="natural"
              dataKey="actual"
              name="Actuals"
              stroke={CORPORATE_COLORS[3]}
              strokeWidth={3.2}
              isAnimationActive={false}
              dot={false}
              activeDot={{ r: 4.5, strokeWidth: 0, fill: CORPORATE_COLORS[3] }}
              strokeLinecap="round"
              strokeLinejoin="round"
              onClick={(state: ChartClickState) => emitDrillDown(toText(state?.payload?.name), "actual", toNumber(state?.payload?.actual))}
            />
          ) : null}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (table.chartKind === "area") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={rows}
          margin={{ top: 8, right: compact ? 8 : 10, left: 0, bottom: compact ? 24 : 34 }}
          onMouseMove={emitHoverSnapshot}
          onMouseLeave={() => onHoverSnapshotChange?.(null)}
        >
          <defs>
            <linearGradient id={`gradient-${table.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CORPORATE_COLORS[2]} stopOpacity={0.42} />
              <stop offset="65%" stopColor={CORPORATE_COLORS[2]} stopOpacity={0.16} />
              <stop offset="100%" stopColor={CORPORATE_COLORS[2]} stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#dbe3f0" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: compact ? 9 : 10, fill: "#334155" }}
            angle={compact ? -10 : -18}
            textAnchor="end"
            interval={0}
            height={compact ? 32 : 44}
            tickFormatter={axisTickFormatter}
          />
          <YAxis
            tick={{ fontSize: compact ? 9 : 10, fill: "#334155" }}
            tickFormatter={(value) => formatCompactMillions(Number(value))}
            width={compact ? 64 : 72}
          />
          {showTooltip ? <Tooltip {...tooltipProps} /> : null}
          {showLegend ? <Legend wrapperStyle={{ fontSize: "11px" }} /> : null}
          <Area
            type="natural"
            dataKey={
              table.dataMode === "compare"
                ? "actual"
                : hideBudget
                  ? "actual"
                  : "budget"
            }
            name={
              table.dataMode === "compare"
                ? "Actuals"
                : hideBudget
                  ? "Actuals"
                  : "Budget"
            }
            stroke={CORPORATE_COLORS[2]}
            fill={`url(#gradient-${table.id})`}
            strokeWidth={3}
            isAnimationActive={false}
            strokeLinecap="round"
            strokeLinejoin="round"
          onClick={(state: ChartClickState) => {
              const metric = table.dataMode === "compare"
                ? "actual"
                : hideBudget
                  ? "actual"
                  : "budget";
              emitDrillDown(
                toText(state?.payload?.name),
                metric,
                toNumber(
                  metric === "budget"
                    ? state?.payload?.budget
                    : state?.payload?.actual,
                ),
              );
            }}
          />
          {table.dataMode === "compare" ? (
            <Line
              type="natural"
              dataKey="forecast"
              name="Forecast"
              stroke={CORPORATE_COLORS[1]}
              strokeWidth={3}
              isAnimationActive={false}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: CORPORATE_COLORS[1] }}
              strokeLinecap="round"
              strokeLinejoin="round"
              onClick={(state: ChartClickState) => emitDrillDown(toText(state?.payload?.name), "forecast", toNumber(state?.payload?.forecast))}
            />
          ) : null}
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={rows}
        margin={{ top: 8, right: compact ? 8 : 10, left: 0, bottom: compact ? 24 : 34 }}
        onMouseMove={emitHoverSnapshot}
        onMouseLeave={() => onHoverSnapshotChange?.(null)}
      >
        <defs>
          <linearGradient id={`bar-budget-${table.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0f4c81" stopOpacity={0.95} />
            <stop offset="100%" stopColor="#0b3c5d" stopOpacity={0.72} />
          </linearGradient>
          <linearGradient id={`bar-forecast-${table.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0ea5a4" stopOpacity={0.94} />
            <stop offset="100%" stopColor="#0d9488" stopOpacity={0.7} />
          </linearGradient>
          <linearGradient id={`bar-actual-${table.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2f7dd5" stopOpacity={0.95} />
            <stop offset="100%" stopColor="#1e40af" stopOpacity={0.72} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#d6deea" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: compact ? 9 : 10, fill: "#334155" }}
          angle={compact ? -10 : -18}
          textAnchor="end"
          interval={0}
          height={compact ? 32 : 44}
          tickFormatter={axisTickFormatter}
        />
        <YAxis
            tick={{ fontSize: compact ? 9 : 10, fill: "#334155" }}
            tickFormatter={(value) => formatCompactMillions(Number(value))}
            width={compact ? 64 : 72}
          />
        {showTooltip ? <Tooltip {...tooltipProps} /> : null}
        {showLegend ? <Legend wrapperStyle={{ fontSize: "11px" }} /> : null}
        {!hideBudget ? (
          <Bar
            dataKey="budget"
            name="Budget"
            fill={`url(#bar-budget-${table.id})`}
            radius={[4, 4, 0, 0]}
            maxBarSize={compact ? 14 : 18}
            isAnimationActive={false}
            onClick={(state: ChartClickState) => emitDrillDown(toText(state?.payload?.name), "budget", toNumber(state?.payload?.budget))}
          />
        ) : null}
        {table.dataMode === "compare" ? (
          <Bar
            dataKey="forecast"
            name="Forecast"
            fill={`url(#bar-forecast-${table.id})`}
            radius={[4, 4, 0, 0]}
            maxBarSize={compact ? 14 : 18}
            isAnimationActive={false}
            onClick={(state: ChartClickState) => emitDrillDown(toText(state?.payload?.name), "forecast", toNumber(state?.payload?.forecast))}
          />
        ) : null}
        {table.dataMode === "compare" ? (
          <Bar
            dataKey="actual"
            name="Actuals"
            fill={`url(#bar-actual-${table.id})`}
            radius={[4, 4, 0, 0]}
            maxBarSize={compact ? 14 : 18}
            isAnimationActive={false}
            onClick={(state: ChartClickState) => emitDrillDown(toText(state?.payload?.name), "actual", toNumber(state?.payload?.actual))}
          />
        ) : null}
      </BarChart>
    </ResponsiveContainer>
  );
}

function TableCard({
  table,
  mode,
  financialYear,
  periodFrom,
  periodTo,
  actualsContextMonth,
  rowFilter,
  hideBudget = false,
  canEditComments = false,
  exportingFormat = "",
  comments,
  onOpenDrillDown,
  onExportTable,
  onOpenInsight,
  onModeChange,
  onRowFilterChange,
  onOpenComment,
}: {
  table: AnalyticsTable;
  mode: ViewMode;
  financialYear: string;
  periodFrom: string;
  periodTo: string;
  actualsContextMonth?: string;
  rowFilter: string;
  hideBudget?: boolean;
  canEditComments?: boolean;
  exportingFormat?: TableExportFormat | "";
  comments: Map<string, string>;
  onOpenDrillDown: (options: {
    table: AnalyticsTable;
    label: string;
    metric: "budget" | "forecast" | "actual" | "variance";
    value: number;
  }) => void;
  onExportTable: (options: {
    table: AnalyticsTable;
    format: TableExportFormat;
    financialYear: string;
    actualsLabel: string;
  }) => void;
  onOpenInsight: (table: AnalyticsTable) => void;
  onModeChange: (mode: ViewMode) => void;
  onRowFilterChange: (value: string) => void;
  onOpenComment: (payload: CommentDialogState) => void;
}) {
  const [hoverSnapshot, setHoverSnapshot] = useState<ChartHoverSnapshot | null>(null);
  const handleHoverSnapshotChange = (snapshot: ChartHoverSnapshot | null) => {
    setHoverSnapshot((current) =>
      areHoverSnapshotsEqual(current, snapshot) ? current : snapshot,
    );
  };
  const visibleTable = useMemo(
    () => filterAnalyticsTable(table, rowFilter),
    [rowFilter, table],
  );
  const isBudgetOnly = table.dataMode === "budgetOnly";
  const isMatrix = table.dataMode === "matrix";
  const showBudgetColumn = !hideBudget;
  const varianceHeader = hideBudget
    ? "Variance (Actuals - Forecast)"
    : "Variance (Actuals - Budget)";
  const subtotal = getTableSubtotal(visibleTable);
  const periodLabel = `${periodFrom || "Apr"}-${periodTo || "Mar"}`;
  const fiscalYearLabel = financialYear || "Latest FY";
  const timeframeLabel = `FY ${fiscalYearLabel} | Period ${periodLabel}`;
  const subtitle = table.description || `${table.rowHeader} comparison for the selected workspace scope.`;
  const actualsLabel = toText(actualsContextMonth) || (periodTo || "Mar");
  const columnCount = isMatrix
    ? 6
    : 2 + (showBudgetColumn ? 1 : 0) + (!isBudgetOnly ? 3 : 0);
  const subtotalRow = subtotal as AnalyticsTableRow;
  const subtotalMatrixRow = subtotal as QuarterMatrixRow;

  return (
    <article
      id={table.id}
      className="overflow-hidden rounded-[18px] border border-white/75 bg-[linear-gradient(170deg,rgba(255,255,255,0.84),rgba(241,245,249,0.76),rgba(239,246,255,0.72))] p-4 shadow-[0_16px_38px_rgba(15,23,42,0.1)] backdrop-blur-2xl"
      style={{ contentVisibility: "auto", containIntrinsicSize: "760px" }}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="mr-2 text-base font-semibold text-slate-950">{table.title}</h2>
        <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => onOpenInsight(visibleTable)}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-white"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Analytical
          </button>
          <button
            type="button"
            onClick={() => onModeChange("table")}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              mode === "table" ? "bg-slate-950 text-white" : "text-slate-600"
            }`}
          >
            <Table2 className="h-3.5 w-3.5" />
            Table
          </button>
          <button
            type="button"
            onClick={() => onModeChange("graph")}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              mode === "graph" ? "bg-slate-950 text-white" : "text-slate-600"
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Graph
          </button>
        </div>
        <div className="ml-auto flex w-full items-center justify-end gap-2 sm:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              value={rowFilter}
              onChange={(event) => onRowFilterChange(event.target.value)}
              placeholder={`Filter ${table.rowHeader}`}
              className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 text-xs font-semibold text-slate-700 outline-none transition focus:border-[#2C74B3]"
            />
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-600 hover:bg-white"
                aria-label={`Export ${table.title}`}
              >
                <Download className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-36 p-1.5">
              <button
                type="button"
                disabled={exportingFormat !== ""}
                onClick={() =>
                  onExportTable({
                    table: visibleTable,
                    format: "csv",
                    financialYear: fiscalYearLabel,
                    actualsLabel,
                  })
                }
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
              >
                CSV
                {exportingFormat === "csv" ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
              </button>
              <button
                type="button"
                disabled={exportingFormat !== ""}
                onClick={() =>
                  onExportTable({
                    table: visibleTable,
                    format: "xlsx",
                    financialYear: fiscalYearLabel,
                    actualsLabel,
                  })
                }
                className="mt-1 flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
              >
                XLSX
                {exportingFormat === "xlsx" ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
              </button>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {mode === "graph" ? (
        <div className="rounded-xl border border-white/80 bg-[linear-gradient(155deg,rgba(255,255,255,0.68),rgba(236,253,245,0.46),rgba(239,246,255,0.52))] px-2 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_10px_26px_rgba(15,23,42,0.09)] backdrop-blur-2xl">
          <div className="mb-2 rounded-lg border border-slate-200 bg-white/90 px-4 py-3">
            <p className="min-h-[18px] text-xs font-semibold text-slate-700">
              {hoverSnapshot?.label || "\u00a0"}
            </p>
            <div className="mt-1.5 min-h-[20px] flex flex-wrap gap-3 text-xs font-semibold text-slate-700">
              {hoverSnapshot && hoverSnapshot.metrics.length > 0 ? (
                hoverSnapshot.metrics.map((metric, index) => (
                  <span key={`${metric.name}-${index}`} style={{ color: metric.color || undefined }}>
                    {metric.name}: {formatCompactMillions(metric.value)}
                  </span>
                ))
              ) : (
                <span className="text-transparent select-none">.</span>
              )}
            </div>
          </div>
          <div className="h-[280px]">
          <AnalyticsChart
            table={visibleTable}
            hideBudget={hideBudget}
            showTooltip={false}
            onHoverSnapshotChange={handleHoverSnapshotChange}
            onOpenDetails={({ label, metric, value }) =>
              onOpenDrillDown({
                table: visibleTable,
                label,
                metric,
                value,
              })
            }
          />
          </div>
        </div>
      ) : (
        <TableFullscreenShell
          title={table.title}
          description={
            isMatrix
              ? `Freeze panes enabled. Q1 matrix by MS/PS and EE-EN-NN. FY ${fiscalYearLabel}, period ${periodLabel}.`
              : isBudgetOnly
                ? `Freeze panes enabled with Budget totals. FY ${fiscalYearLabel}, period ${periodLabel}.`
                : hideBudget
                  ? `Freeze panes enabled with Forecast, Actuals, and variance (Actuals - Forecast). FY ${fiscalYearLabel}, period ${periodLabel}.`
                  : `Freeze panes enabled with Budget, Forecast, Actuals, and variance (Actuals - Budget). FY ${fiscalYearLabel}, period ${periodLabel}.`
          }
          className="rounded-xl border border-slate-200"
        >
          {isMatrix ? (
            <table className="min-w-full table-fixed text-left text-sm text-slate-700">
              <thead className="sticky top-0 z-20 bg-slate-950 text-white">
                <tr>
                  <th
                    colSpan={columnCount}
                    className="border-b border-white/10 bg-slate-950 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.14em] text-white"
                  >
                    <div className="space-y-1">
                      <p>{timeframeLabel}</p>
                      <p className="normal-case tracking-normal text-white/75">{subtitle}</p>
                    </div>
                  </th>
                </tr>
                <tr>
                  <th className="sticky left-0 z-30 w-[56px] bg-slate-950 px-3 py-3 font-semibold uppercase tracking-[0.12em]">
                    No
                  </th>
                  <th className="sticky left-[56px] z-30 min-w-[220px] bg-slate-950 px-3 py-3 font-semibold uppercase tracking-[0.12em]">
                    {table.rowHeader}
                  </th>
                  <th className="px-3 py-3 text-right font-semibold uppercase tracking-[0.12em]">
                    <span className="block">Apr</span>
                    <span className="block text-xs normal-case tracking-normal text-white/70">
                      Budget FY {fiscalYearLabel}
                    </span>
                  </th>
                  <th className="px-3 py-3 text-right font-semibold uppercase tracking-[0.12em]">
                    <span className="block">May</span>
                    <span className="block text-xs normal-case tracking-normal text-white/70">
                      Budget FY {fiscalYearLabel}
                    </span>
                  </th>
                  <th className="px-3 py-3 text-right font-semibold uppercase tracking-[0.12em]">
                    <span className="block">Jun</span>
                    <span className="block text-xs normal-case tracking-normal text-white/70">
                      Budget FY {fiscalYearLabel}
                    </span>
                  </th>
                  <th className="px-3 py-3 text-right font-semibold uppercase tracking-[0.12em]">
                    <span className="block">Q1</span>
                    <span className="block text-xs normal-case tracking-normal text-white/70">
                      Budget FY {fiscalYearLabel}
                    </span>
                  </th>
                </tr>
                <tr className="bg-slate-900 text-white">
                  <th className="sticky left-0 z-30 bg-slate-900 px-3 py-2.5 text-xs font-semibold uppercase tracking-[0.12em]">
                    #
                  </th>
                  <th className="sticky left-[56px] z-30 bg-slate-900 px-3 py-2.5 text-xs font-semibold uppercase tracking-[0.12em]">
                    Subtotal
                  </th>
                  <th className="px-3 py-2.5 text-right text-sm font-semibold tabular-nums">
                    {formatCompactCurrency(Number(subtotalMatrixRow.apr ?? 0))}
                  </th>
                  <th className="px-3 py-2.5 text-right text-sm font-semibold tabular-nums">
                    {formatCompactCurrency(Number(subtotalMatrixRow.may ?? 0))}
                  </th>
                  <th className="px-3 py-2.5 text-right text-sm font-semibold tabular-nums">
                    {formatCompactCurrency(Number(subtotalMatrixRow.jun ?? 0))}
                  </th>
                  <th className="px-3 py-2.5 text-right text-sm font-semibold tabular-nums">
                    {formatCompactCurrency(Number(subtotalMatrixRow.q1 ?? 0))}
                  </th>
                </tr>
              </thead>
              <tbody>
                {(visibleTable.matrixRows ?? []).map((row, index) => {
                  const stickyBackground =
                    index % 2 === 0 ? "bg-white" : "bg-slate-50";
                  return (
                    <tr
                      key={`${table.id}-${index}`}
                      className={`border-b border-slate-100 text-slate-700 last:border-b-0 ${
                        index % 2 === 0 ? "bg-white" : "bg-slate-50"
                      }`}
                    >
                      <td
                        className={`sticky left-0 z-10 px-3 py-3 font-semibold text-slate-900 ${stickyBackground}`}
                      >
                        {index + 1}
                      </td>
                      <td
                        className={`sticky left-[56px] z-10 px-3 py-3 text-slate-900 ${stickyBackground}`}
                      >
                        {row.label}
                      </td>
                      <td
                        className="cursor-pointer px-3 py-3 text-right tabular-nums transition hover:bg-slate-100"
                        onClick={() =>
                          onOpenDrillDown({
                            table,
                            label: row.label,
                            metric: "budget",
                            value: row.apr,
                          })
                        }
                      >
                        {formatCurrency(row.apr)}
                      </td>
                      <td
                        className="cursor-pointer px-3 py-3 text-right tabular-nums transition hover:bg-slate-100"
                        onClick={() =>
                          onOpenDrillDown({
                            table,
                            label: row.label,
                            metric: "budget",
                            value: row.may,
                          })
                        }
                      >
                        {formatCurrency(row.may)}
                      </td>
                      <td
                        className="cursor-pointer px-3 py-3 text-right tabular-nums transition hover:bg-slate-100"
                        onClick={() =>
                          onOpenDrillDown({
                            table,
                            label: row.label,
                            metric: "budget",
                            value: row.jun,
                          })
                        }
                      >
                        {formatCurrency(row.jun)}
                      </td>
                      <td
                        className="cursor-pointer px-3 py-3 text-right tabular-nums transition hover:bg-slate-100"
                        onClick={() =>
                          onOpenDrillDown({
                            table,
                            label: row.label,
                            metric: "budget",
                            value: row.q1,
                          })
                        }
                      >
                        {formatCurrency(row.q1)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <table className="min-w-full table-fixed text-left text-sm text-slate-700">
              <thead className="sticky top-0 z-20 bg-slate-950 text-white">
                <tr>
                  <th
                    colSpan={columnCount}
                    className="border-b border-white/10 bg-slate-950 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.14em] text-white"
                  >
                    <div className="space-y-1">
                      <p>{timeframeLabel}</p>
                      <p className="normal-case tracking-normal text-white/75">{subtitle}</p>
                    </div>
                  </th>
                </tr>
                <tr>
                  <th className="sticky left-0 z-30 w-[56px] bg-slate-950 px-3 py-3 font-semibold uppercase tracking-[0.12em]">
                    No
                  </th>
                  <th className="sticky left-[56px] z-30 min-w-[220px] bg-slate-950 px-3 py-3 font-semibold uppercase tracking-[0.12em]">
                    {table.rowHeader}
                  </th>
                  {showBudgetColumn ? (
                    <th className="px-3 py-3 text-right font-semibold uppercase tracking-[0.12em]">
                      <span className="block">Budget</span>
                      <span className="block text-xs normal-case tracking-normal text-white/70">
                        FY {fiscalYearLabel}
                      </span>
                    </th>
                  ) : null}
                  {!isBudgetOnly ? (
                    <th className="px-3 py-3 text-right font-semibold uppercase tracking-[0.12em]">
                      <span className="block">Forecast</span>
                      <span className="block text-xs normal-case tracking-normal text-white/70">
                        FY {fiscalYearLabel}
                      </span>
                    </th>
                  ) : null}
                  {!isBudgetOnly ? (
                    <th className="px-3 py-3 text-right font-semibold uppercase tracking-[0.12em]">
                      <span className="block">Actuals</span>
                      <span className="block text-xs normal-case tracking-normal text-white/70">
                        YTD through {actualsLabel}
                      </span>
                    </th>
                  ) : null}
                  {!isBudgetOnly ? (
                    <th className="px-3 py-3 text-right font-semibold uppercase tracking-[0.12em]">
                      <span className="block">{varianceHeader}</span>
                      <span className="block text-xs normal-case tracking-normal text-white/70">
                        {hideBudget ? "Actuals - Forecast" : "Actuals - Budget"}
                      </span>
                    </th>
                  ) : null}
                </tr>
                <tr className="bg-slate-900 text-white">
                  <th className="sticky left-0 z-30 bg-slate-900 px-3 py-2.5 text-xs font-semibold uppercase tracking-[0.12em]">
                    #
                  </th>
                  <th className="sticky left-[56px] z-30 bg-slate-900 px-3 py-2.5 text-xs font-semibold uppercase tracking-[0.12em]">
                    Subtotal
                  </th>
                  {showBudgetColumn ? (
                    <th className="px-3 py-2.5 text-right text-sm font-semibold tabular-nums">
                      {formatCompactCurrency(Number(subtotalRow.budget ?? 0))}
                    </th>
                  ) : null}
                  {!isBudgetOnly ? (
                    <th className="px-3 py-2.5 text-right text-sm font-semibold tabular-nums">
                      {formatCompactCurrency(Number(subtotalRow.forecast ?? 0))}
                    </th>
                  ) : null}
                  {!isBudgetOnly ? (
                    <th className="px-3 py-2.5 text-right text-sm font-semibold tabular-nums">
                      {formatCompactCurrency(Number(subtotalRow.actual ?? 0))}
                    </th>
                  ) : null}
                  {!isBudgetOnly ? (
                    <th className="px-3 py-2.5 text-right text-sm font-semibold tabular-nums">
                      {formatCompactCurrency(
                        Number(
                          hideBudget
                            ? (subtotalRow.actual ?? 0) - (subtotalRow.forecast ?? 0)
                            : subtotalRow.varianceForecastVsActual ?? 0,
                        ),
                      )}
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {visibleTable.rows.map((row, index) => {
                  const grandTotal = row.label.toLowerCase() === "grand total";
                  const varianceValue = hideBudget
                    ? row.actual - row.forecast
                    : row.varianceForecastVsActual;
                  const variancePercent = hideBudget
                    ? row.forecast !== 0
                      ? ((row.actual - row.forecast) / row.forecast) * 100
                      : 0
                    : row.variancePctForecastVsActual;
                  const commentRequired =
                    !isBudgetOnly &&
                    table.isCustomerTable &&
                    !grandTotal &&
                    variancePercent < -10;
                  const currentComment =
                    comments.get(commentKey(table.id, row.label)) ?? "";
                  const showCommentButton = canEditComments
                    ? commentRequired
                    : Boolean(currentComment);
                  const stickyBackground = grandTotal
                    ? "bg-slate-100"
                    : index % 2 === 0
                      ? "bg-white"
                      : "bg-slate-50";
                  return (
                    <tr
                      key={`${table.id}-${index}`}
                      className={`border-b border-slate-100 text-slate-700 last:border-b-0 ${
                        grandTotal
                          ? "bg-slate-100 font-semibold text-slate-950"
                          : index % 2 === 0
                            ? "bg-white"
                            : "bg-slate-50"
                      }`}
                    >
                      <td
                        className={`sticky left-0 z-10 px-3 py-3 font-semibold text-slate-900 ${stickyBackground}`}
                      >
                        {index + 1}
                      </td>
                      <td
                        className={`sticky left-[56px] z-10 px-3 py-3 text-slate-900 ${stickyBackground}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span>{row.label}</span>
                          {showCommentButton ? (
                            <button
                              type="button"
                              onClick={() =>
                                onOpenComment({
                                  tableId: table.id,
                                  tableTitle: table.title,
                                  rowLabel: row.label,
                                  variancePercent,
                                  comment: currentComment,
                                })
                              }
                              className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-[11px] ${
                                currentComment
                                  ? "border-sky-300 bg-sky-100 text-sky-900"
                                  : "border-amber-300 bg-amber-100 text-amber-900"
                              }`}
                            >
                              <MessageSquare className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                        </div>
                      </td>
                      {showBudgetColumn ? (
                        <td
                          className="cursor-pointer px-3 py-3 text-right transition hover:bg-slate-100"
                          onClick={() =>
                            onOpenDrillDown({
                              table,
                              label: row.label,
                              metric: "budget",
                              value: row.budget,
                            })
                          }
                        >
                          <MetricCell value={row.budget} />
                        </td>
                      ) : null}
                      {!isBudgetOnly ? (
                        <td
                          className="cursor-pointer px-3 py-3 text-right transition hover:bg-slate-100"
                          onClick={() =>
                            onOpenDrillDown({
                              table,
                              label: row.label,
                              metric: "forecast",
                              value: row.forecast,
                            })
                          }
                        >
                          <MetricCell value={row.forecast} />
                        </td>
                      ) : null}
                      {!isBudgetOnly ? (
                        <td
                          className="cursor-pointer px-3 py-3 text-right transition hover:bg-slate-100"
                          onClick={() =>
                            onOpenDrillDown({
                              table,
                              label: row.label,
                              metric: "actual",
                              value: row.actual,
                            })
                          }
                        >
                          <MetricCell value={row.actual} />
                        </td>
                      ) : null}
                      {!isBudgetOnly ? (
                        <td
                          className="cursor-pointer px-3 py-3 text-right transition hover:bg-slate-100"
                          onClick={() =>
                            onOpenDrillDown({
                              table,
                              label: row.label,
                              metric: "variance",
                              value: varianceValue,
                            })
                          }
                        >
                          <MetricCell value={varianceValue} />
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </TableFullscreenShell>
      )}
    </article>
  );
}

function ChartCard({
  table,
  href,
  hideBudget = false,
  compact = false,
  className = "",
  animationDelayMs = 0,
  onOpenDrillDown,
}: {
  table: AnalyticsTable;
  href: string;
  hideBudget?: boolean;
  compact?: boolean;
  className?: string;
  animationDelayMs?: number;
  onOpenDrillDown?: (options: {
    table: AnalyticsTable;
    label: string;
    metric: "budget" | "forecast" | "actual" | "variance";
    value: number;
  }) => void;
}) {
  const [hoverSnapshot, setHoverSnapshot] = useState<ChartHoverSnapshot | null>(null);
  const handleHoverSnapshotChange = (snapshot: ChartHoverSnapshot | null) => {
    setHoverSnapshot((current) =>
      areHoverSnapshotsEqual(current, snapshot) ? current : snapshot,
    );
  };
  return (
    <div
      className={`block ${className}`}
      style={{
        animation: `kioskCardEnter 420ms ease both`,
        animationDelay: `${animationDelayMs}ms`,
        contentVisibility: "auto",
        containIntrinsicSize: compact ? "320px" : "380px",
      }}
    >
      <article className="overflow-hidden rounded-[18px] border border-white/75 bg-[linear-gradient(165deg,rgba(255,255,255,0.84),rgba(239,246,255,0.72),rgba(240,249,255,0.68))] p-3 shadow-[0_16px_42px_rgba(15,23,42,0.1)] backdrop-blur-2xl transition hover:shadow-[0_22px_48px_rgba(15,23,42,0.14)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              {table.rowHeader}
            </p>
            <h2 className="mt-1 text-sm font-semibold text-slate-950">{table.title}</h2>
          </div>
          <Link
            href={href}
            className="shrink-0 rounded-full border border-slate-200 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600 hover:bg-slate-50"
          >
            Open
          </Link>
        </div>
        <div className="mt-2 rounded-lg border border-slate-200 bg-white/88 px-3 py-2.5">
          <p className="min-h-[18px] text-xs font-semibold text-slate-600">
            {hoverSnapshot?.label || "\u00a0"}
          </p>
          <div className="mt-1 min-h-[20px] flex flex-wrap gap-2 text-xs font-semibold text-slate-700">
            {hoverSnapshot && hoverSnapshot.metrics.length > 0 ? (
              hoverSnapshot.metrics.map((metric, index) => (
                <span
                  key={`${metric.name}-${index}`}
                  style={{ color: metric.color || undefined }}
                >
                  {metric.name}: {formatCompactMillions(metric.value)}
                </span>
              ))
            ) : (
              <span className="text-transparent select-none">.</span>
            )}
          </div>
        </div>
        <div
          className={`mt-3 rounded-xl border border-white/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.7)_0%,rgba(236,253,245,0.5)_52%,rgba(239,246,255,0.54)_100%)] px-2 py-2 backdrop-blur-xl ${
            table.id === "bdm-company" ? "h-[340px]" : compact ? "h-[248px]" : "h-[292px]"
          }`}
        >
          <AnalyticsChart
            table={table}
            hideBudget={hideBudget}
            compact={compact}
            preferPinnedTooltip
            showTooltip={false}
            onHoverSnapshotChange={handleHoverSnapshotChange}
            onOpenDetails={({ label, metric, value }) =>
              onOpenDrillDown?.({
                table,
                label,
                metric,
                value,
              })
            }
          />
        </div>
      </article>
    </div>
  );
}

function LoadingState() {
  return (
    <section className="overflow-hidden rounded-[24px] border border-white/80 bg-white/84 px-6 py-6 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
      <div className="flex items-center gap-3 text-slate-500">
        <LoaderCircle className="h-5 w-5 animate-spin" />
        Loading comparison analytics...
      </div>
    </section>
  );
}

function AnalyticsStatusBanner({
  state,
  onRetry,
}: {
  state: AnalyticsLoadState | null;
  onRetry: () => void;
}) {
  if (!state) {
    return null;
  }

  const toneClass =
    state.reason === "no_data_period"
      ? "border-sky-200 bg-sky-50 text-sky-900"
      : state.dataState === "fallback"
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : "border-amber-200 bg-amber-50 text-amber-800";

  return (
    <section className={`rounded-[18px] border px-4 py-3 text-sm ${toneClass}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p>{state.message}</p>
        {state.reason !== "no_data_period" ? (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex h-8 items-center rounded-full border border-current/30 bg-white/70 px-3 text-xs font-semibold uppercase tracking-[0.12em]"
          >
            Retry
          </button>
        ) : null}
      </div>
      {state.resolvedPeriodLabel ? (
        <p className="mt-1 text-xs opacity-85">Resolved period: {state.resolvedPeriodLabel}</p>
      ) : null}
      {state.lastSuccessAt ? (
        <p className="mt-1 text-xs opacity-85">
          Last successful sync: {new Date(state.lastSuccessAt).toLocaleString()}
        </p>
      ) : null}
    </section>
  );
}

function searchableLabels(table: AnalyticsTable) {
  if (table.dataMode === "matrix") {
    return (table.matrixRows ?? []).map((row) => row.label);
  }
  return table.rows.map((row) => row.label);
}

type DashboardCardSpec = { id: string; compact?: boolean; className?: string };

function resolveDashboardRows(hideBudgetForRole: boolean): DashboardCardSpec[][] {
  void hideBudgetForRole;
  return [
    [
      { id: "msps-budget", compact: true, className: "md:col-span-1" },
      { id: "row-us", compact: true, className: "md:col-span-1" },
      { id: "strategic-account", compact: true, className: "md:col-span-1" },
    ],
    [
      { id: "hi-vertical", compact: true, className: "md:col-span-1" },
      { id: "eeennn", compact: true, className: "md:col-span-1" },
    ],
    [
      { id: "company", compact: true, className: "md:col-span-1" },
      { id: "bdm-company", compact: true, className: "md:col-span-1" },
    ],
    [{ id: "customer-ms" }],
    [{ id: "customer-name-ms" }],
    [{ id: "customer-ee" }],
  ];
}

export function BirdeyeAnalyticsKiosk({
  variant = "kiosk",
  showRestrictedRoleBudgets = false,
}: BirdeyeAnalyticsKioskProps) {
  const isDashboard = variant === "dashboard";
  const searchParams = useSearchParams();
  const searchParamsKey = searchParams.toString();
  const pathname = usePathname();
  const { openDrillDown } = useDrillDown();
  const canEditComments =
    pathname.startsWith("/bdm") || pathname.startsWith("/practice-head");
  const hideBudgetForRole = canEditComments && !showRestrictedRoleBudgets;
  const [payload, setPayload] = useState<RevenueComparisonResponse>(EMPTY_PAYLOAD);
  const [lastGoodPayload, setLastGoodPayload] = useState<RevenueComparisonResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadState, setLoadState] = useState<AnalyticsLoadState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [viewByTableId, setViewByTableId] = useState<Record<string, ViewMode>>({});
  const [rowFilterByTableId, setRowFilterByTableId] = useState<Record<string, string>>({});
  const [varianceComments, setVarianceComments] = useState<Map<string, string>>(
    new Map(),
  );
  const [commentDialog, setCommentDialog] = useState<CommentDialogState | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [savingComment, setSavingComment] = useState(false);
  const [analyticalInsight, setAnalyticalInsight] = useState<AnalyticalInsightState>(null);
  const [tableExportingById, setTableExportingById] = useState<
    Record<string, TableExportFormat | "">
  >({});
  const lastGoodPayloadRef = useRef<RevenueComparisonResponse | null>(null);

  useEffect(() => {
    lastGoodPayloadRef.current = lastGoodPayload;
  }, [lastGoodPayload]);
  const requestedScopeFilters = useMemo(
    () => readRapidRevenueFiltersFromSearch(new URLSearchParams(searchParamsKey)),
    [searchParamsKey],
  );
  const requestedPeriodFrom = useMemo(
    () => toText(requestedScopeFilters.periodFrom).slice(0, 3) || "Apr",
    [requestedScopeFilters.periodFrom],
  );
  const requestedPeriodTo = useMemo(
    () => toText(requestedScopeFilters.periodTo).slice(0, 3) || "Mar",
    [requestedScopeFilters.periodTo],
  );
  const resolvedPeriodFrom = toText(payload.meta?.resolvedPeriod?.periodFrom).slice(0, 3);
  const resolvedPeriodTo = toText(payload.meta?.resolvedPeriod?.periodTo).slice(0, 3);
  const effectivePeriodFrom = useMemo(() => {
    if (loadState?.reason === "no_data_period" && resolvedPeriodFrom) {
      return resolvedPeriodFrom;
    }
    return requestedPeriodFrom;
  }, [loadState?.reason, requestedPeriodFrom, resolvedPeriodFrom]);
  const effectivePeriodTo = useMemo(() => {
    if (loadState?.reason === "no_data_period" && resolvedPeriodTo) {
      return resolvedPeriodTo;
    }
    return requestedPeriodTo;
  }, [loadState?.reason, requestedPeriodTo, resolvedPeriodTo]);
  const periodMonths = useMemo(
    () => resolvePeriodMonths(effectivePeriodFrom, effectivePeriodTo),
    [effectivePeriodFrom, effectivePeriodTo],
  );
  const drilldownScopeFilters = useMemo(
    () =>
      normalizeDrillDownFilters(
        mergeDrillDownFilters(
          requestedScopeFilters.practiceHeads?.length
            ? { practice_head: requestedScopeFilters.practiceHeads }
            : undefined,
          requestedScopeFilters.bdms?.length ? { bdm: requestedScopeFilters.bdms } : undefined,
          requestedScopeFilters.geoHeads?.length
            ? { geo_head: requestedScopeFilters.geoHeads }
            : undefined,
          requestedScopeFilters.verticals?.length
            ? { vertical: requestedScopeFilters.verticals }
            : undefined,
          requestedScopeFilters.horizontals?.length
            ? { horizontal: requestedScopeFilters.horizontals }
            : undefined,
          requestedScopeFilters.msps?.length ? { ms_ps: requestedScopeFilters.msps } : undefined,
          requestedScopeFilters.customerNames?.length
            ? { customer_name: requestedScopeFilters.customerNames }
            : undefined,
          requestedScopeFilters.rowUs?.length ? { row_us: requestedScopeFilters.rowUs } : undefined,
          requestedScopeFilters.entities?.length ? { entity: requestedScopeFilters.entities } : undefined,
          requestedScopeFilters.strategicAccounts?.length
            ? { strategic_account: requestedScopeFilters.strategicAccounts }
            : undefined,
          requestedScopeFilters.dealTypes?.length
            ? { deal_type: requestedScopeFilters.dealTypes }
            : undefined,
          requestedScopeFilters.eeennns?.length
            ? { eeennn: requestedScopeFilters.eeennns }
            : undefined,
          requestedScopeFilters.projectNames?.length
            ? { project_name: requestedScopeFilters.projectNames }
            : undefined,
        ),
      ),
    [requestedScopeFilters],
  );

  useEffect(() => {
    const controller = new AbortController();
    const filters = readRapidRevenueFiltersFromSearch(
      new URLSearchParams(searchParamsKey),
    );
    const query = buildRapidRevenueSearch(filters);

    async function loadComparison() {
      setLoading(true);
      setLoadState(null);
      setError(null);
      try {
        const response = await fetch(
          `/api/revenue/comparison${query ? `?${query}` : ""}`,
          { cache: "no-store", signal: controller.signal },
        );
        const body = (await response.json().catch(() => null)) as
          | RevenueComparisonResponse
          | { detail?: string }
          | null;
        if (!body || !("rows" in body)) {
          const reason = response.ok ? "backend_unavailable" : mapHttpStatusReason(response.status);
          const message =
            body && "detail" in body && body.detail
              ? body.detail
              : "Unable to load live comparison analytics.";
          const fallbackState = buildLoadState(
            {
              dataState: lastGoodPayloadRef.current ? "stale" : "fallback",
              reason,
              lastSuccessAt: lastGoodPayloadRef.current?.meta?.lastSuccessAt ?? null,
            },
            reason,
          );
          setLoadState(fallbackState ?? {
            dataState: "fallback",
            reason,
            message,
            lastSuccessAt: null,
          });
          if (lastGoodPayloadRef.current) {
            setPayload(lastGoodPayloadRef.current);
          }
          return;
        }

        const nextPayload = body as RevenueComparisonResponse;
        const fallbackReason = !response.ok ? mapHttpStatusReason(response.status) : undefined;
        const nextLoadState = buildLoadState(nextPayload.meta, fallbackReason);
        const nextStateType = nextPayload.meta?.dataState ?? (response.ok ? "fresh" : "fallback");

        if (nextStateType === "fresh") {
          setPayload(nextPayload);
          setLastGoodPayload(nextPayload);
          setLoadState(nextLoadState);
          return;
        }

        const preservedPayload = lastGoodPayloadRef.current ?? nextPayload;
        setPayload(preservedPayload);
        setLoadState(nextLoadState);
      } catch (loadError) {
        if (controller.signal.aborted) {
          return;
        }
        const reason: RevenueMetaReason =
          loadError instanceof DOMException && loadError.name === "AbortError"
            ? "timeout"
            : "backend_unavailable";
        const fallbackState = buildLoadState(
          {
            dataState: lastGoodPayloadRef.current ? "stale" : "fallback",
            reason,
            lastSuccessAt: lastGoodPayloadRef.current?.meta?.lastSuccessAt ?? null,
          },
          reason,
        );
        if (lastGoodPayloadRef.current) {
          setPayload(lastGoodPayloadRef.current);
        }
        setLoadState(
          fallbackState ?? {
            dataState: "fallback",
            reason,
            message:
              loadError instanceof Error
                ? loadError.message
                : "Unable to load live comparison analytics.",
            lastSuccessAt: null,
          },
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadComparison();
    return () => controller.abort();
  }, [reloadCount, searchParamsKey]);

  const dashboardRows = useMemo(
    () => resolveDashboardRows(hideBudgetForRole),
    [hideBudgetForRole],
  );
  const dashboardTableIds = useMemo(
    () =>
      Array.from(
        new Set(dashboardRows.flatMap((row) => row.map((card) => card.id))),
      ),
    [dashboardRows],
  );
  const tables = useMemo(
    () =>
      buildAnalyticsTables(
        payload,
        isDashboard ? { includeTableIds: dashboardTableIds } : undefined,
      ),
    [dashboardTableIds, isDashboard, payload],
  );
  const scopedTables = useMemo(() => {
    if (!hideBudgetForRole) {
      return tables;
    }
    return tables.filter((table) => table.dataMode === "compare");
  }, [hideBudgetForRole, tables]);
  const filteredTables = useMemo(() => {
    if (isDashboard) {
      return scopedTables;
    }
    const needle = deferredSearch.trim().toLowerCase();
    if (!needle) {
      return scopedTables;
    }
    return scopedTables.filter((table) =>
      [table.title, table.rowHeader, ...searchableLabels(table)]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [deferredSearch, isDashboard, scopedTables]);
  const actualsContextMonth = useMemo(() => {
    const resolvedPeriod = toText(loadState?.resolvedPeriodLabel);
    if (resolvedPeriod) {
      const parts = resolvedPeriod
        .split("-")
        .map((part) => toText(part).slice(0, 3))
        .filter(Boolean);
      if (parts.length > 0) {
        return parts[parts.length - 1];
      }
    }
    const comparisonMonth = toText(payload.comparisonMonth).slice(0, 3);
    if (comparisonMonth) {
      return comparisonMonth;
    }
    return effectivePeriodTo;
  }, [effectivePeriodTo, loadState?.resolvedPeriodLabel, payload.comparisonMonth]);

  const dashboardCards = useMemo(() => {
    const byId = new Map<string, AnalyticsTable>();
    for (const table of scopedTables) {
      byId.set(table.id, table);
    }
    return byId;
  }, [scopedTables]);

  useEffect(() => {
    let active = true;

    const resetComments = () => {
      if (!active) {
        return;
      }
      setVarianceComments(new Map());
    };

    if (isDashboard) {
      void Promise.resolve().then(resetComments);
      return () => {
        active = false;
      };
    }
    const financialYear = toText(payload.financialYear);
    if (!financialYear) {
      void Promise.resolve().then(resetComments);
      return () => {
        active = false;
      };
    }
    const comparisonMonth = toText(payload.comparisonMonth).slice(0, 3) || "Apr";
    const params = new URLSearchParams({ financialYear, comparisonMonth });
    params.append("tableIds", "customer-ms");
    params.append("tableIds", "customer-name-ms");
    params.append("tableIds", "customer-ee");
    async function loadComments() {
      try {
        const response = await fetch(
          `/api/revenue/variance-comments?${params.toString()}`,
          { cache: "no-store" },
        );
        const body = (await response.json().catch(() => null)) as
          | { rows?: VarianceCommentRow[] }
          | null;
        if (!active || !response.ok || !body || !Array.isArray(body.rows)) {
          return;
        }
        const next = new Map<string, string>();
        for (const row of body.rows) {
          const key = commentKey(toText(row.tableId), toText(row.rowLabel));
          if (toText(row.comment)) {
            next.set(key, toText(row.comment));
          }
        }
        setVarianceComments(next);
      } catch {
        // Best effort loading only.
      }
    }
    void loadComments();
    return () => {
      active = false;
    };
  }, [isDashboard, payload.comparisonMonth, payload.financialYear]);

  const kioskPath = useMemo(
    () =>
      appendSharedWorkspaceSearch(
        resolveKioskPath(pathname),
        new URLSearchParams(searchParamsKey),
      ),
    [pathname, searchParamsKey],
  );

  function openAnalyticsDrillDown(options: {
    table: AnalyticsTable;
    label: string;
    metric: DrillDownMetric;
    value: number;
  }) {
    const label = toText(options.label);
    const isGrandTotal = normalizeKey(label) === normalizeKey("Grand Total");
    const resolved = isGrandTotal
      ? { metric: options.metric, value: options.value }
      : resolveDrillDownMetric(options.table, label, options.metric, options.value);
    const metricField = resolved.metric === "actual" ? "actual" : resolved.metric;
    const basePeriodFilters =
      options.table.dataMode === "matrix"
        ? { month: ["Apr", "May", "Jun"] }
        : periodMonths.length
          ? { month: periodMonths }
          : undefined;
    const tableFilters = isGrandTotal
      ? {}
      : buildRawAwareTableFilters(options.table, label);
    const normalizedFilters = normalizeDrillDownFilters(
      mergeDrillDownFilters(
        drilldownScopeFilters,
        basePeriodFilters,
        tableFilters,
      ),
    );
    const includeMonthColumn =
      options.table.dataMode === "matrix" || periodMonths.length <= 1;
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
    const context: DrillDownContext = {
      source: "kiosk_unified",
      metric: metricField,
      value: resolved.value,
      fiscalYear: requestedScopeFilters.financialYear ?? payload.financialYear,
      filters: normalizedFilters,
      aggregation: {
        type: "sum",
        field: metricField,
      },
      columns: drillDownColumns,
      displayTitle: `Underlying Records - ${options.table.title} / ${label} / ${metricField.toUpperCase()}`,
    };
    openDrillDown(context);
  }

  async function openAnalyticalInsight(table: AnalyticsTable) {
    const financialYear =
      toText(payload.financialYear) ||
      toText(requestedScopeFilters.financialYear) ||
      "2026-2027";
    setAnalyticalInsight({
      tableId: table.id,
      tableTitle: table.title,
      loading: true,
      content: "",
      error: null,
      generatedAt: null,
    });
    try {
      const response = await fetch("/api/revenue/analytical-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tableId: table.id,
          tableTitle: table.title,
          prompt: buildAnalyticalPrompt({
            table,
            financialYear,
            periodFrom: effectivePeriodFrom,
            periodTo: effectivePeriodTo,
            hideBudget: hideBudgetForRole,
          }),
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | { content?: string; detail?: string; generatedAt?: string }
        | null;
      if (!response.ok || !body?.content) {
        throw new Error(body?.detail || "Unable to generate analytical insight.");
      }
      setAnalyticalInsight((current) =>
        current?.tableId === table.id
          ? {
              ...current,
              loading: false,
              content: body.content || "",
              error: null,
              generatedAt: body.generatedAt || new Date().toISOString(),
            }
          : current,
      );
    } catch (insightError) {
      setAnalyticalInsight((current) =>
        current?.tableId === table.id
          ? {
              ...current,
              loading: false,
              content: "",
              error:
                insightError instanceof Error
                  ? insightError.message
                  : "Unable to generate analytical insight.",
              generatedAt: null,
            }
          : current,
      );
    }
  }

  async function exportAnalyticsTable(options: {
    table: AnalyticsTable;
    format: TableExportFormat;
    financialYear: string;
    actualsLabel: string;
  }) {
    const { table, format, financialYear, actualsLabel } = options;
    setTableExportingById((current) => ({ ...current, [table.id]: format }));
    try {
      const { headers, rows } = buildVisibleTableExportRows({
        table,
        hideBudget: hideBudgetForRole,
        financialYear,
        actualsLabel,
      });
      const filename = `${table.id}-${financialYear}-${format}`;
      if (format === "csv") {
        const csvRows = [
          headers.map((header) => escapeCsvCell(header)).join(","),
          ...rows.map((row) =>
            headers.map((header) => escapeCsvCell(row[header])).join(","),
          ),
        ];
        downloadBlob(`${filename}.csv`, csvRows.join("\n"), "text/csv; charset=utf-8");
        return;
      }

      const XLSX = await import("xlsx");
      const worksheet = XLSX.utils.aoa_to_sheet([
        headers.map((header) => sanitizeExportCell(header)),
        ...rows.map((row) =>
          headers.map((header) => sanitizeExportCell(row[header])),
        ),
      ]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Table");
      const output = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
      downloadBlob(
        `${filename}.xlsx`,
        output,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : "Unable to export the selected table.",
      );
    } finally {
      setTableExportingById((current) => ({ ...current, [table.id]: "" }));
    }
  }

  function retryComparisonLoad() {
    setReloadCount((current) => current + 1);
  }

  async function saveComment() {
    if (!canEditComments) {
      return;
    }
    if (!commentDialog) {
      return;
    }
    setSavingComment(true);
    try {
      const response = await fetch("/api/revenue/variance-comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          financialYear: payload.financialYear,
          comparisonMonth: payload.comparisonMonth,
          tableId: commentDialog.tableId,
          rowLabel: commentDialog.rowLabel,
          variancePercent: commentDialog.variancePercent,
          comment: commentDraft,
        }),
      });
      if (!response.ok) {
        throw new Error("Unable to save variance comment.");
      }
      setVarianceComments((current) => {
        const next = new Map(current);
        const key = commentKey(commentDialog.tableId, commentDialog.rowLabel);
        const text = commentDraft.trim();
        if (text) {
          next.set(key, text);
        } else {
          next.delete(key);
        }
        return next;
      });
      setCommentDialog(null);
      setCommentDraft("");
    } catch (commentError) {
      setError(
        commentError instanceof Error
          ? commentError.message
          : "Unable to save variance comment.",
      );
    } finally {
      setSavingComment(false);
    }
  }

  if (loading) {
    return <LoadingState />;
  }

  if (isDashboard) {
    return (
      <div className="space-y-4">
        <AnalyticsStatusBanner state={loadState} onRetry={retryComparisonLoad} />
        {error ? (
          <section className="rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </section>
        ) : null}
        {dashboardRows.map((row, rowIndex) => (
          <section
            key={`dashboard-row-${rowIndex}`}
            className={`grid gap-4 ${
              row.length >= 4
                ? "md:grid-cols-2 xl:grid-cols-4"
                : row.length === 3
                  ? "md:grid-cols-2 xl:grid-cols-3"
                  : row.length === 2
                    ? "md:grid-cols-2"
                    : "md:grid-cols-1"
            }`}
          >
            {row.map((card, cardIndex) => {
              const table = dashboardCards.get(card.id);
              if (!table) {
                return null;
              }
              return (
                <ChartCard
                  key={card.id}
                  table={table}
                  href={`${kioskPath}#${table.id}`}
                  hideBudget={hideBudgetForRole}
                  compact={card.compact}
                  className={card.className ?? ""}
                  animationDelayMs={rowIndex * 90 + cardIndex * 70}
                  onOpenDrillDown={openAnalyticsDrillDown}
                />
              );
            })}
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[20px] border border-slate-200 bg-white px-6 py-6 shadow-[0_14px_36px_rgba(15,23,42,0.07)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0f5b8d]">
              {hideBudgetForRole ? "Forecast / Actuals" : "Budget / Forecast / Actuals"}
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
              Analytical Kiosk
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
              Tables are sourced from uploaded workbook data with YTD slicer support.
              Customer rows crossing negative 10% variance can be annotated for
              monthly review by BDM and Practice Head.
            </p>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search analytical tables"
              className="h-10 w-72 rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-[#2C74B3]"
            />
          </div>
        </div>
        {error ? (
          <div className="mt-5 rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}
        {loadState ? (
          <div className="mt-5">
            <AnalyticsStatusBanner state={loadState} onRetry={retryComparisonLoad} />
          </div>
        ) : null}
      </section>

      <main className="space-y-4">
        {filteredTables.length === 0 ? (
          <section className="rounded-[20px] border border-dashed border-slate-200 bg-white px-6 py-12 text-center text-sm font-semibold text-slate-500">
            No matching analytics tables.
          </section>
        ) : (
          filteredTables.map((table) => (
            <TableCard
              key={table.id}
              table={table}
              mode={viewByTableId[table.id] ?? "table"}
              financialYear={
                toText(payload.financialYear) ||
                toText(requestedScopeFilters.financialYear) ||
                "2026-2027"
              }
              periodFrom={effectivePeriodFrom}
              periodTo={effectivePeriodTo}
              actualsContextMonth={actualsContextMonth}
              rowFilter={rowFilterByTableId[table.id] ?? ""}
              hideBudget={hideBudgetForRole}
              canEditComments={canEditComments}
              exportingFormat={tableExportingById[table.id] ?? ""}
              onModeChange={(mode) =>
                setViewByTableId((current) => ({ ...current, [table.id]: mode }))
              }
              onRowFilterChange={(value) =>
                setRowFilterByTableId((current) => ({
                  ...current,
                  [table.id]: value,
                }))
              }
              onOpenDrillDown={openAnalyticsDrillDown}
              onExportTable={exportAnalyticsTable}
              onOpenInsight={openAnalyticalInsight}
              comments={varianceComments}
              onOpenComment={(dialog) => {
                setCommentDialog(dialog);
                setCommentDraft(dialog.comment);
              }}
            />
          ))
        )}
      </main>

      {commentDialog ? (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[20px] border border-slate-200 bg-white p-5 shadow-[0_24px_48px_rgba(15,23,42,0.26)]">
            <div className="mb-3 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-slate-950">
                  Variance Comment
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  {commentDialog.tableTitle} - {commentDialog.rowLabel}
                </p>
                <p className="mt-1 text-xs font-semibold text-amber-700">
                  Variance: {commentDialog.variancePercent.toFixed(1)}%
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCommentDialog(null);
                  setCommentDraft("");
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <textarea
              value={commentDraft}
              onChange={(event) => setCommentDraft(event.target.value)}
              placeholder={
                canEditComments
                  ? "BDM / Practice Head comment for negative variance beyond 10%"
                  : "Comment is read-only for your role."
              }
              readOnly={!canEditComments}
              className="h-28 w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-[#2C74B3]"
            />
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setCommentDialog(null);
                  setCommentDraft("");
                }}
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600"
                disabled={savingComment}
              >
                Cancel
              </button>
              {canEditComments ? (
                <button
                  type="button"
                  onClick={saveComment}
                  className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white"
                  disabled={savingComment}
                >
                  {savingComment ? "Saving..." : "Save comment"}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {analyticalInsight ? (
        <aside className="fixed right-4 top-[96px] z-[94] w-full max-w-[440px] rounded-[18px] border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.18)]">
          <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#0f5b8d]">
                Analytical Insight
              </p>
              <h3 className="mt-1 text-sm font-semibold text-slate-950">
                {analyticalInsight.tableTitle}
              </h3>
              {analyticalInsight.generatedAt ? (
                <p className="mt-1 text-[11px] text-slate-500">
                  Generated {new Date(analyticalInsight.generatedAt).toLocaleString()}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setAnalyticalInsight(null)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-[70vh] overflow-y-auto px-4 py-3">
            {analyticalInsight.loading ? (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Generating insight...
              </div>
            ) : analyticalInsight.error ? (
              <p className="text-sm text-rose-700">{analyticalInsight.error}</p>
            ) : (
              <div className="space-y-3 text-sm leading-7 text-slate-700">
                {analyticalInsight.content
                  .split(/\n+/)
                  .map((line) => line.trim())
                  .filter(Boolean)
                  .map((line, index) => (
                    <p key={`insight-line-${index}`}>{line}</p>
                  ))}
              </div>
            )}
          </div>
        </aside>
      ) : null}

      <style jsx global>{`
        @keyframes kioskCardEnter {
          from {
            opacity: 0;
            transform: translateY(8px) scale(0.995);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
}

