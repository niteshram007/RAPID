"use client";

import { useMemo, useState } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { TableFullscreenShell } from "@/components/table-fullscreen-shell";
import type {
  MasterdataReconciliationResult,
  ReconciliationRow,
} from "@/lib/masterdata-reconciliation";

type MasterdataReconciliationMonitorProps = {
  financialYears: string[];
  initialFinancialYear: string;
};

type SectionKey =
  | "groupedByOcn"
  | "groupedByEmpId"
  | "budgetNotInActuals"
  | "actualsNotInBudget";
type NameMatchFilter = "all" | "same" | "different";

const SECTION_DEFINITIONS: Array<{
  key: SectionKey;
  title: string;
  description: string;
}> = [
  {
    key: "groupedByOcn",
    title: "MS Customer Mapping by OCN",
    description: "Actual is the base. OCN maps the MS actual customer/project to the Budget customer name.",
  },
  {
    key: "groupedByEmpId",
    title: "PS Customer Mapping by Emp ID",
    description: "Actual is the base. Emp ID maps the PS actual resource/customer to the Budget customer name.",
  },
  {
    key: "budgetNotInActuals",
    title: "Budget Not in Actuals",
    description: "Customers and projects present in budget but not present in actuals.",
  },
  {
    key: "actualsNotInBudget",
    title: "Actuals Not in Budget",
    description: "Customers and projects present in actuals but not present in budget.",
  },
];

function formatNumber(value: number) {
  return value.toLocaleString("en-US");
}

function DataGrid({
  title,
  description,
  rows,
  emptyMessage,
  nameMatchFilter = "all",
  onNameMatchFilterChange,
}: {
  title: string;
  description: string;
  rows: ReconciliationRow[];
  emptyMessage: string;
  nameMatchFilter?: NameMatchFilter;
  onNameMatchFilterChange?: (next: NameMatchFilter) => void;
}) {
  const filteredRows = useMemo(() => {
    if (!onNameMatchFilterChange || nameMatchFilter === "all") {
      return rows;
    }
    const expected = nameMatchFilter === "same" ? "same" : "different";
    return rows.filter((row) =>
      String(row["Customer Name Match"] ?? "")
        .trim()
        .toLowerCase() === expected,
    );
  }, [nameMatchFilter, onNameMatchFilterChange, rows]);
  const headers = useMemo(() => {
    const first = filteredRows[0];
    return first ? Object.keys(first) : [];
  }, [filteredRows]);

  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-950">{title}</h3>
          <p className="mt-1 text-xs text-slate-600">{description}</p>
        </div>
        {onNameMatchFilterChange ? (
          <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1">
            {([
              { key: "all", label: "All" },
              { key: "same", label: "Same Customer" },
              { key: "different", label: "Different Customer" },
            ] as const).map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => onNameMatchFilterChange(option.key)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  nameMatchFilter === option.key
                    ? "bg-slate-950 text-white"
                    : "text-slate-600 hover:bg-white"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {filteredRows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-600">
          {emptyMessage}
        </div>
      ) : (
        <TableFullscreenShell
          title={title}
          description={description}
          className="rounded-2xl border border-slate-200 bg-white"
        >
          <div className="max-h-[560px] overflow-auto rounded-2xl border border-slate-200">
            <table className="min-w-[1400px] text-left text-xs text-slate-700">
              <thead className="sticky top-0 z-10 bg-slate-950 text-white">
                <tr>
                  {headers.map((header) => (
                    <th
                      key={header}
                      className="border-b border-white/10 px-3 py-2.5 font-semibold uppercase tracking-[0.11em]"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, index) => (
                  <tr
                    key={`row-${index}`}
                    className={`border-b border-slate-100 ${
                      index % 2 === 0 ? "bg-white" : "bg-slate-50/80"
                    }`}
                  >
                    {headers.map((header) => {
                      const value = row[header];
                      return (
                        <td key={`${index}-${header}`} className="px-3 py-2.5 align-top">
                          {typeof value === "number"
                            ? value.toLocaleString("en-US")
                            : String(value ?? "")}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TableFullscreenShell>
      )}
    </section>
  );
}

export function MasterdataReconciliationMonitor({
  financialYears,
  initialFinancialYear,
}: MasterdataReconciliationMonitorProps) {
  const [financialYear, setFinancialYear] = useState(initialFinancialYear);
  const [nameMatchFilterBySection, setNameMatchFilterBySection] = useState<
    Record<"groupedByOcn" | "groupedByEmpId", NameMatchFilter>
  >({
    groupedByOcn: "different",
    groupedByEmpId: "different",
  });

  const query = useQuery({
    queryKey: ["masterdata-reconciliation-monitor", financialYear],
    queryFn: async () => {
      const search = new URLSearchParams({ financialYear });
      const response = await fetch(
        `/api/masterdata/reconciliation?${search.toString()}`,
        {
          cache: "no-store",
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | MasterdataReconciliationResult
        | { detail?: string }
        | null;
      if (!response.ok || !payload || !("tables" in payload)) {
        throw new Error(
          payload && "detail" in payload
            ? payload.detail
            : "Unable to load reconciliation monitor.",
        );
      }
      return payload;
    },
    refetchOnWindowFocus: false,
  });

  const counts = useMemo(() => {
    const tables = query.data?.tables;
    if (!tables) {
      return {
        groupedByOcn: 0,
        groupedByEmpId: 0,
        budgetNotInActuals: 0,
        actualsNotInBudget: 0,
      };
    }
    return {
      groupedByOcn: tables.groupedByOcn.length,
      groupedByEmpId: tables.groupedByEmpId.length,
      budgetNotInActuals: tables.budgetNotInActuals.length,
      actualsNotInBudget: tables.actualsNotInBudget.length,
    };
  }, [query.data]);

  return (
    <section className="space-y-5">
      <div className="surface-card px-6 py-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.17em] text-slate-500">
            Merged Masterdata Quality
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-slate-950">
              Actual-base Budget customer mapping
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Use OCN for MS and Emp ID for PS, then compare the mapped actual customer/project to the Budget customer name.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Financial Year
              <select
                value={financialYear}
                onChange={(event) => setFinancialYear(event.target.value)}
                className="auth-input min-w-[160px]"
              >
                {financialYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="inline-flex h-11 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-xs font-semibold uppercase tracking-[0.12em] text-slate-700"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {query.isLoading ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-sm text-slate-600">
          <span className="inline-flex items-center gap-2">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Building reconciliation output...
          </span>
        </div>
      ) : query.isError || !query.data ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-8 text-sm text-rose-700">
          Unable to build reconciliation output. Check active budget/global uploads for this
          year.
        </div>
      ) : (
        <>
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                OCN Groups
              </p>
              <p className="mt-1 text-xl font-semibold text-slate-950">
                {formatNumber(counts.groupedByOcn)}
              </p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Emp ID Groups
              </p>
              <p className="mt-1 text-xl font-semibold text-slate-950">
                {formatNumber(counts.groupedByEmpId)}
              </p>
            </article>
            <article className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-800">
                Budget Not in Actuals
              </p>
              <p className="mt-1 text-xl font-semibold text-amber-900">
                {formatNumber(counts.budgetNotInActuals)}
              </p>
            </article>
            <article className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-rose-800">
                Actuals Not in Budget
              </p>
              <p className="mt-1 text-xl font-semibold text-rose-900">
                {formatNumber(counts.actualsNotInBudget)}
              </p>
            </article>
          </section>

          {SECTION_DEFINITIONS.map((section) => (
            <DataGrid
              key={section.key}
              title={section.title}
              description={section.description}
              rows={query.data.tables[section.key] ?? []}
              emptyMessage={`No rows found for ${section.title} in ${financialYear}.`}
              nameMatchFilter={
                section.key === "groupedByOcn" || section.key === "groupedByEmpId"
                  ? nameMatchFilterBySection[section.key]
                  : "all"
              }
              onNameMatchFilterChange={
                section.key === "groupedByOcn" || section.key === "groupedByEmpId"
                  ? (next) =>
                      setNameMatchFilterBySection((current) => ({
                        ...current,
                        [section.key]: next,
                      }))
                  : undefined
              }
            />
          ))}
        </>
      )}
    </section>
  );
}
