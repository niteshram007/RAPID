"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";

import { TableFullscreenShell } from "@/components/table-fullscreen-shell";
import { useDrillDown } from "@/hooks/useDrillDown";
import { formatCurrency } from "@/lib/format";
import type { RapidRevenueRow } from "@/lib/rapid-revenue";

type CellMap = Record<string, number>;
type Matrix = Record<string, CellMap>;

function toAmount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function ExecutiveDynamicsPivot() {
  const searchParams = useSearchParams();
  const searchString = searchParams.toString();
  const { openDrillDown } = useDrillDown();

  const dataQuery = useQuery({
    queryKey: ["executive-dynamics-pivot", searchString],
    queryFn: async () => {
      const response = await fetch(`/api/revenue${searchString ? `?${searchString}` : ""}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("Unable to load dynamics pivot data.");
      }
      return (await response.json()) as RapidRevenueRow[];
    },
  });

  const pivot = useMemo(() => {
    const rows = dataQuery.data ?? [];
    const colSet = new Set<string>();
    const matrix: Matrix = {};
    for (const row of rows) {
      const msps = String(row["MS/PS"] ?? "").trim().toUpperCase() || "N/A";
      const region = String(row["ROW/US"] ?? "").trim().toUpperCase() || "N/A";
      const fy = toAmount(row.FY);
      colSet.add(region);
      matrix[msps] = matrix[msps] ?? {};
      matrix[msps][region] = (matrix[msps][region] ?? 0) + fy;
    }
    const columns = Array.from(colSet).sort((a, b) => a.localeCompare(b));
    const rowKeys = Object.keys(matrix).sort((a, b) => a.localeCompare(b));
    return { columns, rowKeys, matrix };
  }, [dataQuery.data]);

  const totals = useMemo(() => {
    const colTotals: Record<string, number> = {};
    let grand = 0;
    for (const rowKey of pivot.rowKeys) {
      for (const column of pivot.columns) {
        const value = pivot.matrix[rowKey]?.[column] ?? 0;
        colTotals[column] = (colTotals[column] ?? 0) + value;
        grand += value;
      }
    }
    return { colTotals, grand };
  }, [pivot]);

  const globalFilters = useMemo(() => {
    const filters: Record<string, unknown> = {};
    const mapping: Record<string, string> = {
      practiceHeads: "practice_head",
      bdms: "bdm",
      geoHeads: "geo_head",
      verticals: "vertical",
      entities: "entity",
      customerNames: "customer_name",
      projectNames: "project_name",
    };
    for (const [queryKey, filterKey] of Object.entries(mapping)) {
      const values = searchParams.getAll(queryKey).map((value) => value.trim()).filter(Boolean);
      if (values.length === 1) {
        filters[filterKey] = values[0];
      } else if (values.length > 1) {
        filters[filterKey] = values;
      }
    }
    return filters;
  }, [searchParams]);

  function openCellDrillDown(options: { msps: string; rowUs?: string; value: number }) {
    openDrillDown({
      source: "budget",
      metric: "budget",
      value: options.value,
      fiscalYear: searchParams.get("financialYear") ?? undefined,
      filters: {
        ...globalFilters,
        ms_ps: options.msps,
        ...(options.rowUs ? { row_us: options.rowUs } : {}),
      },
      aggregation: {
        type: "sum",
        field: "budget",
      },
      displayTitle: options.rowUs
        ? `Underlying Records - ${options.msps} / ${options.rowUs} / Budget`
        : `Underlying Records - ${options.msps} / Budget`,
    });
  }

  return (
    <section className="surface-card px-6 py-6 lg:px-8">
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Dynamics Pivot</p>
        <h2 className="mt-1 text-2xl font-semibold text-slate-950">FY by MS/PS and ROW/US</h2>
      </div>
      {dataQuery.isLoading ? (
        <p className="text-sm text-slate-500">Loading pivot...</p>
      ) : (
        <TableFullscreenShell
          title="Dynamics pivot"
          description="Open the pivot in a full-page table view."
          className="rounded-[16px] border border-slate-200"
        >
          <table className="min-w-[680px] border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-sky-100 text-slate-900">
              <tr>
                <th className="border border-sky-200 px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.12em]">
                  MS/PS
                </th>
                {pivot.columns.map((column) => (
                  <th
                    key={column}
                    className="border border-sky-200 px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.12em]"
                  >
                    {column}
                  </th>
                ))}
                <th className="border border-sky-200 px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.12em]">
                  Grand Total
                </th>
              </tr>
            </thead>
            <tbody>
              {pivot.rowKeys.map((rowKey) => {
                const rowTotal = pivot.columns.reduce(
                  (sum, column) => sum + (pivot.matrix[rowKey]?.[column] ?? 0),
                  0,
                );
                return (
                  <tr key={rowKey}>
                    <td className="border border-sky-100 px-3 py-2 font-semibold text-slate-900">{rowKey}</td>
                    {pivot.columns.map((column) => (
                      <td
                        key={`${rowKey}-${column}`}
                        className="cursor-pointer border border-sky-100 px-3 py-2 text-right underline decoration-dotted"
                        onClick={() =>
                          openCellDrillDown({
                            msps: rowKey,
                            rowUs: column,
                            value: pivot.matrix[rowKey]?.[column] ?? 0,
                          })
                        }
                      >
                        {formatCurrency(pivot.matrix[rowKey]?.[column] ?? 0)}
                      </td>
                    ))}
                    <td
                      className="cursor-pointer border border-sky-100 px-3 py-2 text-right font-semibold underline decoration-dotted"
                      onClick={() =>
                        openCellDrillDown({
                          msps: rowKey,
                          value: rowTotal,
                        })
                      }
                    >
                      {formatCurrency(rowTotal)}
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-sky-50 font-semibold">
                <td className="border border-sky-200 px-3 py-2">Grand Total</td>
                {pivot.columns.map((column) => (
                  <td key={`total-${column}`} className="border border-sky-200 px-3 py-2 text-right">
                    {formatCurrency(totals.colTotals[column] ?? 0)}
                  </td>
                ))}
                <td className="border border-sky-200 px-3 py-2 text-right">{formatCurrency(totals.grand)}</td>
              </tr>
            </tbody>
          </table>
        </TableFullscreenShell>
      )}
    </section>
  );
}
