"use client";

type DrillDownColumn = {
  key: string;
  label: string;
};

type DrillDownTableProps = {
  columns: DrillDownColumn[];
  rows: Array<Record<string, unknown>>;
  sortBy: string;
  sortDir: "asc" | "desc";
  onSort: (columnKey: string) => void;
};

function isNumericValue(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatCell(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "number") {
    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 2,
    }).format(value);
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  return String(value);
}

function formatColumnLabel(column: DrillDownColumn) {
  const key = column.key.toLowerCase();
  if (key === "budget") {
    return "Budget (Plan)";
  }
  if (key === "forecast") {
    return "Forecast (Latest)";
  }
  if (key === "actual") {
    return "YTD Revenue$";
  }
  if (key === "variance") {
    return "Variance (Actuals - Budget)";
  }
  if (key === "month") {
    return "Period Month";
  }
  if (key === "ms_ps" || key === "msps") {
    return "MS/PS";
  }
  return column.label;
}

export function DrillDownTable({
  columns,
  rows,
  sortBy,
  sortDir,
  onSort,
}: DrillDownTableProps) {
  return (
    <div className="table-freeze-shell rounded-[16px] border border-slate-200">
      <table className="min-w-full text-left text-xs text-slate-700">
        <thead className="sticky top-0 z-10 bg-slate-950 text-white">
          <tr>
            {columns.map((column) => {
              const isActive = sortBy === column.key;
              return (
                <th
                  key={column.key}
                  className="cursor-pointer px-3 py-2.5 font-semibold uppercase tracking-[0.14em] transition hover:bg-slate-900/80"
                  onClick={() => onSort(column.key)}
                  title="Sort"
                >
                  <span className="inline-flex items-center gap-1">
                    {formatColumnLabel(column)}
                    {isActive ? (sortDir === "asc" ? "↑" : "↓") : null}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                className="px-3 py-4 text-center text-sm text-slate-500"
                colSpan={Math.max(columns.length, 1)}
              >
                No detail rows found.
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr
                key={`detail-row-${index}`}
                className={`border-t border-slate-100 ${
                  index % 2 === 0 ? "bg-white" : "bg-slate-50/70"
                }`}
              >
                {columns.map((column) => (
                  <td
                    key={`${index}-${column.key}`}
                    className={`px-3 py-2.5 ${
                      isNumericValue(row[column.key]) ? "text-right tabular-nums" : "text-left"
                    }`}
                  >
                    {formatCell(row[column.key])}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
