"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Download, ExternalLink, Filter, LoaderCircle, Search, SlidersHorizontal, X } from "lucide-react";

import { DrillDownFilterChips } from "@/components/drilldown/DrillDownFilterChips";
import { DrillDownTable } from "@/components/drilldown/DrillDownTable";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DrillDownContext,
  DrillDownDetailsResponse,
  exportDrillDownDetails,
  fetchDrillDownDetails,
} from "@/lib/drilldown";

type DrillDownDrawerProps = {
  open: boolean;
  context: DrillDownContext | null;
  onClose: () => void;
};

export function DrillDownDrawer({ open, context, onClose }: DrillDownDrawerProps) {
  const [payload, setPayload] = useState<DrillDownDetailsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [sortBy, setSortBy] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedColumnKeys, setSelectedColumnKeys] = useState<string[] | null>(null);
  const [exporting, setExporting] = useState<"" | "csv" | "xlsx">("");
  const deferredSearch = useDeferredValue(search.trim());

  useEffect(() => {
    if (!open) {
      return;
    }
    setSearch("");
    setPage(1);
    setPageSize(100);
    setSortBy("");
    setSortDir("desc");
    setSelectedColumnKeys(null);
    setPayload(null);
    setError(null);
  }, [open, context]);

  const requestContext = useMemo(() => {
    if (!context) {
      return null;
    }
    return {
      ...context,
      page,
      pageSize,
      sortBy: sortBy || undefined,
      sortDir,
      search: deferredSearch || undefined,
      columns: selectedColumnKeys ?? context.columns,
    } satisfies DrillDownContext;
  }, [context, deferredSearch, page, pageSize, selectedColumnKeys, sortBy, sortDir]);

  useEffect(() => {
    if (!open || !requestContext) {
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    void fetchDrillDownDetails(requestContext)
      .then((response) => {
        if (!active) {
          return;
        }
        setPayload(response);
        if (!sortBy && response.columns.length > 0) {
          setSortBy(response.columns[0].key);
        }
      })
      .catch((loadError) => {
        if (!active) {
          return;
        }
        setPayload(null);
        setError(loadError instanceof Error ? loadError.message : "Unable to load details.");
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [open, requestContext, sortBy]);

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
    if (!context) {
      return;
    }
    const exportContext: DrillDownContext = {
      ...context,
      page: 1,
      pageSize: 1000,
      sortBy: sortBy || undefined,
      sortDir,
      search: deferredSearch || undefined,
      columns: selectedColumnKeys ?? context.columns,
    };
    setExporting(format);
    try {
      const { blob, filename } = await exportDrillDownDetails(exportContext, format);
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

  function openFullPage() {
    if (!context) {
      return;
    }
    const currentPath = window.location.pathname || "";
    const workspacePath = currentPath.startsWith("/executive")
      ? "/executive/drilldown"
      : currentPath.startsWith("/bdm")
        ? "/bdm/drilldown"
        : currentPath.startsWith("/geo-head")
          ? "/geo-head/drilldown"
          : currentPath.startsWith("/practice-head")
            ? "/practice-head/drilldown"
            : currentPath.startsWith("/buh")
              ? "/buh/drilldown"
              : "/drilldown";
    const serialized = encodeURIComponent(
      JSON.stringify({
        ...context,
        columns: selectedColumnKeys ?? context.columns,
        sortBy: sortBy || undefined,
        sortDir,
        search: deferredSearch || undefined,
      }),
    );
    window.open(`${workspacePath}?context=${serialized}`, "_blank", "noopener,noreferrer");
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : null)}>
      <DialogContent className="left-auto right-0 top-0 h-screen w-[min(96vw,1120px)] -translate-x-0 -translate-y-0 rounded-none border-l border-slate-200 bg-white p-0">
        <div className="flex h-full flex-col">
          <DialogHeader className="border-b border-slate-200 px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <DialogTitle className="text-xl text-slate-950">
                  {payload?.title ?? context?.displayTitle ?? "Drill Down"}
                </DialogTitle>
                <DialogDescription>Underlying records for the selected scope.</DialogDescription>
              </div>
              <Button type="button" variant="secondary" onClick={onClose}>
                <X className="mr-2 h-4 w-4" />
                Close
              </Button>
            </div>
            {payload ? (
              <div className="space-y-2">
                <DrillDownFilterChips filters={payload.filters} />
                <p className="text-xs text-slate-500">
                  Headers follow kiosk semantics: Budget (Plan), Forecast (Latest), YTD Revenue$, and Variance (Actuals - Budget).
                </p>
              </div>
            ) : null}
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-5 py-3">
            <div className="relative w-full max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                className="pl-9"
                placeholder="Search in detail rows"
              />
            </div>

            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" variant="secondary">
                  <SlidersHorizontal className="mr-2 h-4 w-4" />
                  Selection
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72" align="start">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Show Columns
                </p>
                <div className="max-h-64 space-y-1 overflow-auto">
                  {(payload?.columns ?? []).map((column) => {
                    const checked =
                      !selectedColumnKeys || selectedColumnKeys.includes(column.key);
                    return (
                      <label key={column.key} className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            if (!payload) {
                              return;
                            }
                            const allKeys = payload.columns.map((entry) => entry.key);
                            const next = new Set(selectedColumnKeys ?? allKeys);
                            if (event.target.checked) {
                              next.add(column.key);
                            } else {
                              next.delete(column.key);
                            }
                            const nextKeys = allKeys.filter((key) => next.has(key));
                            setSelectedColumnKeys(nextKeys);
                            setPage(1);
                          }}
                        />
                        {column.label}
                      </label>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>

            <Button
              type="button"
              variant="secondary"
              onClick={() => void handleExport("csv")}
              disabled={exporting !== "" || !payload}
            >
              <Download className="mr-2 h-4 w-4" />
              {exporting === "csv" ? "Exporting..." : "Export CSV"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void handleExport("xlsx")}
              disabled={exporting !== "" || !payload}
            >
              <Download className="mr-2 h-4 w-4" />
              {exporting === "xlsx" ? "Exporting..." : "Export Excel"}
            </Button>
            <Button type="button" variant="secondary" onClick={openFullPage} disabled={!context}>
              <ExternalLink className="mr-2 h-4 w-4" />
              Open in Full Page
            </Button>
            <span className="ml-auto text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              <Filter className="mr-1 inline h-3.5 w-3.5" />
              Page {payload?.pagination.page ?? page}
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-5">
            {loading ? (
              <div className="flex h-44 items-center justify-center gap-2 text-sm font-semibold text-slate-600">
                <LoaderCircle className="h-5 w-5 animate-spin" />
                Loading underlying records...
              </div>
            ) : error ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                {error}
              </div>
            ) : payload ? (
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
            ) : null}
          </div>

          <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3">
            <div className="text-sm text-slate-600">
              {(payload?.pagination.total_rows ?? 0).toLocaleString()} total rows
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
              <Button type="button" variant="secondary" onClick={() => setPage((current) => Math.max(current - 1, 1))} disabled={page <= 1}>
                Prev
              </Button>
              <Button type="button" variant="secondary" onClick={() => setPage((current) => current + 1)} disabled={!hasNextPage}>
                Next
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
