"use client";

import { useEffect, useMemo, useState, type ClipboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Download,
  LoaderCircle,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";

import { TableFullscreenShell } from "@/components/table-fullscreen-shell";

type DatasetType = "budget" | "global_revenue" | "forecast";
type ColumnKind = "text" | "numeric" | "date";

type MasterdataColumn = {
  key: string;
  label: string;
  kind: ColumnKind;
};

type MasterdataResponse = {
  datasetType: DatasetType;
  columns: MasterdataColumn[];
  rows: Array<Record<string, unknown>>;
  summary: {
    rowCount: number;
    financialYear: string | null;
  };
};

type EditableRow = Record<string, unknown> & {
  __rowId: string;
  __status: "clean" | "edited" | "new" | "invalid";
};

type CellErrors = Record<string, string>;
type ErrorMap = Record<string, CellErrors>;

const DATASET_OPTIONS: Array<{ value: DatasetType; label: string }> = [
  { value: "budget", label: "Budget" },
  { value: "global_revenue", label: "Actuals" },
  { value: "forecast", label: "Forecast" },
];

const REQUIRED_COLUMNS: Record<DatasetType, string[]> = {
  budget: ["customer_name", "ms_ps", "resource_name", "resource_id", "project_name"],
  global_revenue: ["customer_name", "ms_ps", "resource_name", "resource_id", "project_name"],
  forecast: ["ms_ps", "resource_name", "resource_id"],
};

function isEmptyValue(value: unknown) {
  return String(value ?? "").trim().length === 0;
}

function getRowId(row: Record<string, unknown>, index: number) {
  const idValue = row.id;
  if (typeof idValue === "number") {
    return `id-${idValue}`;
  }
  return `tmp-${index}-${Math.random().toString(36).slice(2, 9)}`;
}

function toInputValue(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

function parseNumberish(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }
  const normalized = text.replace(/,/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDateLike(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : text;
}

function formatStatus(status: EditableRow["__status"]) {
  if (status === "new") {
    return "New";
  }
  if (status === "edited") {
    return "Edited";
  }
  if (status === "invalid") {
    return "Invalid";
  }
  return "Saved";
}

function validateRows(
  rows: EditableRow[],
  columns: MasterdataColumn[],
  datasetType: DatasetType,
) {
  const errors: ErrorMap = {};
  const columnMap = new Map(columns.map((column) => [column.key, column]));

  for (const row of rows) {
    const rowErrors: CellErrors = {};

    for (const requiredKey of REQUIRED_COLUMNS[datasetType]) {
      if (isEmptyValue(row[requiredKey])) {
        rowErrors[requiredKey] = "Required field";
      }
    }

    if (datasetType === "budget") {
      const msps = String(row.ms_ps ?? "").trim().toLowerCase();
      if (msps === "ms" && isEmptyValue(row.ocn_number)) {
        rowErrors.ocn_number = "OCN Number is required for MS rows";
      }
      if (msps === "ps" && isEmptyValue(row.resource_id)) {
        rowErrors.resource_id = "Resource ID is required for PS rows";
      }
    }

    for (const column of columns) {
      const raw = row[column.key];
      if (isEmptyValue(raw)) {
        continue;
      }
      if (column.kind === "numeric" && parseNumberish(raw) === null) {
        rowErrors[column.key] = "Invalid number";
      }
      if (column.kind === "date" && parseDateLike(raw) === null) {
        rowErrors[column.key] = "Invalid date";
      }
    }

    if (Object.keys(rowErrors).length > 0) {
      errors[row.__rowId] = rowErrors;
    }
  }

  return {
    hasErrors: Object.keys(errors).length > 0,
    errors,
    columnMap,
  };
}

function toPayloadValue(column: MasterdataColumn, value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }
  if (column.kind === "numeric") {
    return parseNumberish(text);
  }
  if (column.kind === "date") {
    return parseDateLike(text);
  }
  return text;
}

function createBlankRow(columns: MasterdataColumn[]): EditableRow {
  const row: EditableRow = {
    __rowId: `tmp-${Math.random().toString(36).slice(2, 10)}`,
    __status: "new",
  };
  for (const column of columns) {
    row[column.key] = "";
  }
  return row;
}

function formatNumber(value: number) {
  return value.toLocaleString("en-US");
}

type MasterdataGridWorkspaceProps = {
  financialYears: string[];
  datasetFinancialYears?: Partial<Record<DatasetType, string[]>>;
  initialFinancialYear: string;
  initialDatasetType?: DatasetType;
  canEdit: boolean;
};

export function MasterdataGridWorkspace({
  financialYears,
  datasetFinancialYears,
  initialFinancialYear,
  initialDatasetType = "budget",
  canEdit,
}: MasterdataGridWorkspaceProps) {
  const [datasetType, setDatasetType] = useState<DatasetType>(initialDatasetType);
  const [selectedFinancialYear, setSelectedFinancialYear] =
    useState(initialFinancialYear);
  const [searchText, setSearchText] = useState("");
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [originalRows, setOriginalRows] = useState<EditableRow[]>([]);
  const [deletedIds, setDeletedIds] = useState<number[]>([]);
  const [errorsByRow, setErrorsByRow] = useState<ErrorMap>({});
  const [dirty, setDirty] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    tone: "success" | "error" | "neutral";
    text: string;
  } | null>(null);

  function clearEditorState() {
    setRows([]);
    setOriginalRows([]);
    setDeletedIds([]);
    setErrorsByRow({});
    setDirty(false);
    setStatusMessage(null);
  }
  const visibleDatasetOptions = useMemo(() => {
    if (!datasetFinancialYears) {
      return DATASET_OPTIONS;
    }
    const optionsWithUploads = DATASET_OPTIONS.filter(
      (option) => (datasetFinancialYears[option.value] ?? []).length > 0,
    );
    return optionsWithUploads.length > 0 ? optionsWithUploads : DATASET_OPTIONS;
  }, [datasetFinancialYears]);

  useEffect(() => {
    if (!visibleDatasetOptions.some((option) => option.value === datasetType)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDatasetType(visibleDatasetOptions[0]?.value ?? "budget");
    }
  }, [datasetType, visibleDatasetOptions]);

  const datasetYears = useMemo(() => {
    const configured = datasetFinancialYears?.[datasetType] ?? [];
    const cleaned = configured
      .map((year) => String(year || "").trim())
      .filter((year) => year.length > 0);
    if (cleaned.length > 0) {
      return cleaned;
    }
    return financialYears;
  }, [datasetFinancialYears, datasetType, financialYears]);

  const financialYear = useMemo(() => {
    if (datasetYears.length === 0) {
      return "";
    }
    if (datasetYears.includes(selectedFinancialYear)) {
      return selectedFinancialYear;
    }
    return datasetYears.at(-1) ?? "";
  }, [datasetYears, selectedFinancialYear]);

  const query = useQuery({
    queryKey: ["masterdata-grid", datasetType, financialYear],
    queryFn: async () => {
      const search = new URLSearchParams({
        datasetType,
        limit: "5000",
        includeMetadata: "true",
      });
      if (financialYear.trim().length > 0) {
        search.set("financialYear", financialYear);
      }
      const response = await fetch(`/api/masterdata?${search.toString()}`, {
        cache: "no-store",
      });
      if (!response.ok) {
    throw new Error("Unable to load Masterdata rows.");
      }
      return (await response.json()) as MasterdataResponse;
    },
    refetchOnWindowFocus: false,
  });

  const columns = useMemo(
    () => query.data?.columns ?? [],
    [query.data?.columns],
  );

  useEffect(() => {
    const rawRows = query.data?.rows ?? [];
    const mapped: EditableRow[] = rawRows.map((row, index) => ({
      ...row,
      __rowId: getRowId(row, index),
      __status: "clean",
    }));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRows(mapped);
    setOriginalRows(mapped);
    setDeletedIds([]);
    setErrorsByRow({});
    setDirty(false);
    setStatusMessage(null);
  }, [query.data]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) {
        return;
      }
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const filteredRows = useMemo(() => {
    const needle = searchText.trim().toLowerCase();
    if (!needle) {
      return rows;
    }
    return rows.filter((row) =>
      columns.some((column) =>
        toInputValue(row[column.key]).toLowerCase().includes(needle),
      ),
    );
  }, [columns, rows, searchText]);

  const invalidCount = useMemo(
    () => Object.keys(errorsByRow).length,
    [errorsByRow],
  );

  function markDirty() {
    if (!dirty) {
      setDirty(true);
    }
  }

  function updateCell(rowId: string, column: MasterdataColumn, value: string) {
    setRows((current) =>
      current.map((row) => {
        if (row.__rowId !== rowId) {
          return row;
        }
        const nextStatus = row.__status === "new" ? "new" : "edited";
        return {
          ...row,
          [column.key]: value,
          __status: nextStatus,
        };
      }),
    );
    setErrorsByRow((current) => {
      const rowErrors = { ...(current[rowId] ?? {}) };
      delete rowErrors[column.key];
      if (Object.keys(rowErrors).length === 0) {
        const next = { ...current };
        delete next[rowId];
        return next;
      }
      return {
        ...current,
        [rowId]: rowErrors,
      };
    });
    markDirty();
  }

  function appendRow() {
    if (!canEdit) {
      return;
    }
    const next = createBlankRow(columns);
    setRows((current) => [next, ...current]);
    setDirty(true);
  }

  function removeRow(row: EditableRow) {
    if (!canEdit) {
      return;
    }
    setRows((current) => current.filter((entry) => entry.__rowId !== row.__rowId));
    const rawId = row.id;
    if (typeof rawId === "number") {
      setDeletedIds((current) => Array.from(new Set([...current, rawId])));
    }
    setErrorsByRow((current) => {
      const next = { ...current };
      delete next[row.__rowId];
      return next;
    });
    markDirty();
  }

  function cancelChanges() {
    setRows(originalRows);
    setDeletedIds([]);
    setErrorsByRow({});
    setStatusMessage({
      tone: "neutral",
      text: "Unsaved changes were discarded.",
    });
    setDirty(false);
  }

  async function saveChanges() {
    if (!canEdit) {
      return;
    }

    const validation = validateRows(rows, columns, datasetType);
    setErrorsByRow(validation.errors);
    if (validation.hasErrors) {
      setRows((current) =>
        current.map((row) => ({
          ...row,
          __status: validation.errors[row.__rowId] ? "invalid" : row.__status,
        })),
      );
      setStatusMessage({
        tone: "error",
        text: "Fix invalid cells before saving.",
      });
      return;
    }

    const payloadRows = rows.map((row) => {
      const payload: Record<string, unknown> = {};
      for (const column of columns) {
        payload[column.key] = toPayloadValue(column, row[column.key]);
      }
      if (typeof row.id === "number") {
        payload.id = row.id;
      }
      payload.sourceSheet = row.sourceSheet ?? "grid";
      payload.sourceRowNumber = row.sourceRowNumber ?? 0;
      return payload;
    });

    const response = await fetch("/api/masterdata/save", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        datasetType,
        financialYear: financialYear,
        rows: payloadRows,
        deletedIds,
        updatedBy: "excel-grid-ui",
      }),
    });

    const body = (await response.json().catch(() => ({}))) as {
      detail?: string;
      insertedOrUpdated?: number;
      deleted?: number;
      skippedInvalid?: number;
    };

    if (!response.ok) {
      setStatusMessage({
        tone: "error",
        text: body.detail ?? "Save failed. Please try again.",
      });
      return;
    }

    setStatusMessage({
      tone: "success",
      text: `Saved ${body.insertedOrUpdated ?? 0} rows, deleted ${body.deleted ?? 0}, skipped ${body.skippedInvalid ?? 0}.`,
    });
    setDirty(false);
    await query.refetch();
  }

  function resetFromServer() {
    setStatusMessage(null);
    void query.refetch();
  }

  function exportExcel() {
    const search = new URLSearchParams({
      datasetType,
      financialYear,
    });
    window.location.href = `/api/masterdata/export?${search.toString()}`;
  }

  function handleCellPaste(
    event: ClipboardEvent<HTMLInputElement>,
    rowIndex: number,
    columnIndex: number,
  ) {
    if (!canEdit) {
      return;
    }
    const clipboard = event.clipboardData.getData("text/plain");
    if (!clipboard.includes("\n") && !clipboard.includes("\t")) {
      return;
    }

    event.preventDefault();
    const lines = clipboard.replace(/\r/g, "").split("\n").filter((line) => line.length > 0);
    const matrix = lines.map((line) => line.split("\t"));

    setRows((current) => {
      const next = [...current];
      for (let r = 0; r < matrix.length; r += 1) {
        const targetRowIndex = rowIndex + r;
        if (targetRowIndex >= next.length) {
          next.push(createBlankRow(columns));
        }
        const row = { ...next[targetRowIndex] };
        for (let c = 0; c < matrix[r].length; c += 1) {
          const targetColumn = columns[columnIndex + c];
          if (!targetColumn) {
            continue;
          }
          row[targetColumn.key] = matrix[r][c];
        }
        row.__status = row.__status === "new" ? "new" : "edited";
        next[targetRowIndex] = row;
      }
      return next;
    });
    markDirty();
  }

  return (
    <section className="surface-card px-5 py-5 lg:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Masterdata Grid
          </p>
          <h3 className="mt-1 text-2xl font-semibold text-slate-950">
            Excel-style editor for budget, actuals, and forecast
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={resetFromServer}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-700"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Reload
          </button>
          <button
            type="button"
            onClick={exportExcel}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-700"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </button>
          {canEdit ? (
            <>
              <button
                type="button"
                onClick={appendRow}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-700"
              >
                <Plus className="h-3.5 w-3.5" />
                Add row
              </button>
              <button
                type="button"
                onClick={cancelChanges}
                disabled={!dirty}
                className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </button>
              <button
                type="button"
                onClick={saveChanges}
                disabled={!dirty}
                className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                <Save className="h-3.5 w-3.5" />
                Save
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto_auto]">
        <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
          Search
          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2">
            <Search className="h-3.5 w-3.5 text-slate-400" />
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search visible rows"
              className="w-full bg-transparent text-sm font-normal text-slate-700 outline-none placeholder:text-slate-400"
            />
          </div>
        </label>

        <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
          Dataset
          <select
            className="auth-input min-w-[200px]"
            value={datasetType}
            onChange={(event) => {
              clearEditorState();
              setDatasetType(event.target.value as DatasetType);
            }}
          >
            {visibleDatasetOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
          Financial Year
          <select
            className="auth-input min-w-[170px]"
            value={financialYear}
            onChange={(event) => {
              clearEditorState();
              setSelectedFinancialYear(event.target.value);
            }}
          >
            {datasetYears.length > 0 ? (
              datasetYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))
            ) : (
              <option value="">All active years</option>
            )}
          </select>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
        <span>
          Showing {formatNumber(filteredRows.length)} of {formatNumber(rows.length)} rows
        </span>
        <span>Deleted in draft: {formatNumber(deletedIds.length)}</span>
        <span>Invalid rows: {formatNumber(invalidCount)}</span>
        {dirty ? <span className="text-amber-700">Unsaved changes</span> : null}
      </div>

      {statusMessage ? (
        <div
          className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
            statusMessage.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : statusMessage.tone === "error"
                ? "border-rose-200 bg-rose-50 text-rose-800"
                : "border-slate-200 bg-slate-50 text-slate-700"
          }`}
        >
          {statusMessage.text}
        </div>
      ) : null}

      {query.isLoading ? (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600">
          <span className="inline-flex items-center gap-2">
            <LoaderCircle className="h-4 w-4 animate-spin" />
          Loading Masterdata rows...
          </span>
        </div>
      ) : query.isError ? (
        <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-6 text-sm text-rose-800">
          Unable to load Masterdata rows. Please retry.
        </div>
      ) : (
        <TableFullscreenShell
        title="Masterdata grid"
        description="Open the editable Masterdata grid in a full-page table view."
          className="mt-6 rounded-2xl border border-slate-200 bg-white"
        >
          <table className="min-w-[1400px] text-left text-xs">
            <thead className="sticky top-0 z-20 bg-slate-100">
              <tr>
                <th className="border-b border-slate-200 bg-slate-100 px-3 py-3 font-semibold text-slate-700">
                  Actions
                </th>
                <th className="border-b border-slate-200 px-3 py-3 font-semibold text-slate-700">
                  Status
                </th>
                {columns.map((column) => (
                  <th
                    key={column.key}
                    className="border-b border-slate-200 px-3 py-3 font-semibold text-slate-700"
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, rowIndex) => {
                const rowErrors = errorsByRow[row.__rowId] ?? {};
                const hasRowError = Object.keys(rowErrors).length > 0;
                return (
                  <tr
                    key={row.__rowId}
                    className={`border-b border-slate-100 align-top ${
                      hasRowError ? "bg-rose-50/40" : rowIndex % 2 === 0 ? "bg-white" : "bg-[#f6f7f8]"
                    }`}
                  >
                    <td className="border-r border-slate-100 px-3 py-2">
                      <button
                        type="button"
                        onClick={() => removeRow(row)}
                        disabled={!canEdit}
                        className="inline-flex items-center gap-1 rounded-full border border-rose-200 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Trash2 className="h-3 w-3" />
                        Delete
                      </button>
                    </td>
                    <td className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.1em]">
                      <span
                        className={`rounded-full px-2 py-1 ${
                          hasRowError
                            ? "bg-rose-100 text-rose-800"
                            : row.__status === "new"
                              ? "bg-emerald-100 text-emerald-800"
                              : row.__status === "edited"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {hasRowError ? "Invalid" : formatStatus(row.__status)}
                      </span>
                      {rowErrors.__row ? (
                        <p className="mt-1 normal-case tracking-normal text-rose-700">
                          {rowErrors.__row}
                        </p>
                      ) : null}
                    </td>
                    {columns.map((column, columnIndex) => {
                      const error = rowErrors[column.key];
                      return (
                        <td key={`${row.__rowId}-${column.key}`} className="px-2 py-2">
                          <input
                            value={toInputValue(row[column.key])}
                            onChange={(event) =>
                              updateCell(row.__rowId, column, event.target.value)
                            }
                            onPaste={(event) =>
                              handleCellPaste(event, rowIndex, columnIndex)
                            }
                            disabled={!canEdit}
                            className={`w-full min-w-[130px] rounded-lg border px-2 py-1.5 text-xs outline-none ${
                              column.kind === "numeric" ? "text-right" : "text-left"
                            } ${
                              error
                                ? "border-rose-300 bg-rose-50 text-rose-900"
                                : "border-slate-200 bg-white text-slate-800"
                            } disabled:bg-slate-50 disabled:text-slate-500`}
                          />
                          {error ? (
                            <p className="mt-1 text-[11px] text-rose-700">{error}</p>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}

              {filteredRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length + 2}
                    className="px-4 py-8 text-center text-sm text-slate-600"
                  >
                    No rows match current filters. Upload a workbook or clear search.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </TableFullscreenShell>
      )}
    </section>
  );
}
