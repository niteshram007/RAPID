export const RAPID_REVENUE_EXPORT_FIELDS = [
  "Customer Name",
  "MS/PS",
  "Entity",
  "GR Entity",
  "ROW/US",
  "Strategic Account",
  "Emp ID",
  "Resource Name",
  "Deal Type",
  "EEENNN",
  "Bill Rate",
  "Rate Type",
  "Billed currency",
  "Forex",
  "Type of Projects",
  "Start Date",
  "End Date",
  "Apr 2026",
  "May 2026",
  "Jun 2026",
  "Jul 2026",
  "Aug 2026",
  "Sep 2026",
  "Oct 2026",
  "Nov 2026",
  "Dec 2026",
  "Jan 2027",
  "Feb 2027",
  "Mar 2027",
  "FY",
  "Project Name",
  "Client Name",
  "OCN Number",
  "Practice Head",
  "BDM",
  "Geo Head",
  "Vertical",
  "Horizontal",
  "Q1",
  "Q2",
  "Q3",
  "Q4",
] as const;

export const RAPID_REVENUE_SLICERS = [
  "Practice Head",
  "BDM",
  "Geo Head",
  "Vertical",
  "Horizontal",
  "MS/PS",
  "Strategic Account",
  "Deal Type",
] as const;

export const RAPID_REVENUE_NUMERIC_FIELDS = [
  "Bill Rate",
  "Forex",
  "Apr 2026",
  "May 2026",
  "Jun 2026",
  "Jul 2026",
  "Aug 2026",
  "Sep 2026",
  "Oct 2026",
  "Nov 2026",
  "Dec 2026",
  "Jan 2027",
  "Feb 2027",
  "Mar 2027",
  "FY",
  "Q1",
  "Q2",
  "Q3",
  "Q4",
] as const;

export type RapidRevenueField = (typeof RAPID_REVENUE_EXPORT_FIELDS)[number];
export type RapidRevenueRow = Record<RapidRevenueField, string | number | null>;

export type RapidRevenueOverview = {
  rowCount: number;
  customerCount: number;
  resourceCount: number;
  totalFY: number;
  financialYear: string | null;
  currentMonthLabel: string | null;
  monthToDateTotal: number;
  yearToDateTotal: number;
  topPractice: { label: string; value: number } | null;
  topGeoHead: { label: string; value: number } | null;
  topBDM: { label: string; value: number } | null;
  latestUploadAt: string | null;
  latestUploadName: string | null;
};

export type RevenueComparisonRow = {
  month: string;
  customerName: string;
  groupCompany: string;
  customerDimension: string;
  projectName: string;
  resourceName: string;
  msps: string;
  geography: string;
  practiceHead: string;
  geoHead: string;
  bdm: string;
  entity: string;
  vertical: string;
  dealType: string;
  businessType: string;
  strategicAccount: string;
  eeennn: string;
  budget: number;
  forecast: number;
  actual: number;
  varianceVsBudget: number;
  varianceVsForecast: number;
};

export type RevenueDataState = "fresh" | "stale" | "fallback";
export type RevenueMetaReason =
  | "unauthorized"
  | "forbidden"
  | "backend_unavailable"
  | "timeout"
  | "no_data_period";

export type RevenueDataMeta = {
  dataState: RevenueDataState;
  reason?: RevenueMetaReason;
  lastSuccessAt?: string | null;
  autoPeriodAdjusted?: boolean;
  resolvedPeriod?: {
    financialYear: string;
    periodFrom: string;
    periodTo: string;
    comparisonMonth?: string;
  };
};

export type RevenueComparisonResponse = {
  database: {
    status: string;
    message: string;
  };
  financialYear: string;
  comparisonMonth: string;
  resolvedPeriod?: {
    financialYear: string;
    periodFrom: string;
    periodTo: string;
    comparisonMonth?: string;
  };
  dataVersion?: string;
  scopeMode?: string;
  summary: {
    rowCount: number;
    budget: number;
    forecast: number;
    actual: number;
    varianceVsBudget: number;
    varianceVsForecast: number;
  };
  rows: RevenueComparisonRow[];
  meta?: RevenueDataMeta;
};

export type RevenueBudgetKioskTable = {
  headers: string[];
  rows: Record<string, string | number>[];
};

export type RevenueBudgetKioskResponse = {
  database: RevenueComparisonResponse["database"];
  financialYear: string;
  periodFrom: string;
  periodTo: string;
  tables: Record<string, RevenueBudgetKioskTable>;
  meta?: RevenueDataMeta;
};

export type RapidRevenueScopeFilters = {
  financialYear?: string | null;
  periodFrom?: string | null;
  periodTo?: string | null;
  practiceHeads?: string[];
  bdms?: string[];
  geoHeads?: string[];
  verticals?: string[];
  horizontals?: string[];
  msps?: string[];
  customerNames?: string[];
  rowUs?: string[];
  entities?: string[];
  strategicAccounts?: string[];
  dealTypes?: string[];
  eeennns?: string[];
  projectNames?: string[];
};

export type ForecastSheetRow = {
  recordId: number;
  "Customer Name": string;
  "MS/PS": string;
  "Emp ID": string;
  "Resource ID"?: string;
  "Resource Name": string;
  Entity: string;
  "GR Entity": string;
  "ROW/US": string;
  "Strategic Account": string;
  "Deal Type": string;
  EEENNN: string;
  "Bill Rate": number;
  "Rate Type": string;
  "Billed currency": string;
  Forex: number;
  "Type of Projects": string;
  "Start Date": string | null;
  "End Date": string | null;
  "Project Name": string;
  "Client Name": string;
  "OCN Number": string;
  "Practice Head": string;
  "Geo Head": string;
  Vertical: string;
  Horizontal: string;
  Country: string;
  Q1: number;
  Q2: number;
  Q3: number;
  Q4: number;
  BDM: string;
  "Financial Year": string;
  "Updated At": string | null;
  "Updated By": string;
  "Submitted At"?: string | null;
  "Submitted By"?: string;
  "Draft Updated At"?: string | null;
  "Draft Updated By"?: string;
  "Is Reassigned Row"?: boolean;
  "Manual Row Type"?: "renewal" | "new_project" | "";
  [key: string]: string | number | boolean | null | undefined;
};

export type ForecastSheetResponse = {
  forecastMonth: string;
  financialYear: string | null;
  hasActiveUpload?: boolean;
  bdmOptions: string[];
  forecastControls?: {
    lockinDay: number;
    lockoutDay: number;
    lockinDate?: string | null;
    lockoutDate?: string | null;
    rolloutStartMonth: string;
    activeMonth: string;
    visibleMonths: string[];
    lockedMonths: string[];
    editableMonths: string[];
    submissionWindowOpen: boolean;
    updatedBy?: string | null;
    updatedAt?: string | null;
  };
  rows: ForecastSheetRow[];
  monthSnapshots?: Record<
    string,
    Record<
      string,
      {
        forecastValue?: number | null;
        billedHours?: number | null;
        billableActualHrs?: number | null;
        submittedAt?: string | null;
        submittedBy?: string;
        draftForecastValue?: number | null;
        draftBilledHours?: number | null;
        draftBillableActualHrs?: number | null;
        draftUpdatedAt?: string | null;
        draftUpdatedBy?: string;
      }
    >
  >;
  summary: {
    rowCount: number;
    submittedRows: number;
    isPastDue: boolean;
    dueDay: number;
    userId: string;
    userName: string;
  };
};

export type RevenueNotification = {
  id: string;
  category: string;
  title: string;
  message: string;
  link: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

export type ForecastSubmissionOwnerColumn = {
  key: string;
  label: string;
  role: "bdm" | "practice-head";
};

export type ForecastSubmissionMatrixCell = {
  status: "complete" | "pending" | "future" | "no_scope" | string;
  submittedAt?: string | null;
};

export type ForecastSubmissionMatrixRow = {
  month: string;
  future: boolean;
  cells: Record<string, ForecastSubmissionMatrixCell>;
};

export type ForecastSubmissionMatrix = {
  columns: {
    bdm: ForecastSubmissionOwnerColumn[];
    practiceHead: ForecastSubmissionOwnerColumn[];
  };
  rows: ForecastSubmissionMatrixRow[];
};

export type ProjectAssignmentProjectRow = {
  recordId: number;
  customerName: string;
  projectName: string;
  msps: string;
  entity: string;
  practiceHead: string;
  geoHead: string;
  currentBdm: string;
  assignmentType?: string;
  assignmentDirection?: string;
  assignmentFrom?: string;
  assignmentTo?: string;
  assignmentEffectiveMonth?: string;
  pendingRequestId: string;
  pendingRequestedBdm: string;
  pendingCreatedAt: string | null;
  status: "ready" | "awaiting";
};

export type ProjectReassignmentPayload = {
  assignmentType: "bdm" | "geo_head";
  effectiveMonth: string;
  recordId?: number;
  currentBdm?: string;
  nextBdm?: string;
  currentGeoHead?: string;
  nextGeoHead?: string;
  practiceHead?: string;
  entity?: string;
  financialYear?: string | null;
};

export type ProjectReassignmentResponse = {
  status: string;
  assignmentType: "bdm" | "geo_head";
  effectiveMonth: string;
  affectedRecords: number;
  createdRecords: number;
  affectedRecordIds: number[];
  createdRecordIds: number[];
  message?: string;
};

export type ProjectAssignmentRequestRow = {
  id: string;
  recordId: number;
  customerName: string;
  projectName: string;
  geoHead: string;
  practiceHead: string;
  currentBdm: string;
  requestedBdm: string;
  requestedByUserId: string;
  requestedByName: string;
  status: "pending" | "approved" | "rejected" | string;
  decisionNote: string;
  requestedAt: string | null;
  decidedAt: string | null;
  decidedByUserId: string;
  decidedByName: string;
};

export type ProjectAssignmentWorkbench = {
  projects: ProjectAssignmentProjectRow[];
  bdmOptions: string[];
  geoHeadOptions?: string[];
  practiceHeadOptions?: string[];
  monthOptions?: string[];
  requests: ProjectAssignmentRequestRow[];
};

export type ForecastSubmissionRow = {
  recordId: number;
  forecastValue: number | null;
  billedHours?: number | null;
  billableActualHrs?: number | null;
  rowValues?: {
    customerName?: string | null;
    msps?: string | null;
    entity?: string | null;
    grEntity?: string | null;
    rowUs?: string | null;
    strategicAccount?: string | null;
    resourceId?: string | null;
    resourceName?: string | null;
    dealType?: string | null;
    eeennn?: string | null;
    billRate?: number | null;
    rateType?: string | null;
    billedCurrency?: string | null;
    forex?: number | null;
    typeOfProjects?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    projectName?: string | null;
    ocnNumber?: string | null;
    practiceHead?: string | null;
    bdm?: string | null;
    geoHead?: string | null;
    vertical?: string | null;
    horizontal?: string | null;
    fy?: number | null;
    q1?: number | null;
    q2?: number | null;
    q3?: number | null;
    q4?: number | null;
    clientName?: string | null;
  };
};

export type ForecastSubmitResponse = {
  status: string;
  savedRows: number;
  forecastMonth: string;
  submittedAt: string;
  mismatchRecordIds?: number[];
  mismatchCount?: number;
};

export type ForecastDraftSaveResponse = {
  status: string;
  savedRows: number;
  forecastMonth: string;
  savedAt: string;
};

export type ForecastRowCreateRequest = {
  mode: "renewal" | "new_project";
  recordId?: number;
  financialYear?: string | null;
  values?: Record<string, string | number | null | undefined>;
};

const ARRAY_FILTER_KEYS = [
  "practiceHeads",
  "bdms",
  "geoHeads",
  "verticals",
  "horizontals",
  "msps",
  "customerNames",
  "rowUs",
  "entities",
  "strategicAccounts",
  "dealTypes",
  "eeennns",
  "projectNames",
] as const;

export function readRapidRevenueFiltersFromSearch(search: URLSearchParams): RapidRevenueScopeFilters {
  const filters: RapidRevenueScopeFilters = {};
  const financialYear = search.get("financialYear");
  if (financialYear) {
    filters.financialYear = financialYear;
  }
  const periodFrom = search.get("periodFrom");
  const periodTo = search.get("periodTo");
  if (periodFrom) {
    filters.periodFrom = periodFrom;
  }
  if (periodTo) {
    filters.periodTo = periodTo;
  }
  for (const key of ARRAY_FILTER_KEYS) {
    const values = search.getAll(key).map((entry) => entry.trim()).filter(Boolean);
    if (values.length > 0) {
      filters[key] = values;
    }
  }
  return filters;
}

export function buildRapidRevenueSearch(filters: RapidRevenueScopeFilters = {}) {
  const search = new URLSearchParams();
  const entries = Object.entries(filters) as Array<
    [keyof RapidRevenueScopeFilters, string[] | string | null | undefined]
  >;
  for (const [key, value] of entries) {
    if (Array.isArray(value)) {
      value.filter(Boolean).forEach((entry) => search.append(String(key), entry));
      continue;
    }
    if (typeof value === "string" && value.trim()) {
      search.set(String(key), value.trim());
    }
  }
  return search.toString();
}
