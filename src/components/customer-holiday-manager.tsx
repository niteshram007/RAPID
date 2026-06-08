"use client";

import { useMemo, useState } from "react";
import { LoaderCircle, Plus, Save, Trash2 } from "lucide-react";

import { TableFullscreenShell } from "@/components/table-fullscreen-shell";
import type { CustomerHolidayPayload, CustomerHolidayRow } from "@/lib/backend-api";

type CustomerHolidayManagerProps = {
  initialPayload: CustomerHolidayPayload;
  editable?: boolean;
  title?: string;
};

function normalizeRows(rows: CustomerHolidayRow[]) {
  return rows.map((row) => ({
    id: row.id ?? "",
    customerName: row.customerName ?? "",
    holidayDate: row.holidayDate ?? "",
    holidayName: row.holidayName ?? "",
    projectName: row.projectName ?? "",
    bdm: row.bdm ?? "",
    practiceHead: row.practiceHead ?? "",
    geoHead: row.geoHead ?? "",
    updatedBy: row.updatedBy ?? "",
    updatedAt: row.updatedAt ?? null,
  }));
}

function toDateInputValue(value: string) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const day = String(parsed.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value: string) {
  const input = toDateInputValue(value);
  if (!input) {
    return "";
  }
  const [year, month, day] = input.split("-");
  return `${month}/${day}/${year.slice(-2)}`;
}

export function CustomerHolidayManager({
  initialPayload,
  editable = false,
  title = "Customer holiday calendar",
}: CustomerHolidayManagerProps) {
  const [rows, setRows] = useState<CustomerHolidayRow[]>(normalizeRows(initialPayload.rows));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [selectedBdm, setSelectedBdm] = useState("ALL");
  const [selectedPractice, setSelectedPractice] = useState("ALL");
  const [selectedCustomer, setSelectedCustomer] = useState("ALL");

  const filterOptions = useMemo(() => {
    const customers = new Set<string>(initialPayload.filters.customers ?? []);
    const bdms = new Set<string>(initialPayload.filters.bdms ?? []);
    const practiceHeads = new Set<string>(initialPayload.filters.practiceHeads ?? []);
    for (const row of rows) {
      if (row.customerName?.trim()) {
        customers.add(row.customerName.trim());
      }
      if (row.bdm?.trim()) {
        bdms.add(row.bdm.trim());
      }
      if (row.practiceHead?.trim()) {
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
      if (selectedBdm !== "ALL" && String(row.bdm || "").trim() !== selectedBdm) {
        return false;
      }
      if (selectedPractice !== "ALL" && String(row.practiceHead || "").trim() !== selectedPractice) {
        return false;
      }
      if (selectedCustomer !== "ALL" && String(row.customerName || "").trim() !== selectedCustomer) {
        return false;
      }
      return true;
    });
  }, [rows, selectedBdm, selectedCustomer, selectedPractice]);

  function updateRow(index: number, key: keyof CustomerHolidayRow, value: string) {
    setRows((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)),
    );
  }

  function addRow() {
    setRows((current) => [
      ...current,
      {
        customerName: "",
        holidayDate: "",
        holidayName: "",
        projectName: "",
        bdm: "",
        practiceHead: "",
        geoHead: "",
      },
    ]);
  }

  function removeRow(index: number) {
    setRows((current) => current.filter((_, rowIndex) => rowIndex !== index));
  }

  async function saveRows() {
    const payloadRows = rows
      .map((row) => ({
        customerName: String(row.customerName || "").trim(),
        holidayDate: toDateInputValue(String(row.holidayDate || "")),
        holidayName: String(row.holidayName || "").trim(),
        projectName: String(row.projectName || "").trim(),
        bdm: String(row.bdm || "").trim(),
        practiceHead: String(row.practiceHead || "").trim(),
        geoHead: String(row.geoHead || "").trim(),
      }))
      .filter((row) => row.customerName && row.holidayDate);

    if (payloadRows.length === 0) {
      setStatus({ tone: "error", text: "Add at least one valid holiday row before saving." });
      return;
    }

    setSaving(true);
    setStatus(null);
    try {
      const response = await fetch("/api/admin/customer-holidays", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rows: payloadRows,
          updatedBy: "admin-settings-ui",
        }),
      });
      const body = (await response.json().catch(() => null)) as { detail?: string } | null;
      if (!response.ok) {
        throw new Error(body?.detail ?? "Unable to save customer holidays.");
      }
      const nextPayload = body as CustomerHolidayPayload;
      setRows(normalizeRows(nextPayload.rows));
      setStatus({ tone: "success", text: "Customer holiday calendar saved successfully." });
    } catch (error) {
      setStatus({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to save customer holidays.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="surface-card px-6 py-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Holiday Calendar</p>
          <h3 className="mt-1 text-2xl font-semibold text-slate-950">{title}</h3>
        </div>
        {editable ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={addRow}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-700"
            >
              <Plus className="h-3.5 w-3.5" />
              Add row
            </button>
            <button
              type="button"
              onClick={saveRows}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white disabled:bg-slate-400"
            >
              {saving ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save
            </button>
          </div>
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
          <select
            className="auth-input"
            value={selectedCustomer}
            onChange={(event) => setSelectedCustomer(event.target.value)}
          >
            {filterOptions.customers.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          BDM
          <select
            className="auth-input"
            value={selectedBdm}
            onChange={(event) => setSelectedBdm(event.target.value)}
          >
            {filterOptions.bdms.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          Practice Head
          <select
            className="auth-input"
            value={selectedPractice}
            onChange={(event) => setSelectedPractice(event.target.value)}
          >
            {filterOptions.practiceHeads.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>

      <TableFullscreenShell
        title={title}
        description="Open the customer holiday calendar in a full-page table view."
        className="mt-5 rounded-2xl border border-slate-200 bg-white"
      >
        <table className="min-w-[1200px] text-left text-sm text-slate-700">
          <thead className="sticky top-0 z-10 bg-slate-950 text-white">
            <tr>
              <th className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.14em]">Customer Name</th>
              <th className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.14em]">Holiday Date</th>
              <th className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.14em]">Holiday Name</th>
              <th className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.14em]">Project Name</th>
              <th className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.14em]">BDM</th>
              <th className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.14em]">Practice Head</th>
              <th className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.14em]">Geo Head</th>
              {editable ? (
                <th className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.14em]">Action</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td
                  colSpan={editable ? 8 : 7}
                  className="px-4 py-8 text-center text-sm text-slate-500"
                >
                  No holiday rows found for this filter.
                </td>
              </tr>
            ) : (
              visibleRows.map(({ row, rowIndex }, index) => (
                <tr
                  key={`${row.id ?? "row"}-${rowIndex}`}
                  className={`border-t border-slate-100 ${index % 2 === 0 ? "bg-white" : "bg-[#f6f7f8]"}`}
                >
                  <td className="px-3 py-2.5">
                    {editable ? (
                      <input
                        value={row.customerName}
                        onChange={(event) => updateRow(rowIndex, "customerName", event.target.value)}
                        className="w-full min-w-[180px] rounded-xl border border-slate-200 px-2 py-1.5 text-sm outline-none"
                      />
                    ) : (
                      row.customerName
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {editable ? (
                      <input
                        type="date"
                        value={toDateInputValue(row.holidayDate)}
                        onChange={(event) => updateRow(rowIndex, "holidayDate", event.target.value)}
                        className="w-36 rounded-xl border border-slate-200 px-2 py-1.5 text-sm outline-none"
                      />
                    ) : (
                      formatDate(row.holidayDate)
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {editable ? (
                      <input
                        value={row.holidayName}
                        onChange={(event) => updateRow(rowIndex, "holidayName", event.target.value)}
                        className="w-full min-w-[140px] rounded-xl border border-slate-200 px-2 py-1.5 text-sm outline-none"
                      />
                    ) : (
                      row.holidayName
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {editable ? (
                      <input
                        value={row.projectName}
                        onChange={(event) => updateRow(rowIndex, "projectName", event.target.value)}
                        className="w-full min-w-[160px] rounded-xl border border-slate-200 px-2 py-1.5 text-sm outline-none"
                      />
                    ) : (
                      row.projectName
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {editable ? (
                      <input
                        value={row.bdm}
                        onChange={(event) => updateRow(rowIndex, "bdm", event.target.value)}
                        className="w-full min-w-[140px] rounded-xl border border-slate-200 px-2 py-1.5 text-sm outline-none"
                      />
                    ) : (
                      row.bdm
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {editable ? (
                      <input
                        value={row.practiceHead}
                        onChange={(event) => updateRow(rowIndex, "practiceHead", event.target.value)}
                        className="w-full min-w-[160px] rounded-xl border border-slate-200 px-2 py-1.5 text-sm outline-none"
                      />
                    ) : (
                      row.practiceHead
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {editable ? (
                      <input
                        value={row.geoHead}
                        onChange={(event) => updateRow(rowIndex, "geoHead", event.target.value)}
                        className="w-full min-w-[140px] rounded-xl border border-slate-200 px-2 py-1.5 text-sm outline-none"
                      />
                    ) : (
                      row.geoHead
                    )}
                  </td>
                  {editable ? (
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => removeRow(rowIndex)}
                        className="inline-flex items-center gap-1 rounded-full border border-rose-200 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-rose-700"
                      >
                        <Trash2 className="h-3 w-3" />
                        Remove
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </TableFullscreenShell>
    </article>
  );
}
