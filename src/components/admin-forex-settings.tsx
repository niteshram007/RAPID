"use client";

import { useMemo, useState } from "react";
import { CalendarDays, CalendarRange, Coins, RefreshCcw, TrendingUp } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  useForexCurrencies,
  useForexRange,
  useForexSummary,
  useHistoricalForexRate,
  useLatestForexRate,
} from "@/hooks/useSettingsForex";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const EMPTY_FOREX_RANGE_ROWS: Array<{
  date: string;
  from_currency: string;
  to_currency: string;
  rate: number;
  change: number;
  change_percent: number;
}> = [];

function formatDateInput(value: Date) {
  return value.toISOString().slice(0, 10);
}

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function formatRate(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

function formatSignedPercent(value: number) {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(2)}%`;
}

function getSourceLabel(source?: string | null) {
  if (!source) {
    return "European Central Bank via Frankfurter";
  }
  if (source.toLowerCase() === "frankfurter") {
    return "European Central Bank via Frankfurter";
  }
  return source;
}

function buildForexInsights(summary: ReturnType<typeof useForexSummary>["data"], pairLabel: string) {
  if (!summary) {
    return [];
  }
  const insights = [
    `${pairLabel} changed ${formatSignedPercent(summary.rate_change_percent)} during the selected period.`,
    `The highest ${pairLabel} rate was ${formatRate(summary.highest_rate)} and the average rate was ${formatRate(summary.average_rate)}.`,
    `Volatility is currently classified as ${summary.volatility_status.toLowerCase()}.`,
  ];
  if (Math.abs(summary.rate_change_percent) >= 1) {
    insights.push("Currency movement may affect revenue conversion for billed projects in this pair.");
  }
  return insights;
}

function DateInputField({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  return (
    <label className="flex min-w-0 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2">
      <CalendarDays className="h-4 w-4 shrink-0 text-slate-400" />
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full min-w-0 bg-transparent text-sm font-medium text-slate-700 outline-none"
        aria-label={ariaLabel}
      />
    </label>
  );
}

function CurrencySelect({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
  ariaLabel: string;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="auth-input min-w-0"
      aria-label={ariaLabel}
    >
      {options.map(([code, name]) => (
        <option key={code} value={code} title={`${code} - ${name}`}>
          {code}
        </option>
      ))}
    </select>
  );
}

export function ForexSettingsPanel() {
  const today = useMemo(() => new Date(), []);
  const thirtyDaysAgo = useMemo(() => {
    const next = new Date(today);
    next.setDate(next.getDate() - 29);
    return next;
  }, [today]);

  const [latestParams, setLatestParams] = useState({
    amount: 1,
    from_currency: "USD",
    to_currency: "INR",
  });
  const [latestDraft, setLatestDraft] = useState(latestParams);
  const [historicalParams, setHistoricalParams] = useState({
    amount: 100,
    date: formatDateInput(today),
    from_currency: "USD",
    to_currency: "INR",
  });
  const [historicalDraft, setHistoricalDraft] = useState(historicalParams);
  const [rangeParams, setRangeParams] = useState({
    start_date: formatDateInput(thirtyDaysAgo),
    end_date: formatDateInput(today),
    from_currency: "USD",
    to_currency: "INR",
  });
  const [rangeDraft, setRangeDraft] = useState(rangeParams);
  const [page, setPage] = useState(1);

  const currenciesQuery = useForexCurrencies();
  const latestQuery = useLatestForexRate(latestParams);
  const historicalQuery = useHistoricalForexRate(historicalParams);
  const rangeQuery = useForexRange(rangeParams);
  const summaryQuery = useForexSummary(rangeParams);

  const currencyOptions = useMemo(
    () => Object.entries(currenciesQuery.data ?? {}).sort((left, right) => left[0].localeCompare(right[0])),
    [currenciesQuery.data],
  );
  const rangeRows = rangeQuery.data?.rows ?? EMPTY_FOREX_RANGE_ROWS;
  const pagedRangeRows = useMemo(() => {
    const start = (page - 1) * 10;
    return rangeRows.slice(start, start + 10);
  }, [page, rangeRows]);
  const totalPages = Math.max(1, Math.ceil(rangeRows.length / 10));
  const insights = useMemo(
    () =>
      buildForexInsights(
        summaryQuery.data,
        `${rangeParams.from_currency} to ${rangeParams.to_currency}`,
      ),
    [rangeParams.from_currency, rangeParams.to_currency, summaryQuery.data],
  );

  const refreshAll = async () => {
    await Promise.all([
      currenciesQuery.refetch(),
      latestQuery.refetch(),
      historicalQuery.refetch(),
      rangeQuery.refetch(),
      summaryQuery.refetch(),
    ]);
  };

  return (
    <div className="space-y-6">
      <Card className="border border-sky-200 bg-sky-50/70">
        <CardContent className="flex flex-col gap-2 p-5 text-sm text-slate-700 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-slate-950">Source: European Central Bank via Frankfurter</p>
            <p className="mt-1">
              Forex rates are fetched from Frankfurter API and are reference exchange rates. They may not represent real-time trading prices.
            </p>
          </div>
          <Button type="button" variant="secondary" onClick={() => void refreshAll()}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="border border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Currency converter</CardTitle>
            <CardDescription>Check the latest reference conversion for reporting.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,0.7fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_auto]">
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={latestDraft.amount}
                onChange={(event) =>
                  setLatestDraft((current) => ({
                    ...current,
                    amount: Number(event.target.value || 0),
                  }))
                }
                className="auth-input"
                aria-label="Amount"
              />
              <CurrencySelect
                value={latestDraft.from_currency}
                onChange={(value) =>
                  setLatestDraft((current) => ({ ...current, from_currency: value }))
                }
                options={currencyOptions}
                ariaLabel="From currency"
              />
              <CurrencySelect
                value={latestDraft.to_currency}
                onChange={(value) =>
                  setLatestDraft((current) => ({ ...current, to_currency: value }))
                }
                options={currencyOptions}
                ariaLabel="To currency"
              />
              <Button type="button" onClick={() => setLatestParams(latestDraft)}>
                <Coins className="mr-2 h-4 w-4" />
                Convert
              </Button>
            </div>

            {latestQuery.isError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {latestQuery.error instanceof Error
                  ? latestQuery.error.message
                  : "Unable to fetch forex rates right now. Please try again."}
              </div>
            ) : latestQuery.data ? (
              <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-5">
                <p className="text-sm font-semibold text-slate-950">
                  {latestQuery.data.amount} {latestQuery.data.from_currency} ={" "}
                  {formatMoney(latestQuery.data.converted_amount, latestQuery.data.to_currency)}
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  1 {latestQuery.data.from_currency} = {formatRate(latestQuery.data.rate)} {latestQuery.data.to_currency}
                </p>
                <p className="mt-3 text-xs uppercase tracking-[0.14em] text-slate-500">
                  {latestQuery.data.date} | {latestQuery.data.source}
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard
            title="Current Rate"
            value={latestQuery.data ? formatRate(latestQuery.data.rate) : "N/A"}
            detail={`${latestParams.from_currency} to ${latestParams.to_currency}`}
          />
          <StatCard
            title="Converted Amount"
            value={
              latestQuery.data
                ? formatMoney(latestQuery.data.converted_amount, latestParams.to_currency)
                : "N/A"
            }
            detail={`${latestParams.amount} ${latestParams.from_currency}`}
          />
          <StatCard
            title="Rate Date"
            value={latestQuery.data?.date ?? "N/A"}
            detail="Latest reference rate"
          />
          <StatCard
            title="Source"
            value={getSourceLabel(latestQuery.data?.source)}
            detail="Reference provider"
          />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="border border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Historical lookup</CardTitle>
            <CardDescription>Check a specific European Central Bank reference rate.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.7fr)_auto]">
              <DateInputField
                value={historicalDraft.date}
                onChange={(value) =>
                  setHistoricalDraft((current) => ({ ...current, date: value }))
                }
                ariaLabel="Historical date"
              />
              <CurrencySelect
                value={historicalDraft.from_currency}
                onChange={(value) =>
                  setHistoricalDraft((current) => ({ ...current, from_currency: value }))
                }
                options={currencyOptions}
                ariaLabel="Historical from currency"
              />
              <CurrencySelect
                value={historicalDraft.to_currency}
                onChange={(value) =>
                  setHistoricalDraft((current) => ({ ...current, to_currency: value }))
                }
                options={currencyOptions}
                ariaLabel="Historical to currency"
              />
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={historicalDraft.amount}
                onChange={(event) =>
                  setHistoricalDraft((current) => ({
                    ...current,
                    amount: Number(event.target.value || 0),
                  }))
                }
                className="auth-input"
                aria-label="Historical amount"
              />
              <Button type="button" onClick={() => setHistoricalParams(historicalDraft)}>
                Lookup
              </Button>
            </div>

            {historicalQuery.data ? (
              <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-5 text-sm text-slate-700">
                <p className="font-semibold text-slate-950">
                  Historical rate: {formatRate(historicalQuery.data.rate)}
                </p>
                <p className="mt-2">
                  Converted amount: {formatMoney(historicalQuery.data.converted_amount, historicalParams.to_currency)}
                </p>
                <p className="mt-2 text-xs uppercase tracking-[0.14em] text-slate-500">
                  {historicalQuery.data.date} | {getSourceLabel(historicalQuery.data.source)}
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Date range trend</CardTitle>
            <CardDescription>Track European Central Bank reference exchange-rate movement across the selected range.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,0.95fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_auto]">
              <DateInputField
                value={rangeDraft.start_date}
                onChange={(value) =>
                  setRangeDraft((current) => ({ ...current, start_date: value }))
                }
                ariaLabel="Range start date"
              />
              <DateInputField
                value={rangeDraft.end_date}
                onChange={(value) =>
                  setRangeDraft((current) => ({ ...current, end_date: value }))
                }
                ariaLabel="Range end date"
              />
              <CurrencySelect
                value={rangeDraft.from_currency}
                onChange={(value) =>
                  setRangeDraft((current) => ({ ...current, from_currency: value }))
                }
                options={currencyOptions}
                ariaLabel="Range from currency"
              />
              <CurrencySelect
                value={rangeDraft.to_currency}
                onChange={(value) =>
                  setRangeDraft((current) => ({ ...current, to_currency: value }))
                }
                options={currencyOptions}
                ariaLabel="Range to currency"
              />
              <Button
                type="button"
                onClick={() => {
                  setRangeParams(rangeDraft);
                  setPage(1);
                }}
              >
                <CalendarRange className="mr-2 h-4 w-4" />
                Apply
              </Button>
            </div>

            <div className="h-[320px]">
              {rangeRows.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={rangeRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#dbe4f0" />
                    <XAxis dataKey="date" tick={{ fill: "#475569", fontSize: 12 }} />
                    <YAxis tick={{ fill: "#475569", fontSize: 12 }} />
                    <RechartsTooltip formatter={(value) => formatRate(Number(value ?? 0))} />
                    <Line type="monotone" dataKey="rate" stroke="#00a7d6" strokeWidth={3} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : rangeQuery.isLoading ? (
                <div className="flex h-full items-center justify-center text-sm text-slate-500">
                  Loading trend...
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-slate-500">
                  No historical data is available for the selected range.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard title="Highest Rate" value={summaryQuery.data ? formatRate(summaryQuery.data.highest_rate) : "N/A"} detail="Peak in selected range" />
        <StatCard title="Lowest Rate" value={summaryQuery.data ? formatRate(summaryQuery.data.lowest_rate) : "N/A"} detail="Floor in selected range" />
        <StatCard title="Average Rate" value={summaryQuery.data ? formatRate(summaryQuery.data.average_rate) : "N/A"} detail="Average reference rate" />
        <StatCard title="Rate Change" value={summaryQuery.data ? formatRate(summaryQuery.data.rate_change) : "N/A"} detail="End vs start" />
        <StatCard title="Rate Change %" value={summaryQuery.data ? formatSignedPercent(summaryQuery.data.rate_change_percent) : "N/A"} detail="Period movement" />
        <StatCard title="Volatility" value={summaryQuery.data?.volatility_status ?? "N/A"} detail="Trend classification" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="border border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Rate table</CardTitle>
            <CardDescription>Reference daily rates for the selected pair and period.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Date</th>
                    <th className="px-3 py-2 text-left font-semibold">From</th>
                    <th className="px-3 py-2 text-left font-semibold">To</th>
                    <th className="px-3 py-2 text-right font-semibold">Rate</th>
                    <th className="px-3 py-2 text-right font-semibold">Change</th>
                    <th className="px-3 py-2 text-right font-semibold">Change %</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRangeRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                        No rows to display.
                      </td>
                    </tr>
                  ) : (
                    pagedRangeRows.map((row) => (
                      <tr key={row.date} className="border-b border-slate-100">
                        <td className="px-3 py-2">{row.date}</td>
                        <td className="px-3 py-2">{row.from_currency}</td>
                        <td className="px-3 py-2">{row.to_currency}</td>
                        <td className="px-3 py-2 text-right">{formatRate(row.rate)}</td>
                        <td className="px-3 py-2 text-right">{formatRate(row.change)}</td>
                        <td className="px-3 py-2 text-right">{formatSignedPercent(row.change_percent)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
                  Previous
                </Button>
                <Button type="button" variant="secondary" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Business insights</CardTitle>
            <CardDescription>Calculated guidance from the selected forex range.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {insights.length > 0 ? (
              insights.map((insight) => (
                <div key={insight} className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm leading-6 text-slate-700">
                  {insight}
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">
                Choose a valid range to generate forex insights.
              </div>
            )}
            <div className="rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-4 text-sm text-slate-700">
              <div className="flex items-center gap-2 font-semibold text-slate-950">
                <TrendingUp className="h-4 w-4 text-sky-700" />
                Last updated
              </div>
              <p className="mt-2">{latestQuery.data?.date ?? rangeQuery.data?.end_date ?? "N/A"}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export const AdminForexSettings = ForexSettingsPanel;

function StatCard({
  title,
  value,
  detail,
}: {
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <Card className="border border-slate-200 bg-white">
      <CardContent className="p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{title}</p>
        <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
        <p className="mt-2 text-sm text-slate-600">{detail}</p>
      </CardContent>
    </Card>
  );
}
