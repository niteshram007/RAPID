"use client";

import { Fragment, useMemo, useState } from "react";
import { LoaderCircle, Save } from "lucide-react";

import { TableFullscreenShell } from "@/components/table-fullscreen-shell";
import type { CountryWorkingDaysRow } from "@/lib/backend-api";

type HolidayManagerProps = {
  months: string[];
  initialRows: CountryWorkingDaysRow[];
  editable?: boolean;
  savePath?: string;
};

type EditableWorkingDaysRow = {
  country: string;
  workingDays: Record<string, number>;
  actualWorkingDays: Record<string, number>;
};

const USA_COMPANY = "USA";
const ROW_COMPANIES = ["GER", "IND", "MAL", "MME", "SIN", "UKG"] as const;
const ALL_COMPANIES = [USA_COMPANY, ...ROW_COMPANIES] as const;
type WorkingDayCompany = (typeof ALL_COMPANIES)[number];

function clampDayCount(value: unknown, fallback = 22) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(0, Math.min(31, Math.round(numeric)));
}

function normalizeMonthValues(
  months: string[],
  workingDays: Record<string, number> | undefined,
  fallback?: Record<string, number>,
) {
  const normalized: Record<string, number> = {};
  for (const month of months) {
    normalized[month] = clampDayCount(workingDays?.[month], fallback?.[month] ?? 22);
  }
  return normalized;
}

function normalizeCompanyCode(value: string) {
  const compact = String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (compact === "US" || compact === "USA" || compact === "UNITEDSTATES" || compact === "UNITEDSTATESOFAMERICA") {
    return USA_COMPANY;
  }
  if ((ROW_COMPANIES as readonly string[]).includes(compact)) {
    return compact;
  }
  return compact === "ROW" ? "ROW" : "";
}

function buildInitialRows(months: string[], initialRows: CountryWorkingDaysRow[]) {
  const rowsByCompany = new Map<string, CountryWorkingDaysRow>();
  for (const row of initialRows) {
    const company = normalizeCompanyCode(row.country);
    if (company) {
      rowsByCompany.set(company, row);
    }
  }

  const legacyRow = rowsByCompany.get("ROW");
  const legacyWorkingDays = normalizeMonthValues(months, legacyRow?.workingDays);
  const legacyActualWorkingDays = normalizeMonthValues(
    months,
    legacyRow?.actualWorkingDays,
    legacyWorkingDays,
  );

  const buildRow = (country: string): EditableWorkingDaysRow => {
    const source = rowsByCompany.get(country);
    const fallbackWorking = country === USA_COMPANY ? undefined : legacyWorkingDays;
    const fallbackActual = country === USA_COMPANY ? undefined : legacyActualWorkingDays;
    const workingDays = normalizeMonthValues(months, source?.workingDays, fallbackWorking);
    return {
      country,
      workingDays,
      actualWorkingDays:
        country === USA_COMPANY
          ? normalizeMonthValues(months, workingDays, workingDays)
          : normalizeMonthValues(months, source?.actualWorkingDays, fallbackActual ?? workingDays),
    };
  };

  return Object.fromEntries(ALL_COMPANIES.map((company) => [company, buildRow(company)])) as Record<
    (typeof ALL_COMPANIES)[number],
    EditableWorkingDaysRow
  >;
}

export function HolidayManager({
  months,
  initialRows,
  editable = true,
  savePath = "/api/admin/working-days",
}: HolidayManagerProps) {
  const initialState = useMemo(
    () => buildInitialRows(months, initialRows),
    [initialRows, months],
  );
  const [rows, setRows] = useState<Record<string, EditableWorkingDaysRow>>(initialState);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  function updateMonthValue(
    company: string,
    field: "workingDays" | "actualWorkingDays",
    month: string,
    value: string,
  ) {
    const nextValue = clampDayCount(value, 0);
    setRows((current) => {
      const currentRow = current[company];
      if (!currentRow) {
        return current;
      }
      const nextRow = {
        ...currentRow,
        [field]: {
          ...currentRow[field],
          [month]: nextValue,
        },
      };
      if (company === USA_COMPANY && field === "workingDays") {
        nextRow.actualWorkingDays = {
          ...nextRow.actualWorkingDays,
          [month]: nextValue,
        };
      }
      return {
        ...current,
        [company]: nextRow,
      };
    });
  }

  async function saveRows() {
    const normalizedRows = ALL_COMPANIES.map((company) => {
      const row = rows[company] ?? initialState[company];
      const workingDays = normalizeMonthValues(months, row?.workingDays);
      return {
        country: company,
        workingDays,
        actualWorkingDays:
          company === USA_COMPANY
            ? normalizeMonthValues(months, workingDays, workingDays)
            : normalizeMonthValues(months, row?.actualWorkingDays, workingDays),
      };
    });

    setSaving(true);
    setStatus(null);
    try {
      const response = await fetch(savePath, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rows: normalizedRows,
          updatedBy: "company-working-days-ui",
        }),
      });

      const body = (await response.json().catch(() => null)) as { detail?: string } | null;
      if (!response.ok) {
        throw new Error(body?.detail ?? "Unable to save working days.");
      }
      setStatus({ tone: "success", text: "Company working-day calendar saved successfully." });
      setRows(Object.fromEntries(normalizedRows.map((row) => [row.country, row])));
    } catch (error) {
      setStatus({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to save working days.",
      });
    } finally {
      setSaving(false);
    }
  }

  function renderNumberInput(
    company: string,
    field: "workingDays" | "actualWorkingDays",
    month: string,
    value: number,
    label: string,
  ) {
    return (
      <label className="block">
        <span className="sr-only">{label}</span>
        <input
          type="number"
          min={0}
          max={31}
          value={value}
          onChange={(event) => updateMonthValue(company, field, month, event.target.value)}
          disabled={!editable || (company === USA_COMPANY && field === "actualWorkingDays")}
          className="w-16 rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-right text-xs font-semibold text-slate-800 outline-none disabled:bg-slate-100 disabled:text-slate-500"
        />
      </label>
    );
  }

  function renderCompanyRows(companies: readonly WorkingDayCompany[], showActual: boolean) {
    return companies.map((company) => {
      const row = rows[company] ?? initialState[company];
      return (
        <tr key={company}>
          <th className="sticky left-0 z-10 bg-white px-4 py-4 text-sm font-bold text-slate-950">
            {company}
            <span className="mt-1 block text-xs font-medium text-slate-500">
              {company === USA_COMPANY
                ? "working days x bill rate x 8"
                : "actual working days / working days x bill rate"}
            </span>
          </th>
          {months.map((month) => (
            <Fragment key={`${company}-${month}`}>
              <td className="border-l border-slate-100 px-3 py-3">
                {renderNumberInput(
                  company,
                  "workingDays",
                  month,
                  row?.workingDays[month] ?? 22,
                  `${company} ${month} working days`,
                )}
              </td>
              {showActual ? (
                <td className="border-l border-slate-100 px-3 py-3">
                  {renderNumberInput(
                    company,
                    "actualWorkingDays",
                    month,
                    row?.actualWorkingDays[month] ?? row?.workingDays[month] ?? 22,
                    `${company} ${month} actual working days`,
                  )}
                </td>
              ) : null}
            </Fragment>
          ))}
        </tr>
      );
    });
  }

  return (
    <article className="surface-card px-6 py-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Working Days
          </p>
          <h3 className="mt-2 text-2xl font-semibold text-slate-950">
            Company-based working day calendar
          </h3>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            USA uses working days x bill rate x 8. GER, IND, MAL, MME, SIN, and UKG use
            actual working days / working days x bill rate for PS forecast calculations.
          </p>
        </div>
        {editable ? (
          <button
            type="button"
            onClick={saveRows}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white shadow-lg shadow-slate-900/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Calendar
          </button>
        ) : null}
      </div>

      {status ? (
        <div
          className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
            status.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {status.text}
        </div>
      ) : null}

      <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <TableFullscreenShell title="USA working day calendar">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="bg-slate-950 text-white">
              <tr>
                <th className="sticky left-0 z-10 bg-slate-950 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em]">
                  Company
                </th>
                {months.map((month) => (
                  <th key={month} className="border-l border-white/10 px-3 py-3 text-center text-xs font-semibold uppercase tracking-[0.12em]">
                    {month} Working Days
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {renderCompanyRows([USA_COMPANY], false)}
            </tbody>
          </table>
        </TableFullscreenShell>
      </div>

      <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <TableFullscreenShell title="ROW working day calendar">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="bg-slate-950 text-white">
              <tr>
                <th rowSpan={2} className="sticky left-0 z-10 bg-slate-950 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em]">
                  Company
                </th>
                {months.map((month) => (
                  <th key={month} colSpan={2} className="border-l border-white/10 px-3 py-3 text-center text-xs font-semibold uppercase tracking-[0.12em]">
                    {month}
                  </th>
                ))}
              </tr>
              <tr>
                {months.map((month) => (
                  <Fragment key={`headers-${month}`}>
                    <th className="border-l border-white/10 px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.12em]">
                      Working
                    </th>
                    <th className="border-l border-white/10 px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.12em]">
                      Actual
                    </th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {renderCompanyRows(ROW_COMPANIES, true)}
            </tbody>
          </table>
        </TableFullscreenShell>
      </div>
    </article>
  );
}
