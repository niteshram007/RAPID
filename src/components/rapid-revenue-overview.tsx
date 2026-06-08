"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRightLeft, Target } from "lucide-react";
import { LazyBirdeyeAnalyticsKiosk } from "@/components/workspace-lazy-components";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import type { RevenueDashboardData, RevenueDashboardMeta } from "@/lib/backend-api";
import { formatCompactCurrency, getFiscalYearEndLabel } from "@/lib/format";
import type { RapidRevenueOverview } from "@/lib/rapid-revenue";
import { appendSharedWorkspaceSearch } from "@/lib/workspace-search";

type RapidRevenueOverviewPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  basePath: string;
  overview: RapidRevenueOverview;
  analyticsData?: Pick<RevenueDashboardData, "summary" | "dataset" | "monthlySeries">;
  analyticsMeta?: RevenueDashboardMeta;
  canForecast?: boolean;
  showRestrictedRoleBudgets?: boolean;
};

type DashboardTimeframe = "annual" | "mtd" | "ytd" | "quarter";
type DashboardQuarter = "Q1" | "Q2" | "Q3" | "Q4";
type FiscalMonth =
  | "Apr"
  | "May"
  | "Jun"
  | "Jul"
  | "Aug"
  | "Sep"
  | "Oct"
  | "Nov"
  | "Dec"
  | "Jan"
  | "Feb"
  | "Mar";

type OverviewMspsValues = {
  ms: number;
  ps: number;
};

type OverviewMetricSet = {
  fy: number;
  mtd: number;
  ytd: number;
  mspsLabel: string;
  mspsValues: OverviewMspsValues;
};

const FISCAL_MONTH_OPTIONS: FiscalMonth[] = [
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
];

const QUARTER_MONTH_MAP: Record<DashboardQuarter, FiscalMonth[]> = {
  Q1: ["Apr", "May", "Jun"],
  Q2: ["Jul", "Aug", "Sep"],
  Q3: ["Oct", "Nov", "Dec"],
  Q4: ["Jan", "Feb", "Mar"],
};

function normalizeSeriesMonth(monthLabel: string | null | undefined) {
  const normalized = String(monthLabel ?? "").trim();
  if (!normalized) {
    return null;
  }
  return normalized.slice(0, 3);
}

function resolveDashboardTimeframe(value: string | null, legacyQuarter: string | null): DashboardTimeframe {
  if (value === "annual" || value === "mtd" || value === "ytd" || value === "quarter") {
    return value;
  }
  if (value === "fy") {
    return "annual";
  }
  if (
    value === "q1" ||
    value === "q2" ||
    value === "q3" ||
    value === "q4" ||
    legacyQuarter === "Q1" ||
    legacyQuarter === "Q2" ||
    legacyQuarter === "Q3" ||
    legacyQuarter === "Q4"
  ) {
    return "quarter";
  }
  return "annual";
}

function resolveDashboardMonth(value: string | null | undefined, fallbackMonth: string): FiscalMonth {
  const normalized = normalizeSeriesMonth(value) ?? normalizeSeriesMonth(fallbackMonth) ?? "Apr";
  return FISCAL_MONTH_OPTIONS.includes(normalized as FiscalMonth)
    ? (normalized as FiscalMonth)
    : "Apr";
}

function resolveDashboardQuarter(
  value: string | null | undefined,
  legacyTimeframe: string | null,
  month: FiscalMonth,
): DashboardQuarter {
  if (value === "Q1" || value === "Q2" || value === "Q3" || value === "Q4") {
    return value;
  }
  if (legacyTimeframe === "q1") {
    return "Q1";
  }
  if (legacyTimeframe === "q2") {
    return "Q2";
  }
  if (legacyTimeframe === "q3") {
    return "Q3";
  }
  if (legacyTimeframe === "q4") {
    return "Q4";
  }
  if (QUARTER_MONTH_MAP.Q1.includes(month)) {
    return "Q1";
  }
  if (QUARTER_MONTH_MAP.Q2.includes(month)) {
    return "Q2";
  }
  if (QUARTER_MONTH_MAP.Q3.includes(month)) {
    return "Q3";
  }
  return "Q4";
}

function findSeriesValue(
  data: RapidRevenueOverviewPageProps["analyticsData"],
  monthLabel: string | null,
  field: "budget" | "forecast" | "actual",
) {
  if (!data?.monthlySeries || data.monthlySeries.length === 0) {
    return null;
  }
  const normalizedMonth = normalizeSeriesMonth(monthLabel);
  if (!normalizedMonth) {
    return Number(data.monthlySeries.at(-1)?.[field] ?? 0);
  }
  const row = data.monthlySeries.find(
    (entry) => normalizeSeriesMonth(entry.month) === normalizedMonth,
  );
  return row ? Number(row[field] ?? 0) : Number(data.monthlySeries.at(-1)?.[field] ?? 0);
}

function sumSeriesThroughMonth(
  data: RapidRevenueOverviewPageProps["analyticsData"],
  monthLabel: string | null,
  field: "budget" | "forecast" | "actual",
) {
  if (!data?.monthlySeries || data.monthlySeries.length === 0) {
    return null;
  }
  const normalizedMonth = normalizeSeriesMonth(monthLabel);
  const endIndex = normalizedMonth
    ? data.monthlySeries.findIndex(
        (entry) => normalizeSeriesMonth(entry.month) === normalizedMonth,
      )
    : -1;
  const slice = endIndex >= 0 ? data.monthlySeries.slice(0, endIndex + 1) : data.monthlySeries;
  return slice.reduce((total, entry) => total + Number(entry[field] ?? 0), 0);
}

function emptyMspsValues(): OverviewMspsValues {
  return { ms: 0, ps: 0 };
}

function addMspsValues(left: OverviewMspsValues, right: OverviewMspsValues) {
  return {
    ms: left.ms + right.ms,
    ps: left.ps + right.ps,
  };
}

function readMonthlySplitValues(
  entry: NonNullable<RapidRevenueOverviewPageProps["analyticsData"]>["monthlySeries"][number],
  metric: "budget" | "forecast" | "actual",
): OverviewMspsValues {
  if (metric === "budget") {
    return {
      ms: Number(entry.budgetMs ?? 0),
      ps: Number(entry.budgetPs ?? 0),
    };
  }
  if (metric === "forecast") {
    return {
      ms: Number(entry.forecastMs ?? 0),
      ps: Number(entry.forecastPs ?? 0),
    };
  }
  return {
    ms: Number(entry.actualMs ?? 0),
    ps: Number(entry.actualPs ?? 0),
  };
}

function findSeriesSplitValue(
  data: RapidRevenueOverviewPageProps["analyticsData"],
  monthLabel: string | null,
  metric: "budget" | "forecast" | "actual",
) {
  if (!data?.monthlySeries || data.monthlySeries.length === 0) {
    return emptyMspsValues();
  }
  const normalizedMonth = normalizeSeriesMonth(monthLabel);
  if (!normalizedMonth) {
    const lastRow = data.monthlySeries.at(-1);
    return lastRow ? readMonthlySplitValues(lastRow, metric) : emptyMspsValues();
  }
  const row = data.monthlySeries.find((entry) => normalizeSeriesMonth(entry.month) === normalizedMonth);
  return row ? readMonthlySplitValue(row, metric) : emptyMspsValues();
}

function readMonthlySplitValue(
  entry: NonNullable<RapidRevenueOverviewPageProps["analyticsData"]>["monthlySeries"][number],
  metric: "budget" | "forecast" | "actual",
) {
  return readMonthlySplitValues(entry, metric);
}

function sumSeriesSplitThroughMonth(
  data: RapidRevenueOverviewPageProps["analyticsData"],
  monthLabel: string | null,
  metric: "budget" | "forecast" | "actual",
) {
  if (!data?.monthlySeries || data.monthlySeries.length === 0) {
    return emptyMspsValues();
  }
  const normalizedMonth = normalizeSeriesMonth(monthLabel);
  const endIndex = normalizedMonth
    ? data.monthlySeries.findIndex((entry) => normalizeSeriesMonth(entry.month) === normalizedMonth)
    : -1;
  const slice = endIndex >= 0 ? data.monthlySeries.slice(0, endIndex + 1) : data.monthlySeries;
  return slice.reduce(
    (total, entry) => addMspsValues(total, readMonthlySplitValue(entry, metric)),
    emptyMspsValues(),
  );
}

function sumSeriesSplitForMonths(
  data: RapidRevenueOverviewPageProps["analyticsData"],
  months: readonly FiscalMonth[],
  metric: "budget" | "forecast" | "actual",
) {
  if (!data?.monthlySeries || data.monthlySeries.length === 0) {
    return emptyMspsValues();
  }
  const normalizedMonthSet = new Set(months.map((month) => normalizeSeriesMonth(month)));
  return data.monthlySeries.reduce((total, entry) => {
    if (!normalizedMonthSet.has(normalizeSeriesMonth(entry.month))) {
      return total;
    }
    return addMspsValues(total, readMonthlySplitValue(entry, metric));
  }, emptyMspsValues());
}

function readSummarySplitValues(
  data: RapidRevenueOverviewPageProps["analyticsData"],
  metric: "budget" | "forecast" | "actual",
) {
  const values = data?.summary?.totalsByMsps?.[metric];
  return {
    ms: Number(values?.ms ?? 0),
    ps: Number(values?.ps ?? 0),
  };
}

function OverviewMetricTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="group relative overflow-hidden rounded-[18px] border border-white/80 bg-white/80 px-3 py-3 shadow-[0_12px_28px_rgba(15,23,42,0.08)] backdrop-blur-2xl transition-transform duration-300 hover:-translate-y-0.5">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-[radial-gradient(circle_at_top_right,rgba(14,165,233,0.12),transparent_58%)]" />
      <p className="relative text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="relative mt-2 text-[1.38rem] font-semibold tracking-tight text-slate-950">{value}</p>
      <p className="relative mt-1.5 text-[12px] leading-5 text-slate-600">{detail}</p>
    </article>
  );
}

function OverviewMspsCarouselTile({
  label,
  values,
  detail,
}: {
  label: string;
  values: OverviewMspsValues;
  detail: string;
}) {
  const slides = useMemo(
    () => [
      { key: "MS", value: values.ms },
      { key: "PS", value: values.ps },
    ],
    [values.ms, values.ps],
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const activeSlide = slides[activeIndex] ?? slides[0];

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % slides.length);
    }, 3200);
    return () => window.clearInterval(timer);
  }, [slides.length]);

  return (
    <article className="group relative overflow-hidden rounded-[18px] border border-white/80 bg-white/80 px-3 py-3 shadow-[0_12px_28px_rgba(15,23,42,0.08)] backdrop-blur-2xl transition-transform duration-300 hover:-translate-y-0.5">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-[radial-gradient(circle_at_top_right,rgba(2,132,199,0.14),transparent_58%)]" />
      <div className="relative flex items-start justify-between gap-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
        <span className="rounded-full border border-sky-100 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-800">
          {activeSlide?.key}
        </span>
      </div>
      <p className="relative mt-2 text-[1.38rem] font-semibold tracking-tight text-slate-950">
        {formatCompactCurrency(activeSlide?.value ?? 0)}
      </p>
      <div className="relative mt-1.5 flex items-center gap-2">
        {slides.map((slide, index) => (
          <span
            key={slide.key}
            className={`h-2 w-2 rounded-full transition-all duration-300 ${
              index === activeIndex ? "bg-slate-950" : "bg-slate-200"
            }`}
          />
        ))}
      </div>
      <p className="relative mt-1.5 text-[12px] leading-5 text-slate-600">{detail}</p>
    </article>
  );
}

function formatYtdWindowLabel(month: FiscalMonth) {
  return month === "Apr" ? "Apr" : `Apr-${month}`;
}

function OverviewDatasetRow({
  title,
  metricSet,
  fiscalYearLabel,
  activeCustomers,
  currentPeriodLabel,
  ytdPeriodLabel,
  mtdPeriodLabel,
}: {
  title: string;
  metricSet: OverviewMetricSet;
  fiscalYearLabel: string;
  activeCustomers: number;
  currentPeriodLabel: string;
  ytdPeriodLabel: string;
  mtdPeriodLabel: string;
}) {
  return (
    <section className="overflow-hidden rounded-[22px] border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(248,250,252,0.92))] p-3 shadow-[0_16px_40px_rgba(15,23,42,0.07)] backdrop-blur-2xl lg:p-3.5">
      <div className="px-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-600 lg:text-xs">
          {title}
        </p>
      </div>
      <div className="mt-2.5 grid gap-2.5 md:grid-cols-2 xl:grid-cols-5">
        <OverviewMetricTile
          label={`FY ${fiscalYearLabel.slice(-2)}`}
          value={formatCompactCurrency(metricSet.fy)}
          detail={`Full financial year view for ${title.toLowerCase()}.`}
        />
        <OverviewMetricTile
          label={`MTD ${mtdPeriodLabel}`}
          value={formatCompactCurrency(metricSet.mtd)}
          detail={`Month-to-date value for ${title.toLowerCase()} in ${mtdPeriodLabel}.`}
        />
        <OverviewMetricTile
          label={`YTD ${ytdPeriodLabel}`}
          value={formatCompactCurrency(metricSet.ytd)}
          detail={`Year-to-date value for ${title.toLowerCase()} from Apr through ${ytdPeriodLabel.replace("Apr-", "")}.`}
        />
        <OverviewMspsCarouselTile
          label={metricSet.mspsLabel}
          values={metricSet.mspsValues}
          detail={currentPeriodLabel}
        />
        <OverviewMetricTile
          label="Active Customers"
          value={activeCustomers.toLocaleString("en-US")}
          detail="Unique active customer accounts in the visible workspace slice."
        />
      </div>
    </section>
  );
}

function resolveTimeframeMspsValues(
  data: RapidRevenueOverviewPageProps["analyticsData"],
  metric: "budget" | "forecast" | "actual",
  timeframe: DashboardTimeframe,
  selectedMonth: FiscalMonth,
  selectedQuarter: DashboardQuarter,
  selectedPeriodMonth: FiscalMonth,
) {
  if (timeframe === "annual") {
    return readSummarySplitValues(data, metric);
  }
  if (timeframe === "quarter") {
    return sumSeriesSplitForMonths(data, QUARTER_MONTH_MAP[selectedQuarter], metric);
  }
  if (timeframe === "ytd") {
    return sumSeriesSplitThroughMonth(data, selectedPeriodMonth, metric);
  }
  return findSeriesSplitValue(data, selectedMonth, metric);
}

function resolveYtdMonthLabel(
  timeframe: DashboardTimeframe,
  selectedMonth: FiscalMonth,
  selectedQuarter: DashboardQuarter,
) {
  if (timeframe === "quarter") {
    return QUARTER_MONTH_MAP[selectedQuarter][QUARTER_MONTH_MAP[selectedQuarter].length - 1];
  }
  return selectedMonth;
}

function buildOverviewStatus(meta: RevenueDashboardMeta | null | undefined) {
  if (!meta || meta.dataState === "fresh") {
    return null;
  }

  const reason = meta.reason ?? "backend_unavailable";
  const toneClass =
    meta.dataState === "fallback"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : "border-amber-200 bg-amber-50 text-amber-800";
  const message =
    reason === "unauthorized"
      ? "Session expired. Sign in again to refresh dashboard metrics."
      : reason === "forbidden"
        ? "Access scope changed. Some dashboard metrics may be stale."
        : reason === "timeout"
          ? "Request timed out. Showing the latest successful metrics."
          : meta.dataState === "fallback"
            ? "Backend is unavailable and no cached dashboard snapshot was found."
            : "Backend is unavailable. Showing the latest successful metrics.";

  return {
    toneClass,
    message,
    lastSuccessAt: meta.lastSuccessAt ?? null,
  };
}

export function RapidRevenueOverviewPage({
  eyebrow,
  title,
  description,
  basePath,
  overview,
  analyticsData,
  analyticsMeta,
  canForecast = false,
  showRestrictedRoleBudgets = false,
}: RapidRevenueOverviewPageProps) {
  const isWorkspaceDashboard = [
    "/executive",
    "/bdm",
    "/practice-head",
    "/geo-head",
    "/buh",
  ].includes(basePath);
  const isBudgetRestrictedWorkspace =
    basePath === "/bdm" || basePath === "/practice-head";
  const showBudgetDatasetRow =
    !isWorkspaceDashboard || !isBudgetRestrictedWorkspace || showRestrictedRoleBudgets;
  const showActualDatasetRow =
    !isWorkspaceDashboard || isBudgetRestrictedWorkspace;
  const showForecastDatasetRow =
    !isWorkspaceDashboard || isBudgetRestrictedWorkspace;
  const searchParams = useSearchParams();
  const selectedTimeframe = resolveDashboardTimeframe(
    searchParams.get("dashboardTimeframe"),
    searchParams.get("dashboardQuarter"),
  );
  const currentMonth = normalizeSeriesMonth(overview.currentMonthLabel) ?? "Apr";
  const currentFiscalMonth = resolveDashboardMonth(overview.currentMonthLabel, currentMonth);
  const selectedMonth = resolveDashboardMonth(
    searchParams.get("dashboardMonth") ?? searchParams.get("periodTo"),
    currentFiscalMonth,
  );
  const selectedQuarter = resolveDashboardQuarter(
    searchParams.get("dashboardQuarter"),
    searchParams.get("dashboardTimeframe"),
    selectedMonth,
  );
  const selectedPeriodMonth = useMemo(() => {
    return resolveYtdMonthLabel(selectedTimeframe, selectedMonth, selectedQuarter);
  }, [selectedMonth, selectedQuarter, selectedTimeframe]);
  const selectedDisplayMonth = useMemo(
    () => (selectedTimeframe === "quarter" ? selectedPeriodMonth : selectedMonth),
    [selectedMonth, selectedPeriodMonth, selectedTimeframe],
  );
  const selectedYtdLabel = useMemo(
    () => formatYtdWindowLabel(selectedPeriodMonth),
    [selectedPeriodMonth],
  );
  const fiscalYearLabel = getFiscalYearEndLabel(overview.financialYear);
  const analyticsKioskHref = appendSharedWorkspaceSearch(
    basePath === "/practice-head" ||
      basePath === "/buh" ||
      basePath === "/bdm" ||
      basePath === "/geo-head"
      ? `${basePath}/analytics-kiosk`
      : `${basePath}/slicer`,
    searchParams,
  );
  const forecastHref = appendSharedWorkspaceSearch(`${basePath}/forecast`, searchParams);
  const workspaceLinkClass =
    "inline-flex items-center gap-2 rounded-full border border-slate-950 bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_36px_rgba(15,23,42,0.14)] hover:-translate-y-0.5 hover:bg-slate-900";

  const budgetMetrics = useMemo<OverviewMetricSet>(
    () => {
      const summaryBudget = Number(analyticsData?.summary?.totalBudget ?? 0);
      const monthBudget = findSeriesValue(analyticsData, selectedDisplayMonth, "budget");
      const ytdBudget = sumSeriesThroughMonth(analyticsData, selectedPeriodMonth, "budget");
      return {
        fy: summaryBudget > 0 ? summaryBudget : overview.totalFY,
        mtd:
          monthBudget && monthBudget > 0
            ? monthBudget
            : overview.monthToDateTotal,
        ytd:
          ytdBudget && ytdBudget > 0
            ? ytdBudget
            : overview.yearToDateTotal,
        mspsLabel: "MS / PS",
        mspsValues: resolveTimeframeMspsValues(
          analyticsData,
          "budget",
          selectedTimeframe,
          selectedMonth,
          selectedQuarter,
          selectedPeriodMonth,
        ),
      };
    },
    [
      analyticsData,
      overview,
      selectedDisplayMonth,
      selectedPeriodMonth,
      selectedQuarter,
      selectedTimeframe,
    ],
  );
  const globalRevenueMetrics = useMemo<OverviewMetricSet>(
    () => ({
      fy: analyticsData?.summary?.totalActual ?? 0,
      mtd: findSeriesValue(analyticsData, selectedDisplayMonth, "actual") ?? 0,
      ytd: sumSeriesThroughMonth(analyticsData, selectedPeriodMonth, "actual") ?? 0,
      mspsLabel: "MS / PS",
      mspsValues: resolveTimeframeMspsValues(
        analyticsData,
        "actual",
        selectedTimeframe,
        selectedMonth,
        selectedQuarter,
        selectedPeriodMonth,
      ),
    }),
    [analyticsData, selectedDisplayMonth, selectedMonth, selectedPeriodMonth, selectedQuarter, selectedTimeframe],
  );
  const forecastMetrics = useMemo<OverviewMetricSet>(
    () => ({
      fy: Number(analyticsData?.summary?.totalOutlook ?? 0),
      mtd: findSeriesValue(analyticsData, selectedDisplayMonth, "forecast") ?? 0,
      ytd: sumSeriesThroughMonth(analyticsData, selectedPeriodMonth, "forecast") ?? 0,
      mspsLabel: "MS / PS",
      mspsValues: resolveTimeframeMspsValues(
        analyticsData,
        "forecast",
        selectedTimeframe,
        selectedMonth,
        selectedQuarter,
        selectedPeriodMonth,
      ),
    }),
    [analyticsData, selectedDisplayMonth, selectedMonth, selectedPeriodMonth, selectedQuarter, selectedTimeframe],
  );
  const activeCustomerCount = analyticsData?.summary?.customerCount ?? overview.customerCount;
  const selectedPeriodLabel = useMemo(() => {
    if (selectedTimeframe === "annual") {
      return "Annual MS and PS financial year view across Apr to Mar.";
    }
    if (selectedTimeframe === "quarter") {
      const quarterMonths = QUARTER_MONTH_MAP[selectedQuarter];
      return `${selectedQuarter} MS and PS financial year view across ${quarterMonths[0]} to ${quarterMonths.at(-1)}.`;
    }
    if (selectedTimeframe === "ytd") {
      return `YTD MS and PS financial year view through ${selectedPeriodMonth}.`;
    }
    return `MTD MS and PS financial year view for ${selectedDisplayMonth}.`;
  }, [selectedDisplayMonth, selectedPeriodMonth, selectedQuarter, selectedTimeframe]);
  const overviewStatus = useMemo(
    () => buildOverviewStatus(analyticsMeta),
    [analyticsMeta],
  );

  return (
    <div className="space-y-6">
      {!isWorkspaceDashboard ? (
        <WorkspacePageHeader
          eyebrow={eyebrow}
          title={title}
          description={description}
          actions={
            <div className="flex flex-wrap gap-3">
              <Link href={analyticsKioskHref} className={workspaceLinkClass}>
                Analytics Kiosk
                <ArrowRightLeft className="h-4 w-4" />
              </Link>
              {canForecast ? (
                <Link
                  href={forecastHref}
                  className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-5 py-3 text-sm font-semibold text-sky-800 hover:border-sky-300"
                >
                  Monthly forecast
                  <Target className="h-4 w-4" />
                </Link>
              ) : null}
            </div>
          }
        />
      ) : null}

      <div className="space-y-6">
        {overviewStatus ? (
          <section className={`rounded-[18px] border px-4 py-3 text-sm ${overviewStatus.toneClass}`}>
            <p>{overviewStatus.message}</p>
            {overviewStatus.lastSuccessAt ? (
              <p className="mt-1 text-xs opacity-85">
                Last successful sync: {new Date(overviewStatus.lastSuccessAt).toLocaleString()}
              </p>
            ) : null}
          </section>
        ) : null}
        {showBudgetDatasetRow ? (
          <OverviewDatasetRow
            title="Budget"
            metricSet={budgetMetrics}
            fiscalYearLabel={fiscalYearLabel}
            activeCustomers={activeCustomerCount}
            currentPeriodLabel={selectedPeriodLabel}
            ytdPeriodLabel={selectedYtdLabel}
            mtdPeriodLabel={selectedDisplayMonth}
          />
        ) : null}
        {showActualDatasetRow ? (
          <OverviewDatasetRow
            title="Actuals"
            metricSet={globalRevenueMetrics}
            fiscalYearLabel={fiscalYearLabel}
            activeCustomers={activeCustomerCount}
            currentPeriodLabel={selectedPeriodLabel}
            ytdPeriodLabel={selectedYtdLabel}
            mtdPeriodLabel={selectedDisplayMonth}
          />
        ) : null}
        {showForecastDatasetRow ? (
          <OverviewDatasetRow
            title="Forecast"
            metricSet={forecastMetrics}
            fiscalYearLabel={fiscalYearLabel}
            activeCustomers={activeCustomerCount}
            currentPeriodLabel={selectedPeriodLabel}
            ytdPeriodLabel={selectedYtdLabel}
            mtdPeriodLabel={selectedDisplayMonth}
          />
        ) : null}

        {isWorkspaceDashboard ? (
          <LazyBirdeyeAnalyticsKiosk
            variant="dashboard"
            showRestrictedRoleBudgets={showRestrictedRoleBudgets}
          />
        ) : null}
      </div>
    </div>
  );
}
