import Link from "next/link";
import { ArrowRight, ArrowUpRight, BarChart3, Globe2, Lightbulb } from "lucide-react";

import { MetricTile } from "@/components/analytics/metric-tile";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { RevenueDashboardData } from "@/lib/backend-api";

type ExecutiveOverviewProps = {
  data: RevenueDashboardData;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function ExecutiveOverview({ data }: ExecutiveOverviewProps) {
  const uploadedAt = data.dataset.uploadedAt
    ? new Date(data.dataset.uploadedAt).toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Waiting for an active workbook";

  const topRegionRows = data.topRegions.slice(0, 5);
  const topInsightRows = data.insights.slice(0, 4);
  const deltaPct = data.comparison.deltaPct;
  const deltaTone = data.comparison.delta >= 0 ? "positive" : "negative";

  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-4">
        <MetricTile
          label="Budget"
          value={formatCurrency(data.summary.totalBudget)}
          detail={`${data.summary.projectCount} projects across ${data.summary.customerCount} customers are in scope.`}
          tooltip="Planned revenue for the active operating slice."
        />
        <MetricTile
          label="Actual"
          value={formatCurrency(data.summary.totalActual)}
          detail={`Latest active dataset updated ${uploadedAt}.`}
          delta={`${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(1)}%`}
          tone={deltaTone}
          tooltip="Recognized revenue for the current workbook slice."
        />
        <MetricTile
          label="Forecast"
          value={formatCurrency(data.summary.totalOutlook)}
          detail={`What-if model currently applies ${data.trend.whatIfPct >= 0 ? "+" : ""}${data.trend.whatIfPct}% to forecast.`}
          tooltip="Forecasted revenue for the active view."
        />
        <MetricTile
          label="Variance"
          value={formatCurrency(data.summary.totalVariance)}
          detail={data.comparison.previousLabel
            ? `Previous period context: ${data.comparison.previousLabel}.`
            : "Open Comparison Workspace for deeper variance analysis."}
          delta={`${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(1)}%`}
          tone={deltaTone}
          tooltip="Difference between actual and the selected baseline."
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <Card>
          <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <Badge variant="sky" className="w-fit gap-2">
                <BarChart3 className="h-3.5 w-3.5" />
                Overview
              </Badge>
              <CardTitle>Comparison workspace is now the main analysis area</CardTitle>
              <CardDescription>
                Use the dedicated comparison page to slice by geography, practice,
                BDM, account, and time with staged filters and linked visuals.
              </CardDescription>
            </div>
            <Link
              href="/executive/slicer"
              className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Open Comparison Workspace
              <ArrowRight className="h-4 w-4" />
            </Link>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-5 py-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Current comparison
              </p>
              <p className="mt-3 text-2xl font-semibold text-slate-950">
                {data.comparison.label}
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Current value {formatCurrency(data.comparison.currentValue)} against
                baseline {formatCurrency(data.comparison.baselineValue)}.
              </p>
            </div>
            <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-5 py-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Data coverage
              </p>
              <p className="mt-3 text-2xl font-semibold text-slate-950">
                {data.summary.rowCount} records
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Loaded from {data.dataset.originalFilename ?? "the active dataset"}.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Badge variant="neutral" className="w-fit gap-2">
              <Lightbulb className="h-3.5 w-3.5" />
              Highlights
            </Badge>
            <CardTitle>Business signals to review</CardTitle>
            <CardDescription>
              Rule-based observations from the active workbook slice.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {topInsightRows.length === 0 ? (
              <p className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/80 px-4 py-4 text-sm text-slate-500">
                Insights will appear here once workbook data is available.
              </p>
            ) : (
              topInsightRows.map((insight) => (
                <div
                  key={insight.headline}
                  className="rounded-[22px] border border-slate-200 bg-white px-4 py-4"
                >
                  <p className="text-sm font-semibold text-slate-950">
                    {insight.headline}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {insight.detail}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <Badge variant="neutral" className="w-fit gap-2">
              <Globe2 className="h-3.5 w-3.5" />
              Top Regions
            </Badge>
            <CardTitle>Current contribution snapshot</CardTitle>
            <CardDescription>
              Highest-contributing regions in the active dataset before you drill further.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {topRegionRows.map((row) => (
            <div
              key={row.label}
              className="rounded-[24px] border border-slate-200 bg-white px-4 py-4"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-950">{row.label}</p>
                <ArrowUpRight className="h-4 w-4 text-slate-300" />
              </div>
              <p className="mt-3 text-xl font-semibold text-slate-950">
                {formatCurrency(row.actual)}
              </p>
              <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                {(row.contributionPct ?? 0).toFixed(1)}% contribution
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Budget {formatCurrency(row.budget)} and forecast{" "}
                {formatCurrency(row.forecast ?? row.outlook ?? 0)}.
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
