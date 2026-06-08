"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, LoaderCircle, Plus, Save } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TableFullscreenShell } from "@/components/table-fullscreen-shell";
import {
  formatDateMmDdYy,
  formatNumber as formatUsNumber,
} from "@/lib/format";
import type {
  ForecastDraftSaveResponse,
  ForecastSubmitResponse,
  ForecastSheetResponse,
  ForecastSubmissionRow,
} from "@/lib/rapid-revenue";

const FORECAST_MONTHS = [
  "Apr 2026",
  "May 2026",
  "Jun 2026",
  "Jul 2026",
  "Aug 2026",
  "Sep 2026",
  "Oct 2026",
  "Nov 2026",
  "Dec 2026",
  "Jan 2027",
  "Feb 2027",
  "Mar 2027",
] as const;

type ForecastMonth = (typeof FORECAST_MONTHS)[number];
type SegmentType = "MS" | "PS";

type RowValueDraft = {
  customerName?: string;
  msps?: string;
  entity?: string;
  grEntity?: string;
  rowUs?: string;
  strategicAccount?: string;
  resourceId?: string;
  resourceName?: string;
  dealType?: string;
  eeennn?: string;
  billRate?: string;
  rateType?: string;
  billedCurrency?: string;
  forex?: string;
  typeOfProjects?: string;
  startDate?: string;
  endDate?: string;
  fy?: string;
  projectName?: string;
  clientName?: string;
  ocnNumber?: string;
  practiceHead?: string;
  bdm?: string;
  geoHead?: string;
  vertical?: string;
  horizontal?: string;
  q1?: string;
  q2?: string;
  q3?: string;
  q4?: string;
};

type MergedForecastRow = {
  recordId: number;
  sourceRowNumber: number;
  customerName: string;
  msps: string;
  entity: string;
  grEntity: string;
  rowUs: string;
  strategicAccount: string;
  resourceId: string;
  resourceName: string;
  dealType: string;
  eeennn: string;
  billRate: number;
  rateType: string;
  billedCurrency: string;
  forex: number;
  typeOfProjects: string;
  startDate: string;
  endDate: string;
  fy: number;
  projectName: string;
  clientName: string;
  ocnNumber: string;
  practiceHead: string;
  bdm: string;
  geoHead: string;
  vertical: string;
  horizontal: string;
  q1: number;
  q2: number;
  q3: number;
  q4: number;
  budgets: Record<ForecastMonth, number>;
  forecasts: Record<ForecastMonth, number>;
  actualForecasts: Record<ForecastMonth, number>;
  actualForecastAvailable: Record<ForecastMonth, boolean>;
  workingDays: Record<ForecastMonth, number>;
  calendarActualWorkingDays: Record<ForecastMonth, number>;
  actualWorkingHrs: Record<ForecastMonth, number>;
  forecastSubmitted: Record<ForecastMonth, boolean>;
  draftForecasts: Record<ForecastMonth, number>;
  draftActualWorkingHrs: Record<ForecastMonth, number>;
  forecastDraftSaved: Record<ForecastMonth, boolean>;
  isManualRow: boolean;
  manualRowType: "renewal" | "new_project" | "";
  isReassignedRow: boolean;
};

const DEFAULT_WORKING_DAYS = 22;
const RATE_TYPE_OPTIONS = ["Hourly", "Fixed", "Monthly"] as const;
type ForecastRateType = (typeof RATE_TYPE_OPTIONS)[number];
const FORECAST_CURRENCY_OPTIONS = [
  "USD",
  "AUD",
  "BHD",
  "CAD",
  "CHF",
  "CZK",
  "EUR",
  "GBP",
  "HKD",
  "INR",
  "MYR",
  "PHP",
  "SGD",
] as const;
const CURRENCY_SYMBOL_BY_CODE: Record<string, string> = {
  AUD: "A$",
  BHD: "BD",
  CAD: "C$",
  CHF: "CHF",
  CZK: "Kc",
  EUR: "EUR",
  GBP: "GBP",
  GPB: "GBP",
  HKD: "HK$",
  INR: "Rs",
  MYR: "RM",
  PHP: "PHP",
  SGD: "S$",
  USD: "$",
};
const CURRENCY_WHOLE_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const BASE_HEADER_FILTER_VALUE_RESOLVERS: Record<
  string,
  (row: MergedForecastRow) => string | number
> = {
  "Customer Name": (row) => row.customerName,
  "MS/PS": (row) => row.msps,
  Entity: (row) => row.entity,
  "GR Entity": (row) => row.grEntity,
  "ROW/US": (row) => row.rowUs,
  "Strategic Account": (row) => row.strategicAccount,
  "Emp ID": (row) => row.resourceId,
  "Resource Name": (row) => row.resourceName,
  "Deal Type": (row) => row.dealType,
  EEENNN: (row) => row.eeennn,
  "Bill Rate": (row) => row.billRate,
  "Rate Type": (row) => row.rateType,
  "Billed currency": (row) => row.billedCurrency,
  Forex: (row) => row.forex,
  "Type of Projects": (row) => row.typeOfProjects,
  "Start Date": (row) => row.startDate,
  "End Date": (row) => row.endDate,
  FY: (row) => row.fy,
  "Project Name": (row) => row.projectName,
  "Client Name": (row) => row.clientName,
  "OCN Number": (row) => row.ocnNumber,
  "Practice Head": (row) => row.practiceHead,
  BDM: (row) => row.bdm,
  "Geo Head": (row) => row.geoHead,
  Vertical: (row) => row.vertical,
  Horizontal: (row) => row.horizontal,
  Q1: (row) => row.q1,
  Q2: (row) => row.q2,
  Q3: (row) => row.q3,
  Q4: (row) => row.q4,
};
type PendingRowMeta = {
  mode: "renewal" | "new_project";
  sourceRecordId?: number;
};

function resolveMsps(rawMsps: string, resourceId?: string, ocnNumber?: string) {
  void resourceId;
  void ocnNumber;
  const normalized = String(rawMsps || "").trim().toUpperCase();
  if (normalized === "MS" || normalized === "PS") {
    return normalized;
  }
  const alphaOnly = normalized.replace(/[^A-Z]/g, "");
  if (alphaOnly === "MS") {
    return "MS";
  }
  if (alphaOnly === "PS") {
    return "PS";
  }
  return "";
}

function formatNumber(value: number) {
  return formatUsNumber(value, 0);
}

function formatAmount(value: number) {
  return CURRENCY_WHOLE_FORMATTER.format(Number.isFinite(value) ? value : 0);
}

function formatUsdAmountWithSpace(value: number) {
  const formatted = formatAmount(value);
  if (formatted.startsWith("-$")) {
    return formatted.replace("-$", "-$ ");
  }
  if (formatted.startsWith("$")) {
    return formatted.replace("$", "$ ");
  }
  return formatted;
}

function formatEditableAmount(value: number) {
  if (!Number.isFinite(value)) {
    return "0";
  }
  return Number(value.toFixed(0)).toString();
}

function parseNumberish(value: string | number | null | undefined) {
  const cleaned = String(value ?? "").replace(/,/g, "").trim();
  if (!cleaned) {
    return 0;
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeRateType(value: unknown): ForecastRateType | "" {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized.includes("fixed")) {
    return "Fixed";
  }
  if (normalized.includes("month")) {
    return "Monthly";
  }
  if (normalized.includes("hour")) {
    return "Hourly";
  }
  return "";
}

function resolveRateTypeValue(value: unknown, fallback: ForecastRateType = "Hourly") {
  return normalizeRateType(value) || fallback;
}

function normalizeManualRowType(value: unknown): "renewal" | "new_project" | "" {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "renewal") {
    return "renewal";
  }
  if (normalized === "new_project" || normalized === "new-project") {
    return "new_project";
  }
  return "";
}

function getBaseHeaderFilterValue(row: MergedForecastRow, header: string) {
  const resolver = BASE_HEADER_FILTER_VALUE_RESOLVERS[header];
  if (!resolver) {
    return "";
  }
  return String(resolver(row) ?? "").trim();
}

function normalizeCurrencyCode(value: string) {
  const normalized = String(value || "USD").trim().toUpperCase();
  return normalized === "GPB" ? "GBP" : normalized;
}

const FOREX_FALLBACK_USD_PER_UNIT: Record<string, number> = {
  AUD: 0.64,
  BHD: 2.65,
  CAD: 0.72339,
  CHF: 1.24122,
  CZK: 0.043,
  EUR: 1.15741,
  GBP: 1.33852,
  GPB: 1.33852,
  HKD: 0.128,
  INR: 0.01142,
  MYR: 0.23801,
  PHP: 0.0174,
  SGD: 0.77424,
  USD: 1,
};

function resolveRowCurrencyCode(
  row: { recordId: number; billedCurrency?: string },
  rowCurrency: Record<number, string>,
) {
  return normalizeCurrencyCode(rowCurrency[row.recordId] ?? row.billedCurrency ?? "USD");
}

function getDefaultForexRate(currency: string, usdPerUnit: Record<string, number>) {
  const normalized = normalizeCurrencyCode(currency);
  if (normalized === "USD") {
    return 1;
  }
  const factor = Number(usdPerUnit[normalized] ?? 0);
  if (!Number.isFinite(factor) || factor <= 0) {
    return 1;
  }
  return Number((1 / factor).toFixed(6));
}

function convertToUsd(
  value: number,
  currency: string,
  usdPerUnit: Record<string, number>,
  forex?: number,
) {
  const normalized = normalizeCurrencyCode(currency);
  if (normalized === "USD") {
    return Number(value.toFixed(2));
  }
  if (Number.isFinite(forex) && Number(forex) > 0) {
    return Number((value / Number(forex)).toFixed(2));
  }
  const factor = Number(usdPerUnit[normalized] ?? 0);
  if (!Number.isFinite(factor) || factor <= 0) {
    return Number(value.toFixed(2));
  }
  return Number((value * factor).toFixed(2));
}

function convertFromUsd(
  value: number,
  currency: string,
  usdPerUnit: Record<string, number>,
  forex?: number,
) {
  const normalized = normalizeCurrencyCode(currency);
  if (normalized === "USD") {
    return Number(value.toFixed(2));
  }
  if (Number.isFinite(forex) && Number(forex) > 0) {
    return Number((value * Number(forex)).toFixed(2));
  }
  const factor = Number(usdPerUnit[normalized] ?? 0);
  if (!Number.isFinite(factor) || factor <= 0) {
    return Number(value.toFixed(2));
  }
  return Number((value / factor).toFixed(2));
}

function resolveEffectiveForexRate(
  row: { billedCurrency: string; forex?: number },
  rowDraft: RowValueDraft,
  currency: string,
  usdPerUnit: Record<string, number>,
) {
  void row;
  const defaultRate = getDefaultForexRate(currency, usdPerUnit);
  if (rowDraft.forex !== undefined) {
    const draftValue = parseNumberish(rowDraft.forex);
    if (draftValue > 0) {
      return draftValue;
    }
    return defaultRate;
  }
  if (normalizeCurrencyCode(currency) === "USD") {
    return 1;
  }
  return defaultRate;
}

function createEmptyMonthRecord() {
  const record = {} as Record<ForecastMonth, number>;
  for (const month of FORECAST_MONTHS) {
    record[month] = 0;
  }
  return record;
}

function createEmptyMonthFlagRecord() {
  const record = {} as Record<ForecastMonth, boolean>;
  for (const month of FORECAST_MONTHS) {
    record[month] = false;
  }
  return record;
}

const FORECAST_MONTH_INDEX = Object.fromEntries(
  FORECAST_MONTHS.map((month, index) => [month, index]),
) as Record<ForecastMonth, number>;

function forecastMonthFromDate(value: string | null | undefined): ForecastMonth | null {
  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }
  const normalized = text.includes("T") ? text.slice(0, 10) : text;
  const dateValue = new Date(normalized);
  if (Number.isNaN(dateValue.getTime())) {
    return null;
  }
  const label = dateValue.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return FORECAST_MONTHS.includes(label as ForecastMonth) ? (label as ForecastMonth) : null;
}

function firstDateForForecastMonth(month: ForecastMonth) {
  const [shortMonth, year] = month.split(" ");
  const monthIndex = new Date(`${shortMonth} 1, ${year}`).getMonth() + 1;
  return `${year}-${String(monthIndex).padStart(2, "0")}-01`;
}

function resolveBaselineForecastUsd(
  row: MergedForecastRow,
  month: ForecastMonth,
  currency: string,
  usdPerUnit: Record<string, number>,
  forex: number,
) {
  if (row.forecastSubmitted[month]) {
    const submittedValue = Number(row.forecasts[month] ?? 0);
    if (submittedValue < 0 && Number(row.budgets[month] ?? 0) >= 0) {
      return convertToUsd(Number(row.budgets[month] ?? 0), currency, usdPerUnit, forex);
    }
    return submittedValue;
  }
  return convertToUsd(Number(row.budgets[month] ?? 0), currency, usdPerUnit, forex);
}

function resolveBaselineForecastLocal(
  row: MergedForecastRow,
  month: ForecastMonth,
  currency: string,
  usdPerUnit: Record<string, number>,
  forex: number,
) {
  const budgetUsd = Number(row.budgets[month] ?? 0);
  if (row.forecastSubmitted[month]) {
    const submittedValue = Number(row.forecasts[month] ?? 0);
    if (submittedValue < 0 && budgetUsd >= 0) {
      return convertFromUsd(budgetUsd, currency, usdPerUnit, forex);
    }
    return convertFromUsd(submittedValue, currency, usdPerUnit, forex);
  }
  return convertFromUsd(budgetUsd, currency, usdPerUnit, forex);
}

function resolveBudgetUsd(
  row: MergedForecastRow,
  month: ForecastMonth,
) {
  return Number(row.budgets[month] ?? 0);
}

function normalizeWorkingDayValue(value: unknown, fallback = DEFAULT_WORKING_DAYS) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(0, Math.min(31, numeric));
}

function normalizeForecastDriverDays(value: unknown, fallback = DEFAULT_WORKING_DAYS) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric > 31) {
    return normalizeWorkingDayValue(fallback, DEFAULT_WORKING_DAYS);
  }
  return normalizeWorkingDayValue(numeric, fallback);
}

function isUsCompany(row: Pick<MergedForecastRow, "entity" | "rowUs" | "grEntity">) {
  const company = String(row.entity || row.rowUs || row.grEntity || "").trim().toUpperCase();
  const compact = company.replace(/[^A-Z0-9]/g, "");
  return compact === "US" || compact === "USA" || compact === "UNITEDSTATES";
}

function calculatePsForecastUsd(
  row: MergedForecastRow,
  month: ForecastMonth,
  rateType: ForecastRateType | "",
  billRateUsd: number,
  actualWorkingDays: number,
) {
  const workingDays = normalizeWorkingDayValue(row.workingDays[month], DEFAULT_WORKING_DAYS);
  const resolvedRateType = resolveRateTypeValue(rateType);
  if (resolvedRateType === "Fixed") {
    return Number(billRateUsd.toFixed(2));
  }
  if (resolvedRateType === "Monthly") {
    if (workingDays <= 0) {
      return 0;
    }
    return Number(((actualWorkingDays / workingDays) * billRateUsd).toFixed(2));
  }
  return Number((actualWorkingDays * billRateUsd * 8).toFixed(2));
}

function calculatePsBilledHours(
  row: MergedForecastRow,
  month: ForecastMonth,
  rateType: ForecastRateType | "",
  actualWorkingDays: number,
) {
  void row;
  void month;
  if (resolveRateTypeValue(rateType) !== "Hourly") {
    return 0;
  }
  return Number((normalizeForecastDriverDays(actualWorkingDays, DEFAULT_WORKING_DAYS) * 8).toFixed(2));
}

function getCurrencyMarker(currency: string) {
  const normalized = normalizeCurrencyCode(currency);
  return CURRENCY_SYMBOL_BY_CODE[normalized] ?? normalized;
}

function createDefaultNewProjectValues(segment?: SegmentType, bdm?: string) {
  const values: Record<string, string> = {
    "Customer Name": "",
    "MS/PS": segment ?? "PS",
    Entity: "",
    "GR Entity": "",
    "ROW/US": "",
    "Strategic Account": "",
    "Emp ID": "",
    "Resource Name": "",
    "Deal Type": "New",
    EEENNN: "EN",
    "Bill Rate": "",
    "Rate Type": "Hourly",
    "Billed currency": "USD",
    Forex: "1",
    "Type of Projects": "",
    "Start Date": "",
    "End Date": "",
    FY: "0",
    "Project Name": "",
    "Client Name": "",
    "OCN Number": "",
    "Practice Head": "",
    BDM: bdm ?? "",
    "Geo Head": "",
    Vertical: "",
    Horizontal: "",
    Q1: "0",
    Q2: "0",
    Q3: "0",
    Q4: "0",
  };
  for (const month of FORECAST_MONTHS) {
    values[month] = "0";
  }
  return values;
}

function getMspsRank(value: string) {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "MS") {
    return 0;
  }
  if (normalized === "PS") {
    return 1;
  }
  return 2;
}

export type BdmForecastSheetProps = {
  segment?: SegmentType;
  readOnly?: boolean;
  title?: string;
  subtitle?: string;
  showBdmFilter?: boolean;
  showPracticeHeadFilter?: boolean;
  showMspsFilter?: boolean;
  stickyTopRows?: number;
  applyGlobalSlicer?: boolean;
  showFunctionalForecast?: boolean;
  stickyTotalRow?: boolean;
  mirrorBudgetAsForecast?: boolean;
  displayMonth?: string | null;
  snapshotMonth?: string | null;
  showRestrictedRoleBudgets?: boolean;
};

export function BdmForecastSheet({
  segment,
  readOnly = false,
  showBdmFilter = false,
  showPracticeHeadFilter = false,
  showMspsFilter = false,
  stickyTopRows = 0,
  applyGlobalSlicer = true,
  showFunctionalForecast,
  stickyTotalRow,
  mirrorBudgetAsForecast = false,
  displayMonth = null,
  snapshotMonth = null,
  showRestrictedRoleBudgets = false,
  title = "Monthly forecast sheet",
  subtitle = "Update monthly forecast values from Apr to Mar in one save.",
}: BdmForecastSheetProps) {
  void snapshotMonth;
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [selectedBdm, setSelectedBdm] = useState<string>("ALL");
  const [selectedPracticeHead, setSelectedPracticeHead] = useState<string>("ALL");
  const [selectedMsps, setSelectedMsps] = useState<"ALL" | "MS" | "PS">("ALL");
  const [tableSearch, setTableSearch] = useState("");
  const [draftForecast, setDraftForecast] = useState<Record<string, string>>({});
  const [draftForecastUsd, setDraftForecastUsd] = useState<Record<string, string>>({});
  const [draftForecastSource, setDraftForecastSource] = useState<Record<string, "local" | "usd">>({});
  const [draftActualHrs, setDraftActualHrs] = useState<Record<string, string>>({});
  const [draftRowValues, setDraftRowValues] = useState<Record<number, RowValueDraft>>({});
  const [status, setStatus] = useState<{ tone: "success" | "error"; message: string } | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [creatingRow, setCreatingRow] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [highlightedRows, setHighlightedRows] = useState<Record<number, "renewal" | "new">>({});
  const [mismatchRows, setMismatchRows] = useState<number[]>([]);
  const [localRows, setLocalRows] = useState<MergedForecastRow[]>([]);
  const [pendingMeta, setPendingMeta] = useState<Record<number, PendingRowMeta>>({});
  const [nextTempRecordId, setNextTempRecordId] = useState(-1);
  const [selectedRows, setSelectedRows] = useState<Record<number, boolean>>({});
  const [bulkAction, setBulkAction] = useState<"renewal" | "delete">("renewal");
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [rowCurrency, setRowCurrency] = useState<Record<number, string>>({});
  const [usdPerUnit, setUsdPerUnit] = useState<Record<string, number>>(FOREX_FALLBACK_USD_PER_UNIT);
  const autosaveTimerRef = useRef<number | null>(null);
  const autosaveCooldownRef = useRef(0);
  const queryClient = useQueryClient();
  const isBdmOrPracticeForecast =
    pathname.startsWith("/bdm/forecast") || pathname.startsWith("/practice-head/forecast");
  const hideBudgetColumns = isBdmOrPracticeForecast && !showRestrictedRoleBudgets;
  const showFunctionalColumn = showFunctionalForecast ?? !readOnly;
  const shouldStickTotalRow = stickyTotalRow ?? !readOnly;
  const monthColumnCount = hideBudgetColumns
    ? showFunctionalColumn
      ? 2
      : 1
    : showFunctionalColumn
      ? 3
      : 2;
  const baseHeaders = useMemo(
    () => [
      "Customer Name",
      "MS/PS",
      "Entity",
      "GR Entity",
      "ROW/US",
      "Strategic Account",
      "Emp ID",
      "Resource Name",
      "Deal Type",
      "EEENNN",
      "Bill Rate",
      "Rate Type",
      "Billed currency",
      "Forex",
      "Type of Projects",
      "Start Date",
      "End Date",
      "FY",
      "Project Name",
      "Client Name",
      "OCN Number",
      "Practice Head",
      "BDM",
      "Geo Head",
      "Vertical",
      "Horizontal",
      "Q1",
      "Q2",
      "Q3",
      "Q4",
    ],
    [],
  );
  useEffect(() => {
    setColumnFilters((current) => {
      const next: Record<string, string> = {};
      for (const header of baseHeaders) {
        next[header] = current[header] ?? "";
      }
      return next;
    });
  }, [baseHeaders]);

  const sheetQuery = useQuery({
    queryKey: [
      "rapid-forecast-sheet",
      "all-months",
      segment ?? "ALL",
      selectedBdm,
      selectedPracticeHead,
      readOnly ? "submitted" : "draft",
    ],
    queryFn: async () => {
      const search = new URLSearchParams({
        forecastMonth: FORECAST_MONTHS[0],
        includeAllMonths: "1",
      });
      if (showBdmFilter && selectedBdm !== "ALL") {
        search.append("bdms", selectedBdm);
      }
      if (showPracticeHeadFilter && selectedPracticeHead !== "ALL") {
        search.append("practiceHeads", selectedPracticeHead);
      }
      if (!readOnly) {
        search.set("previewDrafts", "1");
      }
      const response = await fetch(`/api/revenue/forecast-sheet?${search.toString()}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("Unable to load the forecast worksheet.");
      }
      return (await response.json()) as ForecastSheetResponse;
    },
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });

  const loading = sheetQuery.isLoading;
  const error = sheetQuery.isError;
  const sheetData = sheetQuery.data;
  const hasActiveUpload = Boolean(sheetData?.hasActiveUpload);
  const uploadRequired = !loading && !error && !hasActiveUpload;

  const forecastControl = sheetData?.forecastControls ?? null;
  const visibleMonths = useMemo<ForecastMonth[]>(() => {
    if (displayMonth && FORECAST_MONTHS.includes(displayMonth as ForecastMonth)) {
      return [displayMonth as ForecastMonth];
    }
    return [...FORECAST_MONTHS];
  }, [displayMonth]);
  const activeMonthLabel = useMemo<ForecastMonth>(() => {
    const candidate =
      forecastControl?.activeMonth ??
      forecastControl?.rolloutStartMonth ??
      FORECAST_MONTHS[0];
    return FORECAST_MONTHS.includes(candidate as ForecastMonth)
      ? (candidate as ForecastMonth)
      : FORECAST_MONTHS[0];
  }, [forecastControl]);
  const editableMonthSet = useMemo(() => {
    if (!forecastControl) {
      return new Set<ForecastMonth>(FORECAST_MONTHS);
    }
    return new Set(
      (forecastControl.editableMonths ?? []).filter((month): month is ForecastMonth =>
        FORECAST_MONTHS.includes(month as ForecastMonth),
      ),
    );
  }, [forecastControl]);
  const editableMonths = useMemo(
    () => visibleMonths.filter((month) => editableMonthSet.has(month)),
    [editableMonthSet, visibleMonths],
  );
  const canEditSheet = !readOnly && editableMonths.length > 0;
  const shouldAutosaveForecast = canEditSheet && !readOnly && isBdmOrPracticeForecast;

  const bdmOptions = useMemo(() => {
    const options = new Set<string>();
    for (const row of sheetData?.rows ?? []) {
      const resolvedMsps = resolveMsps(
        String(row["MS/PS"] ?? ""),
        String(row["Emp ID"] ?? row["Resource ID"] ?? ""),
        String(row["OCN Number"] ?? ""),
      );
      if (selectedMsps !== "ALL" && resolvedMsps !== selectedMsps) {
        continue;
      }
      const practice = String(row["Practice Head"] ?? "").trim();
      if (selectedPracticeHead !== "ALL" && practice !== selectedPracticeHead) {
        continue;
      }
      const bdm = String(row.BDM ?? "").trim();
      if (bdm) {
        options.add(bdm);
      }
    }
    if (selectedPracticeHead === "ALL" && selectedMsps === "ALL") {
      (sheetData?.bdmOptions ?? []).forEach((bdm) => {
        const normalized = bdm.trim();
        if (normalized) {
          options.add(normalized);
        }
      });
    }
    return ["ALL", ...Array.from(options).sort((left, right) => left.localeCompare(right))];
  }, [selectedMsps, selectedPracticeHead, sheetData]);

  const practiceHeadOptions = useMemo(() => {
    const options = new Set<string>();
    (sheetData?.rows ?? []).forEach((row) => {
      const resolvedMsps = resolveMsps(
        String(row["MS/PS"] ?? ""),
        String(row["Emp ID"] ?? row["Resource ID"] ?? ""),
        String(row["OCN Number"] ?? ""),
      );
      if (selectedMsps !== "ALL" && resolvedMsps !== selectedMsps) {
        return;
      }
      const bdm = String(row.BDM ?? "").trim();
      if (selectedBdm !== "ALL" && bdm !== selectedBdm) {
        return;
      }
      const normalized = String(row["Practice Head"] ?? "").trim();
      if (normalized) {
        options.add(normalized);
      }
    });
    return ["ALL", ...Array.from(options).sort((left, right) => left.localeCompare(right))];
  }, [selectedBdm, selectedMsps, sheetData]);

  useEffect(() => {
    if (!bdmOptions.includes(selectedBdm)) {
      setSelectedBdm("ALL");
    }
  }, [bdmOptions, selectedBdm]);
  useEffect(() => {
    if (!practiceHeadOptions.includes(selectedPracticeHead)) {
      setSelectedPracticeHead("ALL");
    }
  }, [practiceHeadOptions, selectedPracticeHead]);

  useEffect(() => {
    let active = true;
    const loadExchangeRates = async () => {
      try {
        const response = await fetch("/api/exchange-rates", { cache: "no-store" });
        if (!response.ok) {
          return;
        }
        const body = (await response.json()) as {
          usdPerUnit?: Record<string, number>;
        };
        if (!active || !body.usdPerUnit || typeof body.usdPerUnit !== "object") {
          return;
        }
        const normalizedRates: Record<string, number> = {};
        for (const [key, value] of Object.entries(body.usdPerUnit)) {
          const numeric = Number(value);
          if (!Number.isFinite(numeric) || numeric <= 0) {
            continue;
          }
          normalizedRates[key.toUpperCase()] = numeric;
        }
        if (normalizedRates.GBP && !normalizedRates.GPB) {
          normalizedRates.GPB = normalizedRates.GBP;
        }
        if (!normalizedRates.USD) {
          normalizedRates.USD = 1;
        }
        setUsdPerUnit((current) => ({
          ...current,
          ...normalizedRates,
        }));
      } catch {
        // Keep existing fallback rates.
      }
    };

    void loadExchangeRates();
    return () => {
      active = false;
    };
  }, []);

  const mergedRows = useMemo(() => {
    const map = new Map<number, MergedForecastRow>();
    const monthSnapshots = sheetData?.monthSnapshots ?? {};

    for (const row of sheetData?.rows ?? []) {
      const resolvedMsps = resolveMsps(
        String(row["MS/PS"] ?? ""),
        String(row["Emp ID"] ?? row["Resource ID"] ?? ""),
        String(row["OCN Number"] ?? ""),
      );
      if (segment && resolvedMsps !== segment) {
        continue;
      }

      const budgets = createEmptyMonthRecord();
      const forecasts = createEmptyMonthRecord();
      const actualForecasts = createEmptyMonthRecord();
      const actualForecastAvailable = createEmptyMonthFlagRecord();
      const workingDays = createEmptyMonthRecord();
      const calendarActualWorkingDays = createEmptyMonthRecord();
      const actualWorkingHrs = createEmptyMonthRecord();
      const forecastSubmitted = createEmptyMonthFlagRecord();
      const draftForecasts = createEmptyMonthRecord();
      const draftActualWorkingHrs = createEmptyMonthRecord();
      const forecastDraftSaved = createEmptyMonthFlagRecord();
      const rowSnapshots = monthSnapshots[String(row.recordId)] ?? {};

      for (const month of FORECAST_MONTHS) {
        const snapshot = rowSnapshots[month] ?? {};
        const monthWorkingDays = normalizeWorkingDayValue(
          row[`${month} Working Days`],
          DEFAULT_WORKING_DAYS,
        );
        const monthActualWorkingDays = normalizeWorkingDayValue(
          row[`${month} Actual Working Days`],
          monthWorkingDays,
        );
        const rawActualHrs = Number(snapshot.billableActualHrs ?? 0);
        const rawDraftActualHrs = Number(snapshot.draftBillableActualHrs ?? 0);
        workingDays[month] = monthWorkingDays;
        calendarActualWorkingDays[month] = monthActualWorkingDays;
        budgets[month] = Number(row[month] ?? 0);
        forecasts[month] = Number(snapshot.forecastValue ?? 0);
        actualForecasts[month] = Number(row[`${month} Actual Revenue`] ?? 0);
        actualForecastAvailable[month] = Boolean(row[`${month} Actual Available`]);
        actualWorkingHrs[month] =
          resolvedMsps === "PS"
            ? rawActualHrs > 0
              ? normalizeForecastDriverDays(rawActualHrs, monthActualWorkingDays)
              : monthActualWorkingDays
            : rawActualHrs;
        forecastSubmitted[month] =
          Boolean(snapshot.submittedAt) || String(snapshot.submittedBy ?? "").trim().length > 0;
        draftForecasts[month] = Number(snapshot.draftForecastValue ?? 0);
        draftActualWorkingHrs[month] =
          resolvedMsps === "PS"
            ? rawDraftActualHrs > 0
              ? normalizeForecastDriverDays(rawDraftActualHrs, monthActualWorkingDays)
              : monthActualWorkingDays
            : rawDraftActualHrs;
        forecastDraftSaved[month] =
          Boolean(snapshot.draftUpdatedAt) || String(snapshot.draftUpdatedBy ?? "").trim().length > 0;
      }

      map.set(row.recordId, {
        recordId: row.recordId,
        sourceRowNumber: Number(row["Source Row Number"] ?? 0),
        customerName: String(row["Customer Name"] ?? ""),
        msps: resolvedMsps,
        entity: String(row.Entity ?? ""),
        grEntity: String(row["GR Entity"] ?? ""),
        rowUs: String(row["ROW/US"] ?? ""),
        strategicAccount: String(row["Strategic Account"] ?? ""),
        resourceId: String(row["Emp ID"] ?? row["Resource ID"] ?? ""),
        resourceName: String(row["Resource Name"] ?? ""),
        dealType: String(row["Deal Type"] ?? ""),
        eeennn: String(row.EEENNN ?? ""),
        billRate: Number(row["Bill Rate"] ?? 0),
        rateType: String(row["Rate Type"] ?? ""),
        billedCurrency: String(row["Billed currency"] ?? "USD"),
        forex: Number(row.Forex ?? 0),
        typeOfProjects: String(row["Type of Projects"] ?? ""),
        startDate: String(row["Start Date"] ?? ""),
        endDate: String(row["End Date"] ?? ""),
        fy: Number(row.FY ?? 0),
        projectName: String(row["Project Name"] ?? ""),
        clientName: String(row["Client Name"] ?? ""),
        ocnNumber: String(row["OCN Number"] ?? ""),
        practiceHead: String(row["Practice Head"] ?? ""),
        bdm: String(row.BDM ?? ""),
        geoHead: String(row["Geo Head"] ?? ""),
        vertical: String(row.Vertical ?? ""),
        horizontal: String(row.Horizontal ?? ""),
        q1: Number(row.Q1 ?? 0),
        q2: Number(row.Q2 ?? 0),
        q3: Number(row.Q3 ?? 0),
        q4: Number(row.Q4 ?? 0),
        budgets,
        forecasts,
        actualForecasts,
        actualForecastAvailable,
        workingDays,
        calendarActualWorkingDays,
        actualWorkingHrs,
        forecastSubmitted,
        draftForecasts,
        draftActualWorkingHrs,
        forecastDraftSaved,
        isManualRow: Boolean(row["Is Manual Row"]),
        manualRowType: normalizeManualRowType(row["Manual Row Type"]),
        isReassignedRow: Boolean(row["Is Reassigned Row"]),
      });
    }

    return Array.from(map.values()).sort((left, right) => {
      const mspsCompare = getMspsRank(left.msps) - getMspsRank(right.msps);
      if (mspsCompare !== 0) {
        return mspsCompare;
      }
      const sourceCompare = Number(left.sourceRowNumber || 0) - Number(right.sourceRowNumber || 0);
      if (sourceCompare !== 0) {
        return sourceCompare;
      }
      return left.recordId - right.recordId;
    });
  }, [segment, sheetData]);

  const allRows = useMemo(
    () =>
      [...mergedRows, ...localRows].sort((left, right) => {
        const mspsCompare = getMspsRank(left.msps) - getMspsRank(right.msps);
        if (mspsCompare !== 0) {
          return mspsCompare;
        }
        const sourceCompare = Number(left.sourceRowNumber || 0) - Number(right.sourceRowNumber || 0);
        if (sourceCompare !== 0) {
          return sourceCompare;
        }
        return left.recordId - right.recordId;
      }),
    [localRows, mergedRows],
  );

  const slicerFilters = useMemo(() => {
    if (!applyGlobalSlicer) {
      return {
        customerNames: [],
        msps: [],
        rowUs: [],
        entities: [],
        strategicAccounts: [],
        dealTypes: [],
        eeennns: [],
        projectNames: [],
        practiceHeads: [],
        geoHeads: [],
        verticals: [],
        horizontals: [],
      };
    }
    const read = (key: string) =>
      searchParams
        .getAll(key)
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
    return {
      customerNames: read("customerNames"),
      msps: read("msps"),
      rowUs: read("rowUs"),
      entities: read("entities"),
      strategicAccounts: read("strategicAccounts"),
      dealTypes: read("dealTypes"),
      eeennns: read("eeennns"),
      projectNames: read("projectNames"),
      practiceHeads: read("practiceHeads"),
      geoHeads: read("geoHeads"),
      verticals: read("verticals"),
      horizontals: read("horizontals"),
    };
  }, [applyGlobalSlicer, searchParams]);

  const filteredRows = useMemo(() => {
    const needle = tableSearch.trim().toLowerCase();
    const matchList = (values: string[], current: string) =>
      values.length === 0 || values.includes(String(current || "").trim().toLowerCase());

    return allRows.filter((row) => {
      const slicerMatch =
        (selectedMsps === "ALL" || row.msps === selectedMsps) &&
        matchList(slicerFilters.customerNames, row.customerName) &&
        matchList(slicerFilters.msps, row.msps) &&
        matchList(slicerFilters.rowUs, row.rowUs) &&
        matchList(slicerFilters.entities, row.entity) &&
        matchList(slicerFilters.strategicAccounts, row.strategicAccount) &&
        matchList(slicerFilters.dealTypes, row.dealType) &&
        matchList(slicerFilters.eeennns, row.eeennn) &&
        matchList(slicerFilters.projectNames, row.projectName) &&
        matchList(slicerFilters.practiceHeads, row.practiceHead) &&
        matchList(slicerFilters.geoHeads, row.geoHead) &&
        matchList(slicerFilters.verticals, row.vertical) &&
        matchList(slicerFilters.horizontals, row.horizontal);
      if (!slicerMatch) {
        return false;
      }
      for (const header of baseHeaders) {
        const normalizedFilter = String(columnFilters[header] || "").trim().toLowerCase();
        if (!normalizedFilter || normalizedFilter === "all") {
          continue;
        }
        const currentValue = getBaseHeaderFilterValue(row, header).toLowerCase();
        if (currentValue !== normalizedFilter) {
          return false;
        }
      }
      if (!needle) {
        return true;
      }
      const haystack = [
        row.recordId,
        row.sourceRowNumber,
        row.customerName,
        row.msps,
        row.entity,
        row.grEntity,
        row.rowUs,
        row.strategicAccount,
        row.resourceId,
        row.resourceName,
        row.dealType,
        row.eeennn,
        row.rateType,
        row.billedCurrency,
        row.typeOfProjects,
        row.projectName,
        row.clientName,
        row.ocnNumber,
        row.practiceHead,
        row.bdm,
        row.geoHead,
        row.vertical,
        row.horizontal,
        ...visibleMonths.flatMap((month) => [
          month,
          row.budgets[month],
          row.forecasts[month],
          row.draftForecasts[month],
          row.actualWorkingHrs[month],
        ]),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [
    allRows,
    baseHeaders,
    columnFilters,
    selectedMsps,
    slicerFilters,
    tableSearch,
    visibleMonths,
  ]);

  const columnFilterOptions = useMemo(() => {
    const options: Record<string, string[]> = {};
    for (const header of baseHeaders) {
      const values = new Set<string>();
      for (const row of allRows) {
        const value = getBaseHeaderFilterValue(row, header);
        if (!value) {
          continue;
        }
        values.add(value);
        if (values.size >= 750) {
          break;
        }
      }
      options[header] = ["ALL", ...Array.from(values).sort((left, right) => left.localeCompare(right))];
    }
    return options;
  }, [allRows, baseHeaders]);
  const selectedCustomerFilterLabel = useMemo(() => {
    const value = String(columnFilters["Customer Name"] ?? "").trim();
    if (!value || value.toUpperCase() === "ALL") {
      return "";
    }
    return value;
  }, [columnFilters]);

  const getEffectiveForecastState = useCallback((row: MergedForecastRow, month: ForecastMonth) => {
    const key = `${row.recordId}|${month}`;
    const rowDraft = draftRowValues[row.recordId] ?? {};
    const currencyCode = resolveRowCurrencyCode(row, rowCurrency);
    const forexRate = resolveEffectiveForexRate(row, rowDraft, currencyCode, usdPerUnit);
    const draftSource = draftForecastSource[key];
    const persistedActualHours =
      row.forecastDraftSaved[month]
        ? Number(
            row.draftActualWorkingHrs[month] ??
              row.actualWorkingHrs[month] ??
              row.calendarActualWorkingDays[month] ??
              DEFAULT_WORKING_DAYS,
          )
        : Number(
            row.actualWorkingHrs[month] ??
              row.calendarActualWorkingDays[month] ??
              DEFAULT_WORKING_DAYS,
          );
    const actualHours =
      draftActualHrs[key] === undefined
        ? normalizeForecastDriverDays(persistedActualHours, row.calendarActualWorkingDays[month] ?? DEFAULT_WORKING_DAYS)
        : normalizeForecastDriverDays(draftActualHrs[key], persistedActualHours);
    const baselineUsd = resolveBaselineForecastUsd(row, month, currencyCode, usdPerUnit, forexRate);
    const baselineLocal = resolveBaselineForecastLocal(
      row,
      month,
      currencyCode,
      usdPerUnit,
      forexRate,
    );
    if (row.actualForecastAvailable[month]) {
      const actualUsd = Number(row.actualForecasts[month] ?? 0);
      return {
        actualHours,
        currencyCode,
        forexRate,
        local: convertFromUsd(actualUsd, currencyCode, usdPerUnit, forexRate),
        source: "actual" as const,
        usd: actualUsd,
      };
    }
    if (readOnly && !row.forecastSubmitted[month]) {
      return {
        actualHours,
        currencyCode,
        forexRate,
        local: 0,
        source: "forecast" as const,
        usd: 0,
      };
    }
    if (mirrorBudgetAsForecast) {
      const budgetUsd = Number(row.budgets[month] ?? 0);
      return {
        actualHours,
        currencyCode,
        forexRate,
        local: convertFromUsd(budgetUsd, currencyCode, usdPerUnit, forexRate),
        source: "forecast" as const,
        usd: budgetUsd,
      };
    }
    if (draftSource === "local" && draftForecast[key] !== undefined) {
      const local = parseNumberish(draftForecast[key]);
      return {
        actualHours,
        currencyCode,
        forexRate,
        local,
        source: "forecast" as const,
        usd: convertToUsd(local, currencyCode, usdPerUnit, forexRate),
      };
    }
    if (draftSource === "usd" && draftForecastUsd[key] !== undefined) {
      const usd = parseNumberish(draftForecastUsd[key]);
      return {
        actualHours,
        currencyCode,
        forexRate,
        local: convertFromUsd(usd, currencyCode, usdPerUnit, forexRate),
        source: "forecast" as const,
        usd,
      };
    }
    const persistedDraftUsd =
      row.forecastDraftSaved[month] && row.draftForecasts[month] < 0 && Number(row.budgets[month] ?? 0) >= 0
        ? convertToUsd(Number(row.budgets[month] ?? 0), currencyCode, usdPerUnit, forexRate)
        : Number(row.draftForecasts[month] ?? 0);
    const persistedDraftLocal =
      row.forecastDraftSaved[month] && row.draftForecasts[month] < 0 && Number(row.budgets[month] ?? 0) >= 0
        ? convertFromUsd(Number(row.budgets[month] ?? 0), currencyCode, usdPerUnit, forexRate)
        : convertFromUsd(Number(row.draftForecasts[month] ?? 0), currencyCode, usdPerUnit, forexRate);

    if (segment === "PS") {
      const hasPsDriverDraft =
        draftActualHrs[key] !== undefined ||
        rowDraft.billRate !== undefined ||
        rowDraft.rateType !== undefined ||
        rowDraft.billedCurrency !== undefined ||
        rowDraft.forex !== undefined;
      if (!hasPsDriverDraft) {
        if (row.forecastDraftSaved[month]) {
          return {
            actualHours,
            currencyCode,
            forexRate,
            local: persistedDraftLocal,
            source: "forecast" as const,
            usd: persistedDraftUsd,
          };
        }
        return {
          actualHours,
          currencyCode,
          forexRate,
          local: baselineLocal,
          source: "forecast" as const,
          usd: baselineUsd,
        };
      }
      const billRateLocal =
        rowDraft.billRate === undefined
          ? convertFromUsd(Number(row.billRate || 0), currencyCode, usdPerUnit, forexRate)
          : parseNumberish(rowDraft.billRate);
      const rateType =
        rowDraft.rateType === undefined
          ? normalizeRateType(row.rateType)
          : normalizeRateType(rowDraft.rateType);
      const usd = Number(
        calculatePsForecastUsd(
          row,
          month,
          rateType,
          convertToUsd(billRateLocal, currencyCode, usdPerUnit, forexRate),
          actualHours,
        ).toFixed(2),
      );
      return {
        actualHours,
        currencyCode,
        forexRate,
        local: convertFromUsd(usd, currencyCode, usdPerUnit, forexRate),
        source: "forecast" as const,
        usd,
      };
    }
    const hasMsDriverDraft =
      rowDraft.billRate !== undefined ||
      rowDraft.rateType !== undefined ||
      rowDraft.billedCurrency !== undefined ||
      rowDraft.forex !== undefined;
    if (segment === "MS" && (hasMsDriverDraft || row.manualRowType === "new_project")) {
      const billRateLocal =
        rowDraft.billRate === undefined
          ? convertFromUsd(Number(row.billRate || 0), currencyCode, usdPerUnit, forexRate)
          : parseNumberish(rowDraft.billRate);
      const rateType =
        rowDraft.rateType === undefined
          ? normalizeRateType(row.rateType)
          : normalizeRateType(rowDraft.rateType);
      const msActualDays = normalizeForecastDriverDays(
        row.calendarActualWorkingDays[month] ?? row.workingDays[month] ?? DEFAULT_WORKING_DAYS,
        row.workingDays[month] ?? DEFAULT_WORKING_DAYS,
      );
      const usd = calculatePsForecastUsd(
        row,
        month,
        rateType,
        convertToUsd(billRateLocal, currencyCode, usdPerUnit, forexRate),
        msActualDays,
      );
      return {
        actualHours,
        currencyCode,
        forexRate,
        local: convertFromUsd(usd, currencyCode, usdPerUnit, forexRate),
        source: "forecast" as const,
        usd,
      };
    }
    if (row.forecastDraftSaved[month]) {
      return {
        actualHours,
        currencyCode,
        forexRate,
        local: persistedDraftLocal,
        source: "forecast" as const,
        usd: persistedDraftUsd,
      };
    }
    return {
      actualHours,
      currencyCode,
      forexRate,
      local: baselineLocal,
      source: "forecast" as const,
      usd: baselineUsd,
    };
  }, [
    draftActualHrs,
    draftForecast,
    draftForecastSource,
    draftForecastUsd,
    draftRowValues,
    mirrorBudgetAsForecast,
    readOnly,
    rowCurrency,
    segment,
    usdPerUnit,
  ]);

  const getBudgetUsdValue = useCallback(
    (row: MergedForecastRow, month: ForecastMonth) => {
      return resolveBudgetUsd(row, month);
    },
    [],
  );

  const getDraftForecastInputValue = useCallback(
    (row: MergedForecastRow, month: ForecastMonth, mode: "local" | "usd") => {
      const key = `${row.recordId}|${month}`;
      const forecastState = getEffectiveForecastState(row, month);
      const source = draftForecastSource[key];
      if (mode === "local") {
        if (source === "local" && draftForecast[key] !== undefined) {
          return draftForecast[key];
        }
        if (source === "usd" && draftForecastUsd[key] !== undefined) {
          return formatEditableAmount(
            convertFromUsd(
              parseNumberish(draftForecastUsd[key]),
              forecastState.currencyCode,
              usdPerUnit,
              forecastState.forexRate,
            ),
          );
        }
        return formatEditableAmount(forecastState.local);
      }
      if (source === "usd" && draftForecastUsd[key] !== undefined) {
        return draftForecastUsd[key];
      }
      if (source === "local" && draftForecast[key] !== undefined) {
        return formatEditableAmount(
          convertToUsd(
            parseNumberish(draftForecast[key]),
            forecastState.currencyCode,
            usdPerUnit,
            forecastState.forexRate,
          ),
        );
      }
      return formatEditableAmount(forecastState.usd);
    },
    [draftForecast, draftForecastSource, draftForecastUsd, getEffectiveForecastState, usdPerUnit],
  );

  const totalBudget = useMemo(
    () =>
      filteredRows.reduce(
        (total, row) =>
          total +
          visibleMonths.reduce((rowTotal, month) => rowTotal + getBudgetUsdValue(row, month), 0),
        0,
      ),
    [filteredRows, getBudgetUsdValue, visibleMonths],
  );

  const totalForecast = useMemo(
    () =>
      filteredRows.reduce(
        (total, row) =>
          total +
          visibleMonths.reduce((rowTotal, month) => {
            return rowTotal + getEffectiveForecastState(row, month).usd;
          }, 0),
        0,
      ),
    [filteredRows, getEffectiveForecastState, visibleMonths],
  );

  const monthTotals = useMemo(() => {
    const budget = Object.fromEntries(visibleMonths.map((month) => [month, 0])) as Record<
      ForecastMonth,
      number
    >;
    const forecast = Object.fromEntries(visibleMonths.map((month) => [month, 0])) as Record<
      ForecastMonth,
      number
    >;
    const workingDays = Object.fromEntries(visibleMonths.map((month) => [month, 0])) as Record<
      ForecastMonth,
      number
    >;
    const actualHrs = Object.fromEntries(visibleMonths.map((month) => [month, 0])) as Record<
      ForecastMonth,
      number
    >;

    for (const row of filteredRows) {
      for (const month of visibleMonths) {
        budget[month] += getBudgetUsdValue(row, month);
        const forecastState = getEffectiveForecastState(row, month);
        if (segment === "PS") {
          workingDays[month] += normalizeWorkingDayValue(row.workingDays[month], DEFAULT_WORKING_DAYS);
          actualHrs[month] += forecastState.actualHours;
          forecast[month] += forecastState.usd;
        } else {
          forecast[month] += forecastState.usd;
        }
      }
    }

    return { budget, forecast, workingDays, actualHrs };
  }, [filteredRows, getBudgetUsdValue, getEffectiveForecastState, segment, visibleMonths]);

  const hasUnsavedForecastChanges = useMemo(() => {
    if (
      Object.keys(draftForecast).length > 0 ||
      Object.keys(draftForecastUsd).length > 0 ||
      Object.keys(draftActualHrs).length > 0 ||
      Object.keys(draftRowValues).length > 0 ||
      localRows.length > 0 ||
      Object.keys(pendingMeta).length > 0
    ) {
      return true;
    }

    return allRows.some((row) => {
      const currentCurrency = resolveRowCurrencyCode(row, rowCurrency);
      const sourceCurrency = normalizeCurrencyCode(row.billedCurrency || "USD");
      return currentCurrency !== sourceCurrency;
    });
  }, [
    allRows,
    draftActualHrs,
    draftForecast,
    draftForecastUsd,
    draftRowValues,
    localRows,
    pendingMeta,
    rowCurrency,
  ]);

  const fixedColumnsCount = baseHeaders.length + (canEditSheet ? 1 : 0);

  function updateRowDraft(recordId: number, patch: RowValueDraft) {
    setDraftRowValues((current) => ({
      ...current,
      [recordId]: {
        ...(current[recordId] ?? {}),
        ...patch,
      },
    }));
  }

  const invalidateAll = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["rapid-forecast-sheet"] });
    await queryClient.invalidateQueries({ queryKey: ["rapid-revenue-notifications"] });
  }, [queryClient]);

  function createLocalRenewalRow(recordId: number) {
    const source = allRows.find((row) => row.recordId === recordId);
    if (!source) {
      return;
    }
    const emptyMonths = createEmptyMonthRecord();
    const tempId = nextTempRecordId;
    setNextTempRecordId((current) => current - 1);
    setLocalRows((current) => [
      ...current,
      {
        ...source,
        recordId: tempId,
        dealType: "Renewal",
        eeennn: "EN",
        billRate: 0,
        startDate: firstDateForForecastMonth(activeMonthLabel),
        endDate: "",
        fy: 0,
        q1: 0,
        q2: 0,
        q3: 0,
        q4: 0,
        budgets: { ...emptyMonths },
        forecasts: { ...emptyMonths },
        actualForecasts: { ...emptyMonths },
        actualForecastAvailable: createEmptyMonthFlagRecord(),
        workingDays: { ...source.workingDays },
        calendarActualWorkingDays: { ...source.calendarActualWorkingDays },
        actualWorkingHrs: { ...emptyMonths },
        forecastSubmitted: createEmptyMonthFlagRecord(),
        draftForecasts: createEmptyMonthRecord(),
        draftActualWorkingHrs: createEmptyMonthRecord(),
        forecastDraftSaved: createEmptyMonthFlagRecord(),
        isManualRow: true,
        manualRowType: "renewal",
        isReassignedRow: false,
      },
    ]);
    setPendingMeta((current) => ({
      ...current,
      [tempId]: { mode: "renewal", sourceRecordId: recordId },
    }));
    setHighlightedRows((current) => ({ ...current, [tempId]: "renewal" }));
  }

  function createLocalProjectRow() {
    const defaults = createDefaultNewProjectValues(
      segment,
      showBdmFilter && selectedBdm !== "ALL" ? selectedBdm : undefined,
    );
    const emptyMonths = createEmptyMonthRecord();
    const defaultWorkingDays = Object.fromEntries(
      FORECAST_MONTHS.map((month) => [month, DEFAULT_WORKING_DAYS]),
    ) as Record<ForecastMonth, number>;
    const tempId = nextTempRecordId;
    setNextTempRecordId((current) => current - 1);
    setLocalRows((current) => [
      ...current,
      {
        recordId: tempId,
        sourceRowNumber: Number.MAX_SAFE_INTEGER,
        customerName: String(defaults["Customer Name"] ?? ""),
        msps: String(defaults["MS/PS"] ?? segment ?? ""),
        entity: String(defaults.Entity ?? ""),
        grEntity: String(defaults["GR Entity"] ?? ""),
        rowUs: String(defaults["ROW/US"] ?? ""),
        strategicAccount: String(defaults["Strategic Account"] ?? ""),
        resourceId: String(defaults["Emp ID"] ?? defaults["Resource ID"] ?? ""),
        resourceName: String(defaults["Resource Name"] ?? ""),
        dealType: String(defaults["Deal Type"] ?? "New"),
        eeennn: String(defaults.EEENNN ?? "EN"),
        billRate: 0,
        rateType: String(defaults["Rate Type"] ?? ""),
        billedCurrency: String(defaults["Billed currency"] ?? "USD"),
        forex: parseNumberish(defaults.Forex ?? "1"),
        typeOfProjects: String(defaults["Type of Projects"] ?? ""),
        startDate: "",
        endDate: "",
        fy: 0,
        projectName: String(defaults["Project Name"] ?? ""),
        clientName: String(defaults["Client Name"] ?? ""),
        ocnNumber: String(defaults["OCN Number"] ?? ""),
        practiceHead: String(defaults["Practice Head"] ?? ""),
        bdm: String(defaults.BDM ?? ""),
        geoHead: String(defaults["Geo Head"] ?? ""),
        vertical: String(defaults.Vertical ?? ""),
        horizontal: String(defaults.Horizontal ?? ""),
        q1: 0,
        q2: 0,
        q3: 0,
        q4: 0,
        budgets: { ...emptyMonths },
        forecasts: { ...emptyMonths },
        actualForecasts: { ...emptyMonths },
        actualForecastAvailable: createEmptyMonthFlagRecord(),
        workingDays: { ...defaultWorkingDays },
        calendarActualWorkingDays: { ...defaultWorkingDays },
        actualWorkingHrs: Object.fromEntries(
          FORECAST_MONTHS.map((month) => [month, DEFAULT_WORKING_DAYS]),
        ) as Record<ForecastMonth, number>,
        forecastSubmitted: createEmptyMonthFlagRecord(),
        draftForecasts: { ...emptyMonths },
        draftActualWorkingHrs: Object.fromEntries(
          FORECAST_MONTHS.map((month) => [month, DEFAULT_WORKING_DAYS]),
        ) as Record<ForecastMonth, number>,
        forecastDraftSaved: createEmptyMonthFlagRecord(),
        isManualRow: true,
        manualRowType: "new_project",
        isReassignedRow: false,
      },
    ]);
    setPendingMeta((current) => ({
      ...current,
      [tempId]: { mode: "new_project" },
    }));
    setHighlightedRows((current) => ({ ...current, [tempId]: "new" }));
  }

  const persistForecast = useCallback(async (mode: "draft" | "submit") => {
    if (!canEditSheet) {
      return;
    }

    setSaving(true);
    setStatus(null);

    try {
      const createdIdMap: Record<number, number> = {};
      const skippedEmptyRowIds: number[] = [];
      const defaultFinancialYear = sheetData?.financialYear ?? null;

      const hasRowData = (row: MergedForecastRow, rowDraft: RowValueDraft) => {
        const values = [
          row.customerName,
          row.projectName,
          row.clientName,
          row.entity,
          row.rowUs,
          row.strategicAccount,
          row.ocnNumber,
          row.practiceHead,
          row.bdm,
          row.geoHead,
          row.vertical,
          row.horizontal,
          rowDraft.projectName ?? "",
          rowDraft.rateType ?? "",
          rowDraft.billedCurrency ?? "",
          rowDraft.forex ?? "",
          rowDraft.typeOfProjects ?? "",
          rowDraft.startDate ?? "",
          rowDraft.endDate ?? "",
          rowDraft.billRate ?? "",
          rowDraft.clientName ?? "",
          ...Object.values(rowDraft),
        ];
        if (values.some((value) => String(value ?? "").trim().length > 0)) {
          return true;
        }
        return visibleMonths.some((month) => {
          const key = `${row.recordId}|${month}`;
          return (
            parseNumberish(draftForecast[key]) > 0 ||
            parseNumberish(draftForecastUsd[key]) > 0 ||
            parseNumberish(draftActualHrs[key]) > 0
          );
        });
      };

      const textValue = (draftValue: string | undefined, fallback: unknown) =>
        String(draftValue === undefined ? fallback ?? "" : draftValue ?? "");
      const numericValue = (draftValue: string | undefined, fallback: unknown) =>
        draftValue === undefined ? Number(fallback ?? 0) : parseNumberish(draftValue);
      const buildWorkbookRowValues = (
        row: MergedForecastRow,
        rowDraft: RowValueDraft,
        rowCurrencyCode: string,
        nextForex: number,
        nextBillRateUsd: number,
      ) => ({
        "Customer Name": textValue(rowDraft.customerName, row.customerName),
        "MS/PS": textValue(rowDraft.msps, row.msps),
        Entity: textValue(rowDraft.entity, row.entity),
        "GR Entity": textValue(rowDraft.grEntity, row.grEntity),
        "ROW/US": textValue(rowDraft.rowUs, row.rowUs),
        "Strategic Account": textValue(rowDraft.strategicAccount, row.strategicAccount),
        "Emp ID": textValue(rowDraft.resourceId, row.resourceId),
        "Resource Name": textValue(rowDraft.resourceName, row.resourceName),
        "Deal Type": textValue(rowDraft.dealType, row.dealType),
        EEENNN: textValue(rowDraft.eeennn, row.eeennn),
        "Bill Rate": nextBillRateUsd,
        "Rate Type": normalizeRateType(
          rowDraft.rateType === undefined ? row.rateType : rowDraft.rateType,
        ),
        "Billed currency": textValue(rowDraft.billedCurrency, rowCurrencyCode),
        Forex: nextForex,
        "Type of Projects": textValue(rowDraft.typeOfProjects, row.typeOfProjects),
        "Start Date": textValue(rowDraft.startDate, row.startDate) || null,
        "End Date": textValue(rowDraft.endDate, row.endDate) || null,
        FY: numericValue(rowDraft.fy, row.fy),
        "Project Name": textValue(rowDraft.projectName, row.projectName),
        "Client Name": textValue(rowDraft.clientName, row.clientName),
        "OCN Number": textValue(rowDraft.ocnNumber, row.ocnNumber),
        "Practice Head": textValue(rowDraft.practiceHead, row.practiceHead),
        BDM: textValue(rowDraft.bdm, row.bdm),
        "Geo Head": textValue(rowDraft.geoHead, row.geoHead),
        Vertical: textValue(rowDraft.vertical, row.vertical),
        Horizontal: textValue(rowDraft.horizontal, row.horizontal),
        Q1: numericValue(rowDraft.q1, row.q1),
        Q2: numericValue(rowDraft.q2, row.q2),
        Q3: numericValue(rowDraft.q3, row.q3),
        Q4: numericValue(rowDraft.q4, row.q4),
      });

      const buildRowValuesPayload = (
        values: ReturnType<typeof buildWorkbookRowValues>,
      ): NonNullable<ForecastSubmissionRow["rowValues"]> => ({
        customerName: values["Customer Name"],
        msps: values["MS/PS"],
        entity: values.Entity,
        grEntity: values["GR Entity"],
        rowUs: values["ROW/US"],
        strategicAccount: values["Strategic Account"],
        resourceId: values["Emp ID"],
        resourceName: values["Resource Name"],
        dealType: values["Deal Type"],
        eeennn: values.EEENNN,
        billRate: values["Bill Rate"],
        rateType: values["Rate Type"],
        billedCurrency: values["Billed currency"],
        forex: values.Forex,
        typeOfProjects: values["Type of Projects"],
        startDate: values["Start Date"],
        endDate: values["End Date"],
        fy: values.FY,
        projectName: values["Project Name"],
        clientName: values["Client Name"],
        ocnNumber: values["OCN Number"],
        practiceHead: values["Practice Head"],
        bdm: values.BDM,
        geoHead: values["Geo Head"],
        vertical: values.Vertical,
        horizontal: values.Horizontal,
        q1: values.Q1,
        q2: values.Q2,
        q3: values.Q3,
        q4: values.Q4,
      });

      for (const row of localRows) {
        const meta = pendingMeta[row.recordId];
        if (!meta) {
          continue;
        }
        const rowCurrencyCode = resolveRowCurrencyCode(row, rowCurrency);
        const rowDraft = draftRowValues[row.recordId] ?? {};
        const nextForex = resolveEffectiveForexRate(row, rowDraft, rowCurrencyCode, usdPerUnit);
        const nextBillRateUsd = convertToUsd(
          rowDraft.billRate === undefined
            ? convertFromUsd(row.billRate, rowCurrencyCode, usdPerUnit, nextForex)
            : parseNumberish(rowDraft.billRate),
          rowCurrencyCode,
          usdPerUnit,
          nextForex,
        );
        const workbookValues = buildWorkbookRowValues(
          row,
          rowDraft,
          rowCurrencyCode,
          nextForex,
          nextBillRateUsd,
        );
        if (!hasRowData(row, rowDraft)) {
          skippedEmptyRowIds.push(row.recordId);
          continue;
        }

        const response = await fetch("/api/revenue/forecast-row", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            meta.mode === "renewal"
              ? { mode: "renewal", recordId: meta.sourceRecordId }
              : {
                  mode: "new_project",
                  financialYear: defaultFinancialYear,
                  values: workbookValues,
                },
          ),
        });
        const body = (await response.json().catch(() => null)) as { detail?: string; recordId?: number } | null;
        if (!response.ok || !body?.recordId) {
          throw new Error(body?.detail ?? "Unable to create project row.");
        }
        createdIdMap[row.recordId] = Number(body.recordId);
      }

      const mismatchSet = new Set<number>();
      let updatedRows = 0;
      for (const month of visibleMonths) {
        const payloadRows: ForecastSubmissionRow[] = [];
        for (const row of [...mergedRows, ...localRows.filter((item) => createdIdMap[item.recordId])]) {
          const submitRecordId = createdIdMap[row.recordId] ?? row.recordId;
          const rowCurrencyCode = resolveRowCurrencyCode(row, rowCurrency);
          const rowDraft = draftRowValues[row.recordId] ?? {};
          const effectiveForecastState = getEffectiveForecastState(row, month);
          if (effectiveForecastState.source === "actual") {
            continue;
          }
          const nextForex = resolveEffectiveForexRate(row, rowDraft, rowCurrencyCode, usdPerUnit);
          const currentBillRateLocal = convertFromUsd(
            row.billRate,
            rowCurrencyCode,
            usdPerUnit,
            nextForex,
          );
          const nextBillRate =
            rowDraft.billRate === undefined
              ? currentBillRateLocal
              : String(rowDraft.billRate ?? "").trim() === ""
                ? currentBillRateLocal
                : parseNumberish(rowDraft.billRate);
          const nextBillRateUsd = convertToUsd(nextBillRate, rowCurrencyCode, usdPerUnit, nextForex);
          const workbookValues = buildWorkbookRowValues(
            row,
            rowDraft,
            rowCurrencyCode,
            nextForex,
            nextBillRateUsd,
          );
          const rowValuesPayload = buildRowValuesPayload(workbookValues);
          const nextStartDate = String(rowValuesPayload.startDate ?? "");
          const nextEndDate = String(rowValuesPayload.endDate ?? "");
          const nextProjectName = String(rowValuesPayload.projectName ?? "");
          const nextClientName = String(rowValuesPayload.clientName ?? "");
          const rowMode =
            pendingMeta[row.recordId]?.mode ?? row.manualRowType ?? null;
          const isNewProjectEditMode = rowMode === "new_project";
          const renewalStartMonthForSave =
            rowMode === "renewal"
              ? forecastMonthFromDate(nextStartDate) ?? activeMonthLabel
              : null;
          if (!isNewProjectEditMode && !editableMonthSet.has(month)) {
            continue;
          }
          if (
            renewalStartMonthForSave !== null &&
            FORECAST_MONTH_INDEX[month] < FORECAST_MONTH_INDEX[renewalStartMonthForSave]
          ) {
            continue;
          }
          const isRenewalEditMode = rowMode === "renewal";
          const nextRateType =
            isRenewalEditMode
              ? row.rateType
              : String(rowValuesPayload.rateType ?? "");
          const nextBilledCurrency =
            isRenewalEditMode
              ? row.billedCurrency
              : String(rowValuesPayload.billedCurrency ?? "");
          const nextStoredForex = isRenewalEditMode ? Number(row.forex ?? nextForex) : nextForex;
          const nextTypeOfProjects =
            isRenewalEditMode
              ? row.typeOfProjects
              : String(rowValuesPayload.typeOfProjects ?? "");
          const forexChanged =
            !isRenewalEditMode &&
            (rowDraft.forex !== undefined || nextBilledCurrency !== row.billedCurrency) &&
            nextStoredForex !== Number(row.forex ?? 0);
          const changedRowFields = isRenewalEditMode
            ? nextBillRateUsd !== row.billRate ||
              (nextStartDate || "") !== (row.startDate || "") ||
              (nextEndDate || "") !== (row.endDate || "") ||
              submitRecordId !== row.recordId
            : nextBillRateUsd !== row.billRate ||
              (nextStartDate || "") !== (row.startDate || "") ||
              (nextEndDate || "") !== (row.endDate || "") ||
              String(rowValuesPayload.customerName ?? "") !== row.customerName ||
              String(rowValuesPayload.msps ?? "") !== row.msps ||
              String(rowValuesPayload.entity ?? "") !== row.entity ||
              String(rowValuesPayload.grEntity ?? "") !== row.grEntity ||
              String(rowValuesPayload.rowUs ?? "") !== row.rowUs ||
              String(rowValuesPayload.strategicAccount ?? "") !== row.strategicAccount ||
              String(rowValuesPayload.resourceId ?? "") !== row.resourceId ||
              String(rowValuesPayload.resourceName ?? "") !== row.resourceName ||
              String(rowValuesPayload.dealType ?? "") !== row.dealType ||
              String(rowValuesPayload.eeennn ?? "") !== row.eeennn ||
              nextProjectName !== row.projectName ||
              nextClientName !== row.clientName ||
              nextRateType !== row.rateType ||
              nextBilledCurrency !== row.billedCurrency ||
              forexChanged ||
              nextTypeOfProjects !== row.typeOfProjects ||
              String(rowValuesPayload.ocnNumber ?? "") !== row.ocnNumber ||
              String(rowValuesPayload.practiceHead ?? "") !== row.practiceHead ||
              String(rowValuesPayload.bdm ?? "") !== row.bdm ||
              String(rowValuesPayload.geoHead ?? "") !== row.geoHead ||
              String(rowValuesPayload.vertical ?? "") !== row.vertical ||
              String(rowValuesPayload.horizontal ?? "") !== row.horizontal ||
              Number(rowValuesPayload.fy ?? 0) !== row.fy ||
              Number(rowValuesPayload.q1 ?? 0) !== row.q1 ||
              Number(rowValuesPayload.q2 ?? 0) !== row.q2 ||
              Number(rowValuesPayload.q3 ?? 0) !== row.q3 ||
              Number(rowValuesPayload.q4 ?? 0) !== row.q4 ||
              submitRecordId !== row.recordId;

          if (segment === "PS") {
            const key = `${row.recordId}|${month}`;
            const draftSource = draftForecastSource[key];
            const baselineActualHours = Number(
              row.actualWorkingHrs[month] ??
                row.calendarActualWorkingDays[month] ??
                DEFAULT_WORKING_DAYS,
            );
            const nextActualHours =
              draftActualHrs[key] === undefined
                ? effectiveForecastState.actualHours
                : String(draftActualHrs[key] ?? "").trim() === ""
                  ? effectiveForecastState.actualHours
                  : parseNumberish(draftActualHrs[key]);
            const baselineForecast = resolveBaselineForecastUsd(
              row,
              month,
              rowCurrencyCode,
              usdPerUnit,
              nextForex,
            );
            const nextForecast =
              draftSource === "local" || draftSource === "usd"
                ? effectiveForecastState.usd
                : draftActualHrs[key] === undefined &&
                    rowDraft.billRate === undefined &&
                    rowDraft.rateType === undefined &&
                    rowDraft.billedCurrency === undefined &&
                    rowDraft.forex === undefined
                  ? effectiveForecastState.usd
                  : calculatePsForecastUsd(
                      row,
                      month,
                      normalizeRateType(nextRateType),
                      nextBillRateUsd,
                      nextActualHours,
                    );
            const requiresBudgetReset =
              draftSource === undefined &&
              draftActualHrs[key] === undefined &&
              rowDraft.billRate === undefined &&
              rowDraft.rateType === undefined &&
              rowDraft.billedCurrency === undefined &&
              rowDraft.forex === undefined &&
              Number(row.budgets[month] ?? 0) >= 0 &&
              (Number(row.forecasts[month] ?? 0) < 0 || Number(row.draftForecasts[month] ?? 0) < 0);
            const changedValues =
              nextActualHours !== baselineActualHours ||
              nextForecast !== baselineForecast ||
              requiresBudgetReset ||
              (mode === "submit" && row.forecastDraftSaved[month]);
            if (!changedValues && !changedRowFields) {
              continue;
            }
            payloadRows.push({
              recordId: submitRecordId,
              forecastValue: nextForecast,
              billedHours: calculatePsBilledHours(
                row,
                month,
                normalizeRateType(nextRateType),
                nextActualHours,
              ),
              billableActualHrs: nextActualHours,
              rowValues: changedRowFields
                ? isRenewalEditMode
                  ? {
                      billRate: nextBillRateUsd,
                      startDate: nextStartDate || null,
                      endDate: nextEndDate || null,
                    }
                  : rowValuesPayload
                : undefined,
            });
            continue;
          }

          const key = `${row.recordId}|${month}`;
          const draftSource = draftForecastSource[key];
          const baselineForecast = resolveBaselineForecastUsd(
            row,
            month,
            rowCurrencyCode,
            usdPerUnit,
            nextForex,
          );
          const nextForecast =
            draftSource === "local" && draftForecast[key] !== undefined
              ? String(draftForecast[key] ?? "").trim() === ""
                ? effectiveForecastState.usd
                : convertToUsd(
                    parseNumberish(draftForecast[key]),
                    rowCurrencyCode,
                    usdPerUnit,
                    nextForex,
                  )
              : draftSource === "usd" && draftForecastUsd[key] !== undefined
                ? String(draftForecastUsd[key] ?? "").trim() === ""
                  ? effectiveForecastState.usd
                  : parseNumberish(draftForecastUsd[key])
                : effectiveForecastState.usd;
          const requiresBudgetReset =
            draftSource === undefined &&
            Number(row.budgets[month] ?? 0) >= 0 &&
            (Number(row.forecasts[month] ?? 0) < 0 || Number(row.draftForecasts[month] ?? 0) < 0);
          const changedForecast =
            nextForecast !== baselineForecast ||
            requiresBudgetReset ||
            (mode === "submit" && row.forecastDraftSaved[month]);
          if (!changedForecast && !changedRowFields) {
            continue;
          }
          payloadRows.push({
            recordId: submitRecordId,
            forecastValue: nextForecast,
              rowValues: changedRowFields
                ? isRenewalEditMode
                  ? {
                      billRate: nextBillRateUsd,
                      startDate: nextStartDate || null,
                      endDate: nextEndDate || null,
                    }
                  : rowValuesPayload
              : undefined,
          });
        }

        if (payloadRows.length === 0) {
          continue;
        }

        const response = await fetch(mode === "draft" ? "/api/revenue/forecast-draft" : "/api/revenue/forecast-submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ forecastMonth: month, rows: payloadRows }),
        });
        const result = (await response.json()) as
          | (ForecastSubmitResponse & { detail?: string })
          | (ForecastDraftSaveResponse & { detail?: string });
        if (!response.ok) {
          throw new Error(
            result.detail ??
              (mode === "draft"
                ? "Unable to autosave forecast draft."
                : "Unable to save forecast."),
          );
        }
        if (mode === "submit") {
          const submitResult = result as ForecastSubmitResponse & { detail?: string };
          (submitResult.mismatchRecordIds ?? []).forEach((recordId) => mismatchSet.add(recordId));
        }
        updatedRows += payloadRows.length;
      }

      setMismatchRows(Array.from(mismatchSet));
      setStatus({
        tone: mismatchSet.size > 0 ? "error" : "success",
        message:
          mismatchSet.size > 0
            ? mode === "draft"
              ? "Draft autosaved with BDM forecast mismatches. Please review the highlighted rows."
              : "There are rows not matching with BDM forecast data, please get it resolved."
            : updatedRows > 0
              ? mode === "draft"
                ? `Draft autosaved for ${updatedRows} month-row update(s).`
                : `Submitted ${updatedRows} month-row update(s).`
              : mode === "draft"
                ? "Draft autosaved."
                : "No forecast changes to submit.",
      });

      if (Object.keys(createdIdMap).length > 0) {
        setLocalRows((current) =>
          current.filter((row) => !(row.recordId in createdIdMap) && !skippedEmptyRowIds.includes(row.recordId)),
        );
        setPendingMeta((current) => {
          const next = { ...current };
          Object.keys(createdIdMap).forEach((key) => delete next[Number(key)]);
          skippedEmptyRowIds.forEach((key) => delete next[key]);
          return next;
        });
      }
      await invalidateAll();
      setDraftForecast({});
      setDraftForecastUsd({});
      setDraftForecastSource({});
      setDraftActualHrs({});
      setDraftRowValues({});
      setSelectedRows({});
      autosaveCooldownRef.current = Date.now();
    } catch (error) {
      setStatus({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : mode === "draft"
              ? "Unable to autosave forecast draft."
              : "Unable to submit forecast.",
      });
    } finally {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      setSaving(false);
    }
  }, [
    canEditSheet,
    activeMonthLabel,
    draftActualHrs,
    draftForecast,
    draftForecastSource,
    draftForecastUsd,
    draftRowValues,
    editableMonthSet,
    getEffectiveForecastState,
    invalidateAll,
    localRows,
    mergedRows,
    pendingMeta,
    rowCurrency,
    segment,
    sheetData?.financialYear,
    usdPerUnit,
    visibleMonths,
  ]);

  useEffect(() => {
    if (!shouldAutosaveForecast || loading || saving || creatingRow) {
      return;
    }
    if (!hasUnsavedForecastChanges) {
      return;
    }
    if (Date.now() - autosaveCooldownRef.current < 1200) {
      return;
    }
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
    }
    autosaveTimerRef.current = window.setTimeout(() => {
      void persistForecast("draft");
    }, 1200);
    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [creatingRow, hasUnsavedForecastChanges, loading, persistForecast, saving, shouldAutosaveForecast]);

  async function createRenewalRow(recordId: number) {
    if (!canEditSheet) {
      setStatus({ tone: "error", message: "Forecast editing is locked for the current cycle." });
      return;
    }
    if (recordId < 0) {
      return;
    }
    createLocalRenewalRow(recordId);
    setStatus({ tone: "success", message: "Renewal draft row added. It will autosave shortly." });
  }

  async function createNewProjectRow() {
    if (!canEditSheet) {
      setStatus({ tone: "error", message: "Forecast editing is locked for the current cycle." });
      return;
    }
    createLocalProjectRow();
    setStatus({ tone: "success", message: "New project draft row added. It will autosave shortly." });
  }

  async function deleteManualRow(recordId: number) {
    if (!canEditSheet) {
      setStatus({ tone: "error", message: "Forecast editing is locked for the current cycle." });
      return;
    }
    setCreatingRow(true);
    setStatus(null);
    try {
      if (recordId < 0) {
        setLocalRows((current) => current.filter((row) => row.recordId !== recordId));
        setPendingMeta((current) => {
          const next = { ...current };
          delete next[recordId];
          return next;
        });
        setStatus({ tone: "success", message: "Draft row removed." });
        return;
      }
      const response = await fetch("/api/revenue/forecast-row", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordId }),
      });
      const body = (await response.json().catch(() => null)) as { detail?: string } | null;
      if (!response.ok) {
        throw new Error(body?.detail ?? "Unable to delete row.");
      }
      setStatus({ tone: "success", message: "Manual row deleted successfully." });
      await invalidateAll();
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to delete row.",
      });
    } finally {
      setCreatingRow(false);
    }
  }

  async function applyBulkAction() {
    if (!canEditSheet) {
      setStatus({ tone: "error", message: "Forecast editing is locked for the current cycle." });
      return;
    }
    const selectedIds = Object.entries(selectedRows)
      .filter(([, selected]) => selected)
      .map(([key]) => Number(key))
      .filter((value) => Number.isFinite(value));
    if (selectedIds.length === 0) {
      setStatus({ tone: "error", message: "Select one or more projects to apply bulk action." });
      return;
    }

    if (bulkAction === "renewal") {
      let created = 0;
      for (const id of selectedIds) {
        if (id > 0) {
          createLocalRenewalRow(id);
          created += 1;
        }
      }
      setStatus({
        tone: "success",
        message:
          created > 0
            ? `Added ${created} renewal draft row(s). They will autosave shortly.`
            : "No eligible rows selected for renewal.",
      });
      setSelectedRows({});
      return;
    }

    for (const id of selectedIds) {
      const row = allRows.find((item) => item.recordId === id);
      if (!row?.isManualRow) {
        continue;
      }
      await deleteManualRow(id);
    }
    setSelectedRows({});
  }

  async function exportToExcel() {
    setExporting(true);
    setStatus(null);
    try {
      const xlsx = await import("xlsx");
      const sanitizeExportCell = (value: unknown) => {
        if (typeof value !== "string") {
          return value;
        }
        const trimmed = value.trim();
        if (
          trimmed.startsWith("=") ||
          trimmed.startsWith("+") ||
          trimmed.startsWith("@") ||
          trimmed.startsWith("\t") ||
          trimmed.startsWith("\r") ||
          (trimmed.startsWith("-") && trimmed.length > 1 && !/\d/.test(trimmed[1] ?? ""))
        ) {
          return `'${value}`;
        }
        return value;
      };
      const sanitizeExportRow = (row: Record<string, unknown>) =>
        Object.fromEntries(
          Object.entries(row).map(([key, value]) => [key, sanitizeExportCell(value)]),
        );
      const exportRows = Array.from(
        mergedRows
          .filter(
            (row) =>
              !row.isManualRow &&
              !row.isReassignedRow &&
              Number(row.sourceRowNumber ?? 0) > 0,
          )
          .reduce((deduped, row) => {
            const sourceRowNumber = Number(row.sourceRowNumber ?? 0);
            if (!deduped.has(sourceRowNumber)) {
              deduped.set(sourceRowNumber, row);
            }
            return deduped;
          }, new Map<number, MergedForecastRow>())
          .values(),
      );
      const payload = exportRows.map((row) => {
        const rowDraft = draftRowValues[row.recordId] ?? {};
        const currencyCode = resolveRowCurrencyCode(row, rowCurrency);
        const forexRate = resolveEffectiveForexRate(row, rowDraft, currencyCode, usdPerUnit);
        const billRateLocal =
          rowDraft.billRate === undefined
            ? convertFromUsd(row.billRate, currencyCode, usdPerUnit, forexRate)
            : parseNumberish(rowDraft.billRate);
        const startDate = rowDraft.startDate === undefined ? row.startDate : rowDraft.startDate;
        const endDate = rowDraft.endDate === undefined ? row.endDate : rowDraft.endDate;
        const projectName =
          rowDraft.projectName === undefined ? row.projectName : rowDraft.projectName;
        const clientName =
          rowDraft.clientName === undefined ? row.clientName : rowDraft.clientName;
        const rateType = rowDraft.rateType === undefined ? row.rateType : rowDraft.rateType;
        const billedCurrency =
          rowDraft.billedCurrency === undefined ? row.billedCurrency : rowDraft.billedCurrency;
        const typeOfProjects =
          rowDraft.typeOfProjects === undefined ? row.typeOfProjects : rowDraft.typeOfProjects;

        const monthColumns = visibleMonths.reduce<Record<string, number>>((accumulator, month) => {
          const forecastState = getEffectiveForecastState(row, month);
          if (!hideBudgetColumns) {
            accumulator[`${month} Budget ($)`] = getBudgetUsdValue(row, month);
          }
          if (showFunctionalColumn) {
            accumulator[`${month} Forecast Functional (${getCurrencyMarker(forecastState.currencyCode)})`] =
              forecastState.local;
          }
          accumulator[`${month} Forecast USD`] = forecastState.usd;
          if (segment === "PS") {
            accumulator[`${month} Working Days`] = normalizeWorkingDayValue(row.workingDays[month], DEFAULT_WORKING_DAYS);
            accumulator[`${month} Actual Working Days`] = forecastState.actualHours;
          }
          return accumulator;
        }, {});

        return sanitizeExportRow({
          "Customer Name": row.customerName,
          "MS/PS": row.msps,
          Entity: row.entity,
          "GR Entity": row.grEntity,
          "ROW/US": row.rowUs,
          "Strategic Account": row.strategicAccount,
          "Emp ID": row.resourceId,
          "Resource Name": row.resourceName,
          "Deal Type": row.dealType,
          EEENNN: row.eeennn,
          "Bill Rate": billRateLocal,
          "Rate Type": rateType,
          "Billed currency": billedCurrency,
          Forex: forexRate,
          "Type of Projects": typeOfProjects,
          "Start Date": startDate,
          "End Date": endDate,
          FY: row.fy,
          "Project Name": projectName,
          "Client Name": clientName,
          "OCN Number": row.ocnNumber,
          "Practice Head": row.practiceHead,
          BDM: row.bdm,
          "Geo Head": row.geoHead,
          Vertical: row.vertical,
          Horizontal: row.horizontal,
          Q1: row.q1,
          Q2: row.q2,
          Q3: row.q3,
          Q4: row.q4,
          ...monthColumns,
        });
      });

      const sheet = xlsx.utils.json_to_sheet(payload);
      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, sheet, "Forecast");
      const metadataSheet = xlsx.utils.aoa_to_sheet([
        ["generated_by", sanitizeExportCell(sheetData?.summary.userName ?? "current-user")],
        ["generated_at", new Date().toISOString()],
        ["module", "forecast"],
        ["segment", segment ?? "all"],
        ["row_count", payload.length],
      ]);
      xlsx.utils.book_append_sheet(workbook, metadataSheet, "Export Metadata");
      const auditResponse = await fetch("/api/revenue/forecast-export-audit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          segment: segment ?? "all",
          rows: payload.length,
        }),
      });
      if (!auditResponse.ok) {
        throw new Error("Unable to authorize forecast export.");
      }
      xlsx.writeFile(workbook, `forecast_${segment ?? "all"}.xlsx`);
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to export forecast.",
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card className="rounded-[24px] border border-slate-200 bg-white shadow-sm shadow-slate-950/5">
        <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">Forecast</p>
            <CardTitle className="mt-2 text-2xl text-slate-950">{title}</CardTitle>
            <p className="mt-2 text-sm leading-6 text-slate-600">{subtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {showBdmFilter && hasActiveUpload ? (
              <select
                value={selectedBdm}
                onChange={(event) => setSelectedBdm(event.target.value)}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
              >
                {bdmOptions.map((option) => (
                  <option key={option} value={option}>
                    {option === "ALL" ? "All BDMs" : option}
                  </option>
                ))}
              </select>
            ) : null}
            {showPracticeHeadFilter && hasActiveUpload ? (
              <select
                value={selectedPracticeHead}
                onChange={(event) => setSelectedPracticeHead(event.target.value)}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
              >
                {practiceHeadOptions.map((option) => (
                  <option key={option} value={option}>
                    {option === "ALL" ? "All Practice Heads" : option}
                  </option>
                ))}
              </select>
            ) : null}
            {showMspsFilter && hasActiveUpload ? (
              <select
                value={selectedMsps}
                onChange={(event) => setSelectedMsps(event.target.value as "ALL" | "MS" | "PS")}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
              >
                <option value="ALL">All MS/PS</option>
                <option value="MS">MS</option>
                <option value="PS">PS</option>
              </select>
            ) : null}
            {hasActiveUpload ? (
              <>
                <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">
                  {hideBudgetColumns
                    ? `Forecast USD ${formatUsdAmountWithSpace(totalForecast)}`
                    : `Budget ($) ${formatAmount(totalBudget)} | Forecast USD ${formatUsdAmountWithSpace(totalForecast)}`}
                </div>
                <input
                  value={tableSearch}
                  onChange={(event) => setTableSearch(event.target.value)}
                  placeholder="Search customer, project, BDM..."
                  className="h-8 w-44 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none"
                />
                <Button type="button" variant="secondary" onClick={exportToExcel} disabled={loading || exporting}>
                  {exporting ? (
                    <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
                  Export
                </Button>
              </>
            ) : null}
            {canEditSheet && hasActiveUpload ? (
              <>
                {!isBdmOrPracticeForecast ? (
                  <>
                    <select
                      value={bulkAction}
                      onChange={(event) => setBulkAction(event.target.value as "renewal" | "delete")}
                      className="h-8 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none"
                    >
                      <option value="renewal">Renew selected</option>
                      <option value="delete">Delete selected manual</option>
                    </select>
                    <Button type="button" variant="secondary" onClick={() => void applyBulkAction()} disabled={creatingRow}>
                      Apply
                    </Button>
                  </>
                ) : null}
                {canEditSheet ? (
                  <Button type="button" variant="secondary" onClick={createNewProjectRow} disabled={creatingRow}>
                    <Plus className="mr-2 h-4 w-4" />
                    New project
                  </Button>
                ) : null}
              </>
            ) : null}
          </div>
        </CardHeader>
      </Card>

      {status ? (
        <div
          className={`rounded-[20px] border px-4 py-3 text-sm ${
            status.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {status.message}
        </div>
      ) : null}
      {isBdmOrPracticeForecast && selectedCustomerFilterLabel ? (
        <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
          Selected customer:{" "}
          <span className="inline-flex items-center rounded-full bg-slate-950 px-2.5 py-0.5 text-xs font-semibold text-white">
            {selectedCustomerFilterLabel}
          </span>
        </div>
      ) : null}
      {!readOnly && forecastControl ? (
        <div className="rounded-[20px] border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          {forecastControl.submissionWindowOpen
            ? `Editing is open from ${activeMonthLabel} onward until ${forecastControl.lockoutDate ?? `day ${forecastControl.lockoutDay}`}. Earlier months stay visible, but they are locked.`
            : `Editing is currently closed. All months remain visible and stored. Updates reopen between ${forecastControl.lockinDate ?? `day ${forecastControl.lockinDay}`} and ${forecastControl.lockoutDate ?? `day ${forecastControl.lockoutDay}`} from ${activeMonthLabel} onward.`}
        </div>
      ) : null}
      <Card className="rounded-[24px] border border-slate-200 bg-white shadow-sm shadow-slate-950/5">
        <CardContent className="pt-6">
          {loading ? (
            <div className="flex min-h-56 items-center justify-center text-slate-500">
              <LoaderCircle className="mr-3 h-5 w-5 animate-spin" />
              Loading forecast rows...
            </div>
          ) : error ? (
            <div className="rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
              Forecast rows could not be loaded.
            </div>
          ) : uploadRequired ? (
            <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center text-sm leading-7 text-slate-600">
              0 rows available.
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center text-sm leading-7 text-slate-500">
              No rows available in this scope.
            </div>
          ) : (
            <TableFullscreenShell
              title={title}
              description="Open the forecast sheet in a full-page table view."
              className="rounded-[20px] border border-slate-200 bg-white/95 shadow-[0_16px_34px_rgba(15,23,42,0.06)]"
            >
              <table
                className={`${visibleMonths.length === 1 ? "min-w-[1900px]" : "min-w-[4200px]"} border-collapse text-sm text-slate-700 [&_th]:align-middle [&_td]:align-middle [&_th]:whitespace-nowrap [&_td]:whitespace-nowrap`}
              >
                <thead className="sticky top-0 z-50 bg-slate-950 text-white">
                  <tr>
                    {canEditSheet ? (
                      <th
                        rowSpan={2}
                        className="sticky left-0 z-[70] border-b border-white/10 bg-slate-950 px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em]"
                      >
                        <input
                          type="checkbox"
                          checked={filteredRows.length > 0 && filteredRows.every((row) => Boolean(selectedRows[row.recordId]))}
                          onChange={(event) =>
                            setSelectedRows(
                              event.target.checked
                                ? Object.fromEntries(filteredRows.map((row) => [row.recordId, true]))
                                : {},
                            )
                          }
                        />
                      </th>
                    ) : null}
                    {baseHeaders.map((header) => (
                      <th
                        key={`base-${header}`}
                        style={header === "Customer Name" ? { left: canEditSheet ? 52 : 0 } : undefined}
                        className={`border-b border-white/10 px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] ${
                          header === "Customer Name" ? "sticky z-[65] bg-slate-950" : ""
                        }`}
                      >
                        {header === "Customer Name" ? "Customer / Project" : header}
                      </th>
                    ))}
                    {visibleMonths.map((month) => (
                      <th
                        key={month}
                        colSpan={monthColumnCount}
                        className="border-b border-white/10 px-3 py-3 text-center text-xs font-semibold uppercase tracking-[0.16em]"
                      >
                        {month}
                      </th>
                    ))}
                    {segment === "PS"
                      ? visibleMonths.map((month) => (
                          <Fragment key={`driver-end-${month}`}>
                            <th
                              rowSpan={2}
                              className="border-b border-white/10 px-3 py-3 text-right text-xs font-semibold uppercase tracking-[0.16em]"
                            >
                              {month} Working Days
                            </th>
                            <th
                              rowSpan={2}
                              className="border-b border-white/10 px-3 py-3 text-right text-xs font-semibold uppercase tracking-[0.16em]"
                            >
                              {month} Actual WD
                            </th>
                          </Fragment>
                        ))
                      : null}
                    {canEditSheet ? (
                      <th
                        rowSpan={2}
                        className="border-b border-white/10 px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em]"
                      >
                        Action
                      </th>
                    ) : null}
                  </tr>
                  <tr>
                    {baseHeaders.map((header) => {
                      return (
                        <th
                          key={`filter-${header}`}
                          style={header === "Customer Name" ? { left: canEditSheet ? 52 : 0 } : undefined}
                          className={`border-b border-white/10 bg-slate-900 px-2 py-2 ${
                            header === "Customer Name" ? "sticky z-[65]" : ""
                          }`}
                        >
                          <select
                            value={columnFilters[header] ?? ""}
                            onChange={(event) =>
                              setColumnFilters((current) => ({
                                ...current,
                                [header]: event.target.value,
                              }))
                            }
                            className="h-7 w-full rounded-md border border-slate-700 bg-slate-800 px-1.5 text-[11px] font-semibold text-white outline-none"
                          >
                            {(columnFilterOptions[header] ?? ["ALL"]).map((value) => (
                              <option
                                key={`table-filter-${header}-${value}`}
                                value={value === "ALL" ? "" : value}
                              >
                                {value}
                              </option>
                            ))}
                          </select>
                        </th>
                      );
                    })}
                    {visibleMonths.map((month) => (
                      <Fragment key={`sub-${month}`}>
                        {!hideBudgetColumns ? (
                          <th className="border-b border-white/10 px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.14em]">
                            Budget ($)
                          </th>
                        ) : null}
                        {showFunctionalColumn ? (
                          <th
                            className={`border-b border-white/10 px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.14em] ${
                              hideBudgetColumns ? "bg-emerald-900/25 text-emerald-100" : ""
                            }`}
                          >
                            Forecast Functional
                          </th>
                        ) : null}
                        <th
                          className={`border-b border-white/10 px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.14em] ${
                            hideBudgetColumns ? "bg-emerald-900/35 text-emerald-100" : ""
                          }`}
                        >
                          Forecast USD ($)
                        </th>
                      </Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr
                    className={`${shouldStickTotalRow ? "sticky z-40 top-[84px]" : ""} border-b border-slate-200 bg-slate-100/95 font-semibold`}
                  >
                    <td
                      style={shouldStickTotalRow ? { left: 0 } : undefined}
                      className={`${shouldStickTotalRow ? "sticky z-[55] bg-slate-100/95 shadow-[8px_0_12px_rgba(15,23,42,0.06)]" : ""} px-3 py-2.5 text-right text-slate-900`}
                      colSpan={fixedColumnsCount}
                    >
                      Total
                    </td>
                    {visibleMonths.map((month) => (
                      <Fragment key={`total-${month}`}>
                        {!hideBudgetColumns ? (
                          <td className="px-3 py-2.5 text-right text-slate-900">
                            {formatAmount(monthTotals.budget[month] ?? 0)}
                          </td>
                        ) : null}
                        {showFunctionalColumn ? (
                          <td className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                            NA
                          </td>
                        ) : null}
                        <td className="px-3 py-2.5 text-right text-slate-900">
                          {formatUsdAmountWithSpace(monthTotals.forecast[month] ?? 0)}
                        </td>
                      </Fragment>
                    ))}
                    {segment === "PS"
                      ? visibleMonths.map((month) => (
                          <Fragment key={`total-drivers-${month}`}>
                            <td className="px-3 py-2.5 text-right text-slate-900">
                              {formatNumber(monthTotals.workingDays[month] ?? 0)}
                            </td>
                            <td className="px-3 py-2.5 text-right text-slate-900">
                              {formatNumber(monthTotals.actualHrs[month] ?? 0)}
                            </td>
                          </Fragment>
                        ))
                      : null}
                    {canEditSheet ? <td className="px-3 py-2.5" /> : null}
                  </tr>
                  {filteredRows.map((row, rowIndex) => {
                    const rowDraft = draftRowValues[row.recordId] ?? {};
                    const rowManualMode =
                      pendingMeta[row.recordId]?.mode ?? row.manualRowType ?? "";
                    const isNewProjectRow = rowManualMode === "new_project";
                    const rowCanEdit = canEditSheet || (!readOnly && isNewProjectRow);
                    const renewalLimitedEdit = rowCanEdit && rowManualMode === "renewal";
                    const allowExtendedRowEdit = rowCanEdit && !renewalLimitedEdit;
                    const allowNewProjectFullEdit = rowCanEdit && isNewProjectRow;
                    const selectedCurrency = resolveRowCurrencyCode(row, rowCurrency);
                    const rowForex = resolveEffectiveForexRate(
                      row,
                      rowDraft,
                      selectedCurrency,
                      usdPerUnit,
                    );
                    const billRateText =
                      rowDraft.billRate === undefined
                        ? String(convertFromUsd(row.billRate, selectedCurrency, usdPerUnit, rowForex))
                        : rowDraft.billRate;
                    const forexText =
                      rowDraft.forex === undefined
                        ? String(rowForex)
                        : rowDraft.forex;
                    const startDateText =
                      rowDraft.startDate === undefined ? String(row.startDate || "") : rowDraft.startDate;
                    const endDateText =
                      rowDraft.endDate === undefined ? String(row.endDate || "") : rowDraft.endDate;
                    const projectNameText =
                      rowDraft.projectName === undefined ? row.projectName : rowDraft.projectName;
                    const clientNameText =
                      rowDraft.clientName === undefined ? row.clientName : rowDraft.clientName;
                    const customerNameText =
                      rowDraft.customerName === undefined ? row.customerName : rowDraft.customerName;
                    const mspsText = rowDraft.msps === undefined ? row.msps : rowDraft.msps;
                    const entityText = rowDraft.entity === undefined ? row.entity : rowDraft.entity;
                    const grEntityText = rowDraft.grEntity === undefined ? row.grEntity : rowDraft.grEntity;
                    const rowUsText = rowDraft.rowUs === undefined ? row.rowUs : rowDraft.rowUs;
                    const strategicAccountText =
                      rowDraft.strategicAccount === undefined ? row.strategicAccount : rowDraft.strategicAccount;
                    const resourceIdText =
                      rowDraft.resourceId === undefined ? row.resourceId : rowDraft.resourceId;
                    const resourceNameText =
                      rowDraft.resourceName === undefined ? row.resourceName : rowDraft.resourceName;
                    const dealTypeText = rowDraft.dealType === undefined ? row.dealType : rowDraft.dealType;
                    const eeennnText = rowDraft.eeennn === undefined ? row.eeennn : rowDraft.eeennn;
                    const rateTypeText = normalizeRateType(
                      rowDraft.rateType === undefined ? row.rateType : rowDraft.rateType,
                    );
                    const fyText = rowDraft.fy === undefined ? String(row.fy || 0) : rowDraft.fy;
                    const ocnNumberText =
                      rowDraft.ocnNumber === undefined ? row.ocnNumber : rowDraft.ocnNumber;
                    const practiceHeadText =
                      rowDraft.practiceHead === undefined ? row.practiceHead : rowDraft.practiceHead;
                    const bdmText = rowDraft.bdm === undefined ? row.bdm : rowDraft.bdm;
                    const geoHeadText = rowDraft.geoHead === undefined ? row.geoHead : rowDraft.geoHead;
                    const verticalText = rowDraft.vertical === undefined ? row.vertical : rowDraft.vertical;
                    const horizontalText =
                      rowDraft.horizontal === undefined ? row.horizontal : rowDraft.horizontal;
                    const q1Text = rowDraft.q1 === undefined ? String(row.q1 || 0) : rowDraft.q1;
                    const q2Text = rowDraft.q2 === undefined ? String(row.q2 || 0) : rowDraft.q2;
                    const q3Text = rowDraft.q3 === undefined ? String(row.q3 || 0) : rowDraft.q3;
                    const q4Text = rowDraft.q4 === undefined ? String(row.q4 || 0) : rowDraft.q4;
                    const renewalStartMonth =
                      rowManualMode === "renewal"
                        ? forecastMonthFromDate(startDateText) ?? activeMonthLabel
                        : null;

                    const stickyIndex = stickyTopRows > 0 && rowIndex < stickyTopRows ? rowIndex : -1;
                    const stickyBaseTop = shouldStickTotalRow ? 132 : 96;
                    const stickyStyle =
                      stickyIndex >= 0
                        ? { top: `${stickyBaseTop + stickyIndex * 44}px` }
                        : undefined;
                    const rowToneClass = rowIndex % 2 === 0 ? "bg-white" : "bg-slate-50";
                    const rowBackgroundClass = mismatchRows.includes(row.recordId)
                      ? "bg-rose-50"
                      : highlightedRows[row.recordId] === "renewal"
                      ? "bg-amber-50"
                      : highlightedRows[row.recordId] === "new"
                      ? "bg-emerald-50"
                      : rowManualMode === "renewal"
                        ? "bg-amber-50"
                        : rowManualMode === "new_project"
                          ? "bg-emerald-50"
                        : row.isManualRow
                          ? "bg-fuchsia-50"
                        : row.isReassignedRow
                          ? "bg-sky-50"
                        : tableSearch.trim()
                          ? "bg-yellow-50"
                        : rowToneClass;

                    return (
                      <tr
                        key={row.recordId}
                        style={stickyStyle}
                        className={`border-b border-slate-100 ${
                          stickyIndex >= 0 ? "sticky z-30" : ""
                        } ${rowBackgroundClass}`}
                      >
                        {canEditSheet ? (
                          <td className={`sticky left-0 z-10 w-[52px] min-w-[52px] px-3 py-2.5 ${rowBackgroundClass}`}>
                            <input
                              type="checkbox"
                              checked={Boolean(selectedRows[row.recordId])}
                              onChange={(event) =>
                                setSelectedRows((current) => ({
                                  ...current,
                                  [row.recordId]: event.target.checked,
                                }))
                              }
                            />
                          </td>
                        ) : null}
                        <td
                          style={{ left: canEditSheet ? 52 : 0 }}
                          className={`sticky z-10 min-w-[220px] max-w-[220px] border-r border-slate-100 px-3 py-2.5 ${rowBackgroundClass}`}
                        >
                          {allowNewProjectFullEdit ? (
                            <div className="space-y-1.5">
                              <input
                                value={customerNameText}
                                onChange={(event) =>
                                  updateRowDraft(row.recordId, { customerName: event.target.value })
                                }
                                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-sm font-semibold text-slate-900 outline-none"
                              />
                              <input
                                value={projectNameText}
                                onChange={(event) =>
                                  updateRowDraft(row.recordId, { projectName: event.target.value })
                                }
                                className="w-full rounded-xl border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 outline-none"
                              />
                            </div>
                          ) : (
                            <>
                              <div className="truncate font-semibold text-slate-900">{row.customerName}</div>
                              <div className="mt-1 truncate text-xs font-medium text-slate-600">
                                {projectNameText || row.projectName || "Project name pending"}
                              </div>
                            </>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {allowNewProjectFullEdit ? (
                            <select
                              value={mspsText}
                              onChange={(event) => updateRowDraft(row.recordId, { msps: event.target.value })}
                              className="h-8 w-20 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none"
                            >
                              <option value="MS">MS</option>
                              <option value="PS">PS</option>
                            </select>
                          ) : (
                            row.msps
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {allowNewProjectFullEdit ? (
                            <input
                              value={entityText}
                              onChange={(event) => updateRowDraft(row.recordId, { entity: event.target.value })}
                              className="w-24 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-sm font-semibold text-slate-800 outline-none"
                            />
                          ) : (
                            row.entity
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {allowNewProjectFullEdit ? (
                            <input
                              value={grEntityText}
                              onChange={(event) => updateRowDraft(row.recordId, { grEntity: event.target.value })}
                              className="w-24 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-sm font-semibold text-slate-800 outline-none"
                            />
                          ) : (
                            row.grEntity
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {allowNewProjectFullEdit ? (
                            <input
                              value={rowUsText}
                              onChange={(event) => updateRowDraft(row.recordId, { rowUs: event.target.value })}
                              className="w-24 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-sm font-semibold text-slate-800 outline-none"
                            />
                          ) : (
                            row.rowUs
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {allowNewProjectFullEdit ? (
                            <input
                              value={strategicAccountText}
                              onChange={(event) =>
                                updateRowDraft(row.recordId, { strategicAccount: event.target.value })
                              }
                              className="w-32 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-sm font-semibold text-slate-800 outline-none"
                            />
                          ) : (
                            row.strategicAccount
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {allowNewProjectFullEdit ? (
                            <input
                              value={resourceIdText}
                              onChange={(event) => updateRowDraft(row.recordId, { resourceId: event.target.value })}
                              className="w-28 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-sm font-semibold text-slate-800 outline-none"
                            />
                          ) : (
                            row.resourceId
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {allowNewProjectFullEdit ? (
                            <input
                              value={resourceNameText}
                              onChange={(event) => updateRowDraft(row.recordId, { resourceName: event.target.value })}
                              className="w-36 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-sm font-semibold text-slate-800 outline-none"
                            />
                          ) : (
                            row.resourceName
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {allowNewProjectFullEdit ? (
                            <input
                              value={dealTypeText}
                              onChange={(event) => updateRowDraft(row.recordId, { dealType: event.target.value })}
                              className="w-24 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-sm font-semibold text-slate-800 outline-none"
                            />
                          ) : (
                            row.dealType
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {allowNewProjectFullEdit ? (
                            <select
                              value={eeennnText}
                              onChange={(event) => updateRowDraft(row.recordId, { eeennn: event.target.value })}
                              className="h-8 w-20 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none"
                            >
                              <option value="EE">EE</option>
                              <option value="EN">EN</option>
                              <option value="NN">NN</option>
                            </select>
                          ) : (
                            row.eeennn
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {!rowCanEdit ? (
                            <div className="text-right">
                              {formatNumber(convertFromUsd(row.billRate, selectedCurrency, usdPerUnit, rowForex))}
                            </div>
                          ) : (
                            <input
                              value={billRateText}
                              onChange={(event) => updateRowDraft(row.recordId, { billRate: event.target.value })}
                              className="w-24 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-right text-sm font-semibold text-slate-800 outline-none"
                            />
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {!allowExtendedRowEdit ? (
                            <div className="text-right font-semibold text-slate-800">
                              {row.rateType || "N/A"}
                            </div>
                          ) : (
                            <select
                              value={rateTypeText}
                              onChange={(event) =>
                                updateRowDraft(row.recordId, { rateType: event.target.value })
                              }
                              className="h-8 w-28 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none"
                            >
                              <option value="">Select</option>
                              {RATE_TYPE_OPTIONS.map((rateType) => (
                                <option key={`rate-type-${row.recordId}-${rateType}`} value={rateType}>
                                  {rateType}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {!allowExtendedRowEdit ? (
                            <div className="text-right font-semibold text-slate-800">
                              {selectedCurrency}
                            </div>
                          ) : (
                            <select
                              value={selectedCurrency}
                              onChange={(event) => {
                                const nextCurrency = event.target.value;
                                setRowCurrency((current) => ({
                                  ...current,
                                  [row.recordId]: nextCurrency,
                                }));
                                updateRowDraft(row.recordId, {
                                  billedCurrency: nextCurrency,
                                  forex: String(getDefaultForexRate(nextCurrency, usdPerUnit)),
                                });
                              }}
                              className="h-8 w-24 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none"
                            >
                              {FORECAST_CURRENCY_OPTIONS.map((currency) => (
                                <option key={`row-currency-${row.recordId}-${currency}`} value={currency}>
                                  {currency}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {!allowExtendedRowEdit ? (
                            <div className="text-right font-semibold text-slate-800">
                              {formatNumber(rowForex)}
                            </div>
                          ) : (
                            <input
                              value={forexText}
                              onChange={(event) =>
                                updateRowDraft(row.recordId, { forex: event.target.value })
                              }
                              className="w-24 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-right text-sm font-semibold text-slate-800 outline-none"
                            />
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {!allowExtendedRowEdit ? (
                            <div className="text-right font-semibold text-slate-800">
                              {row.typeOfProjects || "N/A"}
                            </div>
                          ) : (
                            <input
                              value={rowDraft.typeOfProjects === undefined ? row.typeOfProjects : rowDraft.typeOfProjects}
                              onChange={(event) =>
                                updateRowDraft(row.recordId, { typeOfProjects: event.target.value })
                              }
                              className="w-36 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-sm font-semibold text-slate-800 outline-none"
                            />
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {!rowCanEdit ? (
                            formatDateMmDdYy(row.startDate)
                          ) : (
                            <input
                              type="date"
                              value={startDateText}
                              onChange={(event) => updateRowDraft(row.recordId, { startDate: event.target.value })}
                              className="w-36 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-sm font-semibold text-slate-800 outline-none"
                            />
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {!rowCanEdit ? (
                            formatDateMmDdYy(row.endDate)
                          ) : (
                            <input
                              type="date"
                              value={endDateText}
                              onChange={(event) => updateRowDraft(row.recordId, { endDate: event.target.value })}
                              className="w-36 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-sm font-semibold text-slate-800 outline-none"
                            />
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {allowNewProjectFullEdit ? (
                            <input
                              value={fyText}
                              onChange={(event) => updateRowDraft(row.recordId, { fy: event.target.value })}
                              className="w-24 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-right text-sm font-semibold text-slate-800 outline-none"
                            />
                          ) : (
                            formatAmount(row.fy)
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {!allowExtendedRowEdit ? (
                            row.projectName
                          ) : (
                            <input
                              value={projectNameText}
                              onChange={(event) => updateRowDraft(row.recordId, { projectName: event.target.value })}
                              className="w-32 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-sm font-semibold text-slate-800 outline-none"
                            />
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {!allowExtendedRowEdit ? (
                            row.clientName
                          ) : (
                            <input
                              value={clientNameText}
                              onChange={(event) => updateRowDraft(row.recordId, { clientName: event.target.value })}
                              className="w-32 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-sm font-semibold text-slate-800 outline-none"
                            />
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {allowNewProjectFullEdit ? (
                            <input
                              value={ocnNumberText}
                              onChange={(event) => updateRowDraft(row.recordId, { ocnNumber: event.target.value })}
                              className="w-32 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-sm font-semibold text-slate-800 outline-none"
                            />
                          ) : (
                            row.ocnNumber
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {allowNewProjectFullEdit ? (
                            <input
                              value={practiceHeadText}
                              onChange={(event) => updateRowDraft(row.recordId, { practiceHead: event.target.value })}
                              className="w-36 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-sm font-semibold text-slate-800 outline-none"
                            />
                          ) : (
                            row.practiceHead
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {allowNewProjectFullEdit ? (
                            <input
                              value={bdmText}
                              onChange={(event) => updateRowDraft(row.recordId, { bdm: event.target.value })}
                              className="w-32 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-sm font-semibold text-slate-800 outline-none"
                            />
                          ) : (
                            row.bdm
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {allowNewProjectFullEdit ? (
                            <input
                              value={geoHeadText}
                              onChange={(event) => updateRowDraft(row.recordId, { geoHead: event.target.value })}
                              className="w-32 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-sm font-semibold text-slate-800 outline-none"
                            />
                          ) : (
                            row.geoHead
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {allowNewProjectFullEdit ? (
                            <input
                              value={verticalText}
                              onChange={(event) => updateRowDraft(row.recordId, { vertical: event.target.value })}
                              className="w-32 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-sm font-semibold text-slate-800 outline-none"
                            />
                          ) : (
                            row.vertical
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {allowNewProjectFullEdit ? (
                            <input
                              value={horizontalText}
                              onChange={(event) => updateRowDraft(row.recordId, { horizontal: event.target.value })}
                              className="w-32 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-sm font-semibold text-slate-800 outline-none"
                            />
                          ) : (
                            row.horizontal
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {allowNewProjectFullEdit ? (
                            <input
                              value={q1Text}
                              onChange={(event) => updateRowDraft(row.recordId, { q1: event.target.value })}
                              className="w-24 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-right text-sm font-semibold text-slate-800 outline-none"
                            />
                          ) : (
                            formatAmount(row.q1)
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {allowNewProjectFullEdit ? (
                            <input
                              value={q2Text}
                              onChange={(event) => updateRowDraft(row.recordId, { q2: event.target.value })}
                              className="w-24 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-right text-sm font-semibold text-slate-800 outline-none"
                            />
                          ) : (
                            formatAmount(row.q2)
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {allowNewProjectFullEdit ? (
                            <input
                              value={q3Text}
                              onChange={(event) => updateRowDraft(row.recordId, { q3: event.target.value })}
                              className="w-24 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-right text-sm font-semibold text-slate-800 outline-none"
                            />
                          ) : (
                            formatAmount(row.q3)
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {allowNewProjectFullEdit ? (
                            <input
                              value={q4Text}
                              onChange={(event) => updateRowDraft(row.recordId, { q4: event.target.value })}
                              className="w-24 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-right text-sm font-semibold text-slate-800 outline-none"
                            />
                          ) : (
                            formatAmount(row.q4)
                          )}
                        </td>

                        {visibleMonths.map((month) => {
                          const key = `${row.recordId}|${month}`;
                          const monthLockedByRenewal =
                            renewalStartMonth !== null &&
                            FORECAST_MONTH_INDEX[month] < FORECAST_MONTH_INDEX[renewalStartMonth];
                          const forecastState = getEffectiveForecastState(row, month);
                          const actualMonthLocked = forecastState.source === "actual";
                          const monthEditable = isNewProjectRow
                            ? !readOnly && !actualMonthLocked
                            : canEditSheet && editableMonthSet.has(month) && !monthLockedByRenewal && !actualMonthLocked;
                          const budgetUsd = getBudgetUsdValue(row, month);
                          const currencyMarker = getCurrencyMarker(forecastState.currencyCode);
                          const forecastLocalValue = getDraftForecastInputValue(row, month, "local");
                          const forecastUsdValue = getDraftForecastInputValue(row, month, "usd");
                          const lockedCellClass = monthLockedByRenewal
                            ? "border-slate-200 bg-slate-100 text-slate-400"
                            : actualMonthLocked
                              ? "border-blue-200 bg-blue-50 text-blue-900"
                            : hideBudgetColumns
                              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                              : "border-slate-200 bg-slate-50 text-slate-800";

                          return (
                            <Fragment key={`cell-${key}`}>
                              {!hideBudgetColumns ? (
                                <td
                                  className={`px-3 py-2.5 text-right font-semibold ${
                                    monthLockedByRenewal ? "text-slate-400" : "text-slate-700"
                                  }`}
                                >
                                  {formatAmount(budgetUsd)}
                                </td>
                              ) : null}
                              {showFunctionalColumn ? (
                                <td className="px-3 py-2.5">
                                  {!monthEditable ? (
                                    <div
                                      className={`flex items-center justify-between gap-2 rounded-xl border px-2 py-1 text-right font-semibold ${lockedCellClass}`}
                                    >
                                      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                        {currencyMarker}
                                      </span>
                                      <span>{formatNumber(forecastState.local)}</span>
                                    </div>
                                  ) : (
                                    <div
                                      className={`flex items-center gap-2 rounded-xl border px-2 py-1 ${lockedCellClass}`}
                                    >
                                      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                        {currencyMarker}
                                      </span>
                                      <input
                                        value={forecastLocalValue}
                                        onChange={(event) => {
                                          setDraftForecast((current) => ({
                                            ...current,
                                            [key]: event.target.value,
                                          }));
                                          setDraftForecastUsd((current) => {
                                            if (!(key in current)) {
                                              return current;
                                            }
                                            const next = { ...current };
                                            delete next[key];
                                            return next;
                                          });
                                          setDraftForecastSource((current) => ({
                                            ...current,
                                            [key]: "local",
                                          }));
                                        }}
                                        className="w-20 bg-transparent text-right text-sm font-semibold text-slate-800 outline-none"
                                      />
                                    </div>
                                  )}
                                </td>
                              ) : null}
                              <td className="px-3 py-2.5">
                                {!monthEditable ? (
                                  <div className={`flex items-center justify-between gap-2 rounded-xl border px-2 py-1 font-semibold ${lockedCellClass}`}>
                                    <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                      $
                                    </span>
                                    <span className="text-right">{formatNumber(forecastState.usd)}</span>
                                  </div>
                                ) : (
                                  <div className={`flex items-center gap-2 rounded-xl border px-2 py-1 ${lockedCellClass}`}>
                                    <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                      $
                                    </span>
                                    <input
                                      value={forecastUsdValue}
                                      onChange={(event) => {
                                        setDraftForecastUsd((current) => ({
                                          ...current,
                                          [key]: event.target.value,
                                        }));
                                        setDraftForecast((current) => {
                                          if (!(key in current)) {
                                            return current;
                                          }
                                          const next = { ...current };
                                          delete next[key];
                                          return next;
                                        });
                                        setDraftForecastSource((current) => ({
                                          ...current,
                                          [key]: "usd",
                                        }));
                                      }}
                                      className="w-24 bg-transparent text-right text-sm font-semibold text-slate-800 outline-none"
                                    />
                                  </div>
                                )}
                              </td>
                            </Fragment>
                          );
                        })}
                        {segment === "PS"
                          ? visibleMonths.map((month) => {
                              const key = `${row.recordId}|${month}`;
                              const monthLockedByRenewal =
                                renewalStartMonth !== null &&
                                FORECAST_MONTH_INDEX[month] < FORECAST_MONTH_INDEX[renewalStartMonth];
                              const forecastState = getEffectiveForecastState(row, month);
                              const actualMonthLocked = forecastState.source === "actual";
                              const usaRow = isUsCompany(row);
                              const monthEditable = isNewProjectRow
                                ? !readOnly && !actualMonthLocked && !usaRow
                                : canEditSheet && editableMonthSet.has(month) && !monthLockedByRenewal && !actualMonthLocked && !usaRow;
                              const baselineActualHours = forecastState.actualHours;
                              const workingDaysValue = normalizeWorkingDayValue(row.workingDays[month], DEFAULT_WORKING_DAYS);
                              const actualHrsValue = draftActualHrs[key] ?? String(baselineActualHours);
                              return (
                                <Fragment key={`driver-end-cell-${key}`}>
                                  <td className="px-3 py-2.5">
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-right font-semibold text-slate-800">
                                      {formatNumber(workingDaysValue)}
                                    </div>
                                  </td>
                                  <td className="px-3 py-2.5">
                                    {usaRow ? (
                                      <div className="rounded-xl border border-slate-200 bg-slate-100 px-2 py-1 text-right text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                                        USA
                                      </div>
                                    ) : !monthEditable ? (
                                      <div
                                        className={`rounded-xl border px-2 py-1 text-right font-semibold ${
                                          monthLockedByRenewal
                                            ? "border-slate-200 bg-slate-100 text-slate-400"
                                            : actualMonthLocked
                                              ? "border-blue-200 bg-blue-50 text-blue-900"
                                              : "border-slate-200 bg-slate-50 text-slate-800"
                                        }`}
                                      >
                                        {formatNumber(baselineActualHours)}
                                      </div>
                                    ) : (
                                      <input
                                        value={actualHrsValue}
                                        onChange={(event) =>
                                          setDraftActualHrs((current) => ({
                                            ...current,
                                            [key]: event.target.value,
                                          }))
                                        }
                                        className="w-24 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-right text-sm font-semibold text-slate-800 outline-none"
                                      />
                                    )}
                                  </td>
                                </Fragment>
                              );
                            })
                          : null}

                        {canEditSheet ? (
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              {rowManualMode !== "renewal" ? (
                                <button
                                  type="button"
                                  onClick={() => createRenewalRow(row.recordId)}
                                  disabled={creatingRow}
                                  className="inline-flex items-center rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                >
                                  Renewal
                                </button>
                              ) : null}
                              {row.isManualRow ? (
                                <button
                                  type="button"
                                  onClick={() => deleteManualRow(row.recordId)}
                                  disabled={creatingRow}
                                  className="inline-flex items-center rounded-lg border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                                >
                                  Delete
                                </button>
                              ) : null}
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableFullscreenShell>
          )}
        </CardContent>
      </Card>

      {canEditSheet && hasActiveUpload ? (
        <Card className="rounded-[24px] border border-slate-200 bg-white shadow-sm shadow-slate-950/5">
          <CardContent className="flex items-center justify-end gap-2 py-4">
            <Button
              type="button"
              onClick={() => void persistForecast("submit")}
              disabled={saving || loading || creatingRow}
              size="sm"
              className="rounded-lg px-3 py-1.5 text-xs"
            >
              {saving ? (
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Submit forecast
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
