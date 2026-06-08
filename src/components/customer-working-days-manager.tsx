"use client";

import { useMemo, useState } from "react";
import { LoaderCircle, Save } from "lucide-react";

import { TableFullscreenShell } from "@/components/table-fullscreen-shell";
import type { CustomerWorkingDaysPayload, CustomerWorkingDaysRow } from "@/lib/backend-api";

type CustomerWorkingDaysManagerProps = {
  initialPayload: CustomerWorkingDaysPayload;
  editable?: boolean;
  savePath?: string;
  title?: string;
};

function normalizeRows(rows: CustomerWorkingDaysRow[], months: string[]) {
  return rows.map((row) => ({
    customerName: row.customerName ?? "",
    bdm: row.bdm ?? "",
    practiceHead: row.practiceHead ?? "",
    geoHead: row.geoHead ?? "",
    workingDays: months.reduce<Record<string, number>>((accumulator, month) => {
      accumulator[month] = Number(row.workingDays?.[month] ?? 22);
      return accumulator;
    }, {}),
    updatedBy: row.updatedBy ?? "",
    updatedAt: row.updatedAt ?? null,
  }));
}

export function CustomerWorkingDaysManager({
  initialPayload,
  editable = false,
  savePath = "/api/admin/customer-working-days",
  title = "Customer working days",
}: CustomerWorkingDaysManagerProps) {
  const months = initialPayload.months ?? [];
  const [rows, setRows] = useState(() => normalizeRows(initialPayload.rows, months));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState("ALL");
  const [selectedBdm, setSelectedBdm] = useState("ALL");
  const [selectedPractice, setSelectedPractice] = useState("ALL");

  const filterOptions = useMemo(() => {
    const customers = new Set<string>(initialPayload.filters.customers ?? []);
    const bdms = new Set<string>(initialPayload.filters.bdms ?? []);
    const practiceHeads = new Set<string>(initialPayload.filters.practiceHeads ?? []);
    for (const row of rows) {
      if (row.customerName.trim()) {
        customers.add(row.customerName.trim());
      }
      if (row.bdm.trim()) {
        bdms.add(row.bdm.trim());
      }
      if (row.practiceHead.trim()) {
        practiceHeads.add(row.practiceHead.trim());
      }
    }
    return {
      customers: ["ALL", ...Array.from(customers).sort((a, b) => a.localeCompare(b))],
      bdms: ["ALL", ...Array.from(bdms).sort((a, b) => a.localeCompare(b))],
      practiceHeads: ["ALL", ...Array.from(practiceHeads).sort((a, b) => a.localeCompare(b))],
    };
  }, [initialPayload.filters.bdms, initialPayload.filters.customers, initialPayload.filters.practiceHeads, rows]);

  const visibleRows = useMemo(() => {
    return rows
      .map((row, rowIndex) => ({ row, rowIndex }))
      .filter(({ row }) => {
        if (selectedCustomer !== "ALL" && row.customerName !== selectedCustomer) {
          return false;
        }
        if (selectedBdm !== "ALL" && row.bdm !== selectedBdm) {
          return false;
        }
        if (selectedPractice !== "ALL" && row.practiceHead !== selectedPractice) {
          return false;
        }
        return true;
      });
  }, [rows, selectedBdm, selectedCustomer, selectedPractice]);

  function updateWorkingDay(rowIndex: number, month: string, rawValue: string) {
    const numeric = Math.max(0, Math.min(31, Number(rawValue || 0)));
    setRows((current) =>
      current.map((row, index) =>
        index === rowIndex
          ? {
              ...row,
              workingDays: {
                ...row.workingDays,
                [month]: Number.isFinite(numeric) ? numeric : 0,
              },
            }
          : row,
      ),
    );
  }

  async function saveRows() {
    setSaving(true);
    setStatus(null);
    try {
      const response = await fetch(savePath, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rows,
          updatedBy: editable ? "workspace-working-days-ui" : "readonly",
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | CustomerWorkingDaysPayload
        | { detail?: string }
        | null;
      if (!response.ok) {
        throw new Error((body as { detail?: string } | null)?.detail ?? "Unable to save customer working days.");
      }
      const nextPayload = body as CustomerWorkingDaysPayload;
      setRows(normalizeRows(nextPayload.rows, nextPayload.months ?? months));
      setStatus({ tone: "success", text: "Customer working days saved successfully." });
    } catch (error) {
      setStatus({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to save customer working days.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="surface-card px-6 py-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Working Days
          </p>
          <h3 className="mt-1 text-2xl font-semibold text-slate-950">{title}</h3>
        </div>
        {editable ? (
          <button
            type="button"
            onClick={saveRows}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white disabled:bg-slate-400"
          >
            {saving ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </button>
        ) : null}
      </div>

      {status ? (
        <div
          className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
            status.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {status.text}
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          Customer
          <select className="auth-input" value={selectedCustomer} onChange={(event) => setSelectedCustomer(event.target.value)}>
            {filterOptions.customers.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          BDM
          <select className="auth-input" value={selectedBdm} onChange={(event) => setSelectedBdm(event.target.value)}>
            {filterOptions.bdms.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          Practice Head
          <select className="auth-input" value={selectedPractice} onChange={(event) => setSelectedPractice(event.target.value)}>
            {filterOptions.practiceHeads.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>

      <TableFullscreenShell
        title="Customer working days"
        description="Open the customer-based monthly working-day table in a full-page view."
        className="mt-5 rounded-2xl border border-slate-200 bg-white"
      >
        <table className="min-w-[1600px] text-left text-sm text-slate-700">
          <thead className="sticky top-0 z-20 bg-slate-950 text-white">
            <tr>
              <th className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.14em]">Customer Name</th>
              <th className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.14em]">BDM</th>
              <th className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.14em]">Practice Head</th>
              <th className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.14em]">Geo Head</th>
              {months.map((month) => (
                <th key={month} className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.14em]">
                  {month}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={4 + months.length} className="px-4 py-8 text-center text-sm text-slate-500">
                  No customer rows found for this filter.
                </td>
              </tr>
            ) : (
              visibleRows.map(({ row, rowIndex }, index) => (
                <tr
                  key={`${row.customerName}-${row.bdm}-${row.practiceHead}-${row.geoHead}-${rowIndex}`}
                  className={`border-t border-slate-100 ${index % 2 === 0 ? "bg-white" : "bg-[#f6f7f8]"}`}
                >
                  <td className="px-3 py-2.5 font-medium text-slate-950">{row.customerName}</td>
                  <td className="px-3 py-2.5">{row.bdm || "-"}</td>
                  <td className="px-3 py-2.5">{row.practiceHead || "-"}</td>
                  <td className="px-3 py-2.5">{row.geoHead || "-"}</td>
                  {months.map((month) => (
                    <td key={`${row.customerName}-${month}`} className="px-3 py-2.5">
                      {editable ? (
                        <input
                          type="number"
                          min={0}
                          max={31}
                          value={row.workingDays[month] ?? 0}
                          onChange={(event) => updateWorkingDay(rowIndex, month, event.target.value)}
                          className="w-20 rounded-xl border border-slate-200 px-2 py-1.5 text-sm outline-none"
                        />
                      ) : (
                        <span>{row.workingDays[month] ?? 0}</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </TableFullscreenShell>
    </article>
  );
}
