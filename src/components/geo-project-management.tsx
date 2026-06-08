"use client";

import { useMemo, useState } from "react";
import { LoaderCircle, Save, Search } from "lucide-react";

import { TableFullscreenShell } from "@/components/table-fullscreen-shell";
import type { ForecastSheetResponse } from "@/lib/rapid-revenue";

type GeoProjectManagementProps = {
  initial: ForecastSheetResponse;
};

export function GeoProjectManagement({ initial }: GeoProjectManagementProps) {
  const [rows, setRows] = useState(initial.rows);
  const [query, setQuery] = useState("");
  const [savingRecordId, setSavingRecordId] = useState<number | null>(null);
  const [status, setStatus] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  const bdmOptions = useMemo(() => {
    const options = new Set<string>(initial.bdmOptions);
    rows.forEach((row) => {
      const bdm = String(row.BDM ?? "").trim();
      if (bdm) options.add(bdm);
    });
    return Array.from(options).sort((a, b) => a.localeCompare(b));
  }, [initial.bdmOptions, rows]);

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      [
        row["Customer Name"],
        row["Project Name"],
        row["Practice Head"],
        row["Geo Head"],
        row.BDM,
        row["MS/PS"],
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [query, rows]);

  async function saveAssignment(recordId: number, bdm: string) {
    setSavingRecordId(recordId);
    setStatus(null);
    try {
      const response = await fetch("/api/revenue/project-assignment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordId, bdm }),
      });
      const body = (await response.json().catch(() => null)) as { detail?: string } | null;
      if (!response.ok) {
        throw new Error(body?.detail ?? "Unable to update assignment.");
      }
      setStatus({ tone: "success", message: `Project ${recordId} assigned to ${bdm}.` });
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to update assignment.",
      });
    } finally {
      setSavingRecordId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="surface-card px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Project Management</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-950">Reassign BDM by project</h2>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search project/customer"
              className="h-10 w-64 rounded-full border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none"
            />
          </div>
        </div>
      </div>

      {status ? (
        <div
          className={`rounded-[16px] border px-4 py-3 text-sm ${
            status.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {status.message}
        </div>
      ) : null}

      <TableFullscreenShell
        title="Project management"
        description="Open the geo project assignment table in a full-page view."
        className="rounded-[18px] border border-slate-200 bg-white"
      >
        <table className="min-w-[1200px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-slate-950 text-white">
            <tr>
              {["Customer Name", "Project Name", "MS/PS", "Practice Head", "Geo Head", "Current BDM", "Assign BDM"].map(
                (header) => (
                  <th key={header} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.14em]">
                    {header}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row, rowIndex) => {
              const recordId = Number(row.recordId);
              const currentBdm = String(row.BDM ?? "");
              return (
                <tr
                  key={recordId}
                  className={`border-b border-slate-100 ${rowIndex % 2 === 0 ? "bg-white" : "bg-[#f6f7f8]"}`}
                >
                  <td className="px-3 py-2">{row["Customer Name"]}</td>
                  <td className="px-3 py-2">{row["Project Name"]}</td>
                  <td className="px-3 py-2">{row["MS/PS"]}</td>
                  <td className="px-3 py-2">{row["Practice Head"]}</td>
                  <td className="px-3 py-2">{row["Geo Head"]}</td>
                  <td className="px-3 py-2">{currentBdm}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <select
                        defaultValue={currentBdm}
                        onChange={(event) => {
                          const next = event.target.value;
                          setRows((current) =>
                            current.map((entry) =>
                              Number(entry.recordId) === recordId ? { ...entry, BDM: next } : entry,
                            ),
                          );
                        }}
                        className="h-9 min-w-40 rounded-xl border border-slate-200 bg-slate-50 px-2 text-sm text-slate-700"
                      >
                        {bdmOptions.map((option) => (
                          <option key={`${recordId}-${option}`} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => saveAssignment(recordId, String(rows.find((entry) => Number(entry.recordId) === recordId)?.BDM ?? currentBdm))}
                        disabled={savingRecordId === recordId}
                        className="inline-flex h-9 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-700"
                      >
                        {savingRecordId === recordId ? (
                          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Save className="h-3.5 w-3.5" />
                        )}
                        Save
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableFullscreenShell>
    </div>
  );
}
