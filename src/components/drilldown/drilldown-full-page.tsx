"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, LoaderCircle, Search, SlidersHorizontal } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { DrillDownFilterChips } from "@/components/drilldown/DrillDownFilterChips";
import { DrillDownTable } from "@/components/drilldown/DrillDownTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DrillDownContext,
  exportDrillDownDetails,
  fetchDrillDownDetails,
} from "@/lib/drilldown";

export function DrillDownFullPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [sortBy, setSortBy] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedColumnKeys, setSelectedColumnKeys] = useState<string[] | null>(null);
  const [exporting, setExporting] = useState<"" | "csv" | "xlsx">("");

  const parsedContext = useMemo(() => {
    const rawContext = searchParams.get("context");
    if (!rawContext) {
      return { value: null, error: "Missing drilldown context." };
    }
    try {
      const parsed = JSON.parse(decodeURIComponent(rawContext)) as DrillDownContext;
      return { value: parsed, error: null };
    } catch {
      return { value: null, error: "Unable to parse drilldown context." };
    }
  }, [searchParams]);

  const requestContext = useMemo(() => {
    if (!parsedContext.value) {
      return null;
    }
    return {
      ...parsedContext.value,
      page,
      pageSize,
      sortBy: sortBy || parsedContext.value.sortBy,
      sortDir,
      search: deferredSearch || parsedContext.value.search,
      columns: selectedColumnKeys ?? parsedContext.value.columns,
    } satisfies DrillDownContext;
  }, [deferredSearch, page, pageSize, parsedContext.value, selectedColumnKeys, sortBy, sortDir]);

  const detailsQuery = useQuery({
    queryKey: ["drilldown-full-page", requestContext],
    enabled: Boolean(requestContext),
    queryFn: async () =>
      fetchDrillDownDetails(requestContext as DrillDownContext),
  });

  useEffect(() => {
    if (!detailsQuery.data || sortBy) {
      return;
    }
    if (detailsQuery.data.columns.length > 0) {
      setSortBy(detailsQuery.data.columns[0].key);
    }
  }, [detailsQuery.data, sortBy]);

  const payload = detailsQuery.data;
  const error =
    parsedContext.error ??
    (detailsQuery.error instanceof Error ? detailsQuery.error.message : null);
  const visibleColumns = useMemo(() => {
    if (!payload) {
      return [];
    }
    if (!selectedColumnKeys || selectedColumnKeys.length === 0) {
      return payload.columns;
    }
    const selected = new Set(selectedColumnKeys);
    return payload.columns.filter((column) => selected.has(column.key));
  }, [payload, selectedColumnKeys]);

  const hasNextPage = Boolean(
    payload &&
      payload.pagination.page * payload.pagination.page_size < payload.pagination.total_rows,
  );

  async function handleExport(format: "csv" | "xlsx") {
    if (!requestContext) {
      return;
    }
    setExporting(format);
    try {
      const { blob, filename } = await exportDrillDownDetails(
        {
          ...requestContext,
          page: 1,
          pageSize: 1000,
        },
        format,
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting("");
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-4">
      <div className="rounded-[20px] border border-slate-200 bg-white px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Drill Down
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-950">
              {payload?.title ?? "Underlying Records"}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Underlying rows for the selected scope and timeframe.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" onClick={() => router.back()}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void handleExport("csv")}
              disabled={exporting !== ""}
            >
              <Download className="mr-2 h-4 w-4" />
              {exporting === "csv" ? "Exporting..." : "Export CSV"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void handleExport("xlsx")}
              disabled={exporting !== ""}
            >
              <Download className="mr-2 h-4 w-4" />
              {exporting === "xlsx" ? "Exporting..." : "Export Excel"}
            </Button>
          </div>
        </div>
        {payload ? (
          <div className="mt-3">
            <DrillDownFilterChips filters={payload.filters} />
            <p className="mt-2 text-xs text-slate-500">
              Headers follow kiosk semantics: Budget (Plan), Forecast (Latest), YTD Revenue$, and Variance (Actuals - Budget).
            </p>
          </div>
        ) : null}
      </div>

      {detailsQuery.isLoading ? (
        <div className="rounded-[16px] border border-slate-200 bg-white px-5 py-8">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
            <LoaderCircle className="h-5 w-5 animate-spin" />
            Loading details...
          </div>
        </div>
      ) : error ? (
        <div className="rounded-[16px] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
          {error}
        </div>
      ) : payload ? (
        <>
          <div className="rounded-[16px] border border-slate-200 bg-white px-5 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                  className="pl-9"
                  placeholder="Search underlying records"
                />
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button type="button" variant="secondary">
                    <SlidersHorizontal className="mr-2 h-4 w-4" />
                    Columns
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72" align="start">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Visible Columns
                  </p>
                  <div className="max-h-64 space-y-1 overflow-auto">
                    {(payload.columns ?? []).map((column) => {
                      const checked =
                        !selectedColumnKeys || selectedColumnKeys.includes(column.key);
                      return (
                        <label key={column.key} className="flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => {
                              const allKeys = payload.columns.map((entry) => entry.key);
                              const next = new Set(selectedColumnKeys ?? allKeys);
                              if (event.target.checked) {
                                next.add(column.key);
                              } else {
                                next.delete(column.key);
                              }
                              setSelectedColumnKeys(allKeys.filter((key) => next.has(key)));
                            }}
                          />
                          {column.label}
                        </label>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
              <span className="ml-auto text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Page {payload.pagination.page}
              </span>
            </div>
          </div>

          <DrillDownTable
            columns={visibleColumns}
            rows={payload.rows}
            sortBy={sortBy}
            sortDir={sortDir}
            onSort={(columnKey) => {
              setPage(1);
              if (sortBy === columnKey) {
                setSortDir((current) => (current === "asc" ? "desc" : "asc"));
                return;
              }
              setSortBy(columnKey);
              setSortDir("desc");
            }}
          />

          <div className="flex items-center justify-between rounded-[16px] border border-slate-200 bg-white px-5 py-3">
            <div className="text-sm text-slate-600">
              {payload.pagination.total_rows.toLocaleString()} total rows
            </div>
            <div className="flex items-center gap-2">
              <select
                className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                value={String(pageSize)}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
              >
                {[50, 100, 250, 500, 1000].map((size) => (
                  <option key={size} value={size}>
                    {size} / page
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setPage((current) => Math.max(current - 1, 1))}
                disabled={page <= 1}
              >
                Prev
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setPage((current) => current + 1)}
                disabled={!hasNextPage}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
