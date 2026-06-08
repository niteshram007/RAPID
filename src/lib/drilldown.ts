export type DrillDownSource =
  | "actuals"
  | "budget"
  | "forecast"
  | "variance"
  | "combined"
  | "kiosk_unified"
  | "dashboard";

export type DrillDownAggregationType = "sum" | "count" | "avg" | "min" | "max";

export type DrillDownContext = {
  source: DrillDownSource;
  metric: string;
  value?: number;
  filters?: Record<string, unknown>;
  groupBy?: string[];
  dateRange?: {
    start?: string;
    end?: string;
  };
  month?: string;
  fiscalYear?: string;
  displayTitle?: string;
  columns?: string[];
  aggregation?: {
    type: DrillDownAggregationType;
    field: string;
  };
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  dataset?: string;
  strictMetricScope?: boolean;
};

export type DrillDownDetailsResponse = {
  title: string;
  filters: Record<string, unknown>;
  summary: {
    record_count: number;
    total_value: number;
    clicked_value: number | null;
    difference: number;
    is_reconciled: boolean;
  };
  columns: Array<{
    key: string;
    label: string;
  }>;
  rows: Array<Record<string, unknown>>;
  pagination: {
    page: number;
    page_size: number;
    total_rows: number;
  };
  context: {
    source: string;
    metric: string;
    aggregation: Record<string, unknown>;
  };
};

const DRILLDOWN_FILTER_ALIASES: Record<string, string> = {
  financialyear: "financial_year",
  financial_year: "financial_year",
  fy_year: "financial_year",
  year: "year",
  month: "month",
  quarter: "quarter",
  customer: "customer_name",
  customername: "customer_name",
  customer_name: "customer_name",
  customerdimension: "customer_dimension",
  customer_dimension: "customer_dimension",
  project: "project_name",
  projectname: "project_name",
  project_name: "project_name",
  empid: "emp_id",
  emp_id: "emp_id",
  employee_id: "emp_id",
  resource_id: "emp_id",
  resourcename: "resource_name",
  resource_name: "resource_name",
  ocn: "ocn_number",
  ocn_number: "ocn_number",
  msps: "ms_ps",
  ms_ps: "ms_ps",
  region: "region",
  rowus: "row_us",
  row_us: "row_us",
  salesregion: "sales_region",
  sales_region: "sales_region",
  geohead: "geo_head",
  geo_head: "geo_head",
  practicehead: "practice_head",
  practice_head: "practice_head",
  bdm: "bdm",
  entity: "entity",
  company: "entity",
  vertical: "vertical",
  horizontal: "horizontal",
  dealtype: "deal_type",
  deal_type: "deal_type",
  typeofprojects: "type_of_projects",
  type_of_projects: "type_of_projects",
  serviceline: "service_line",
  service_line: "service_line",
  sbu: "sbu",
  subsbu: "sub_sbu",
  sub_sbu: "sub_sbu",
  dept: "dept",
  branch: "branch",
  buh: "buh",
  strategicaccount: "strategic_account",
  strategic_account: "strategic_account",
  eeennn: "eeennn",
  groupcompany: "group_company",
  group_company: "group_company",
  deliverymanager: "delivery_manager",
  delivery_manager: "delivery_manager",
};

const DRILLDOWN_ALLOWED_FILTER_KEYS = new Set([
  "financial_year",
  "year",
  "month",
  "quarter",
  "customer_name",
  "customer_dimension",
  "project_name",
  "emp_id",
  "resource_name",
  "ocn_number",
  "ms_ps",
  "region",
  "row_us",
  "sales_region",
  "geo_head",
  "practice_head",
  "bdm",
  "entity",
  "vertical",
  "horizontal",
  "deal_type",
  "type_of_projects",
  "service_line",
  "sbu",
  "sub_sbu",
  "dept",
  "branch",
  "buh",
  "strategic_account",
  "eeennn",
  "group_company",
  "delivery_manager",
]);

function normalizeFilterKey(value: string) {
  const compact = value.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  return DRILLDOWN_FILTER_ALIASES[compact] ?? compact;
}

function normalizeFilterValue(value: unknown) {
  if (Array.isArray(value)) {
    const list = value
      .map((entry) => (typeof entry === "string" ? entry.trim() : entry))
      .filter((entry) => entry !== undefined && entry !== null && `${entry}`.trim() !== "");
    return list.length > 0 ? list : null;
  }
  if (typeof value === "string") {
    const text = value.trim();
    return text ? text : null;
  }
  if (value === undefined || value === null) {
    return null;
  }
  return value;
}

export function normalizeDrillDownFilters(filters?: Record<string, unknown> | null) {
  if (!filters) {
    return {};
  }
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(filters)) {
    const canonicalKey = normalizeFilterKey(key);
    if (!DRILLDOWN_ALLOWED_FILTER_KEYS.has(canonicalKey)) {
      continue;
    }
    const normalizedValue = normalizeFilterValue(value);
    if (normalizedValue === null) {
      continue;
    }
    normalized[canonicalKey] = normalizedValue;
  }
  return normalized;
}

export function normalizeDrillDownContext(context: DrillDownContext): DrillDownContext {
  return {
    ...context,
    filters: normalizeDrillDownFilters(context.filters),
  };
}

async function postJson<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { detail?: string } | null;
    const detail = body?.detail ?? "Request failed.";
    throw new Error(`${detail} (HTTP ${response.status})`);
  }
  return (await response.json()) as T;
}

export function mergeDrillDownFilters(
  ...filterSets: Array<Record<string, unknown> | undefined | null>
) {
  const merged: Record<string, unknown> = {};
  for (const filterSet of filterSets) {
    if (!filterSet) {
      continue;
    }
    for (const [key, value] of Object.entries(filterSet)) {
      if (value === undefined || value === null || value === "") {
        continue;
      }
      merged[key] = value;
    }
  }
  return merged;
}

export async function fetchDrillDownDetails(context: DrillDownContext) {
  return postJson<DrillDownDetailsResponse>(
    "/api/drilldown/details",
    normalizeDrillDownContext(context),
  );
}

export async function exportDrillDownDetails(
  context: DrillDownContext,
  format: "csv" | "xlsx" = "csv",
) {
  const response = await fetch("/api/drilldown/export", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ context: normalizeDrillDownContext(context), format }),
    cache: "no-store",
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(body?.detail ?? "Unable to export details.");
  }
  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") ?? "";
  const match = /filename=\"?([^\";]+)\"?/i.exec(disposition);
  const filename = match?.[1] ?? `drilldown.${format}`;
  return { blob, filename };
}
