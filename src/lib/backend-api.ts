import { getSessionProfile } from "@/lib/auth";
import { buildBackendAuthHeaders } from "@/lib/backend-security";

export type BackendHealth = {
  service: string;
  status: string;
  timestamp: string;
  database?: {
    status: string;
    message: string;
  };
};

export type AdminUserSummary = {
  id: string;
  name: string;
  email: string;
  title: string;
  roleId: string;
  geo: string;
  practice: string;
  active: boolean;
  mfaRequired: boolean;
  totpEnabled: boolean;
  passwordResetRequired: boolean;
  lastTotpVerifiedAt: string | null;
  updatedAt: string;
};

export type AdminUploadRecord = {
  id: string;
  financialYear: string;
  datasetType?: string;
  uploadMonth?: string | null;
  originalFilename: string;
  storedFilename: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
  importedRows?: number;
  parsedSheets?: string[];
  matchedColumns?: string[];
  active?: boolean;
};

export type AdminSettings = {
  assistantName: string;
  localLlmEnabled: boolean;
  localLlmBaseUrl: string;
  localLlmPlatformBaseUrl: string;
  localLlmApiKey: string;
  localLlmModel: string;
  localLlmTemperature: number;
  defaultFinancialYear: string;
  showRestrictedRoleBudgets: boolean;
};

export type AdminOverview = {
  status: string;
  totals: {
    users: number;
    activeUsers: number;
    roles: number;
    mfaRequired: number;
    mfaEnrolled: number;
    uploads: number;
    locations: number;
    mappedBudgetRows: number;
  };
  budgetMapping: {
    latestBatchId: string | null;
    financialYear: string | null;
    updatedAt: string | null;
    summary: {
      totalRows: number;
      validRows: number;
      mappedRows: number;
      autoEnrichedRows: number;
      manualApprovedRows: number;
      manualReviewRows: number;
      unmatchedRows: number;
      errorRows: number;
      coveragePercent: number;
    };
    mappedRows: Array<{
      rowNumber: number;
      customerName: string;
      projectName: string;
      ocnNumber: string;
      empId: string;
      matchStatus: string;
      matchSource: string;
      matchConfidence: number;
    }>;
    logicalMappings: Array<{
      rowNumber: number;
      customerName: string;
      projectName: string;
      ocnNumber: string;
      empId: string;
      mappingKey: string;
      primaryIdentifierType: string;
      primaryIdentifierValue: string;
      validationStatus: string;
      validationMessage: string;
      matchStatus: string;
      matchSource: string;
      matchConfidence: number;
      manualReviewReason: string;
    }>;
  };
  latestUploads: AdminUploadRecord[];
  localLlm: AdminSettings;
  users: AdminUserSummary[];
};

export type AdminLocations = {
  geographies: string[];
  practices: string[];
  total: number;
};

export type AdminUploads = {
  financialYears: string[];
  uploads: AdminUploadRecord[];
  total: number;
};

export type AdminSettingsResponse = {
  settings: AdminSettings;
  financialYears: string[];
};

export type CountryWorkingDaysRow = {
  country: string;
  workingDays: Record<string, number>;
  actualWorkingDays?: Record<string, number>;
};

export type AdminWorkingDays = {
  months: string[];
  countries: string[];
  rows: CountryWorkingDaysRow[];
  savedAt?: string;
};

export type CustomerHolidayRow = {
  id?: string;
  customerName: string;
  holidayDate: string;
  holidayName: string;
  projectName: string;
  bdm: string;
  practiceHead: string;
  geoHead: string;
  updatedBy?: string;
  updatedAt?: string | null;
};

export type CustomerHolidayPayload = {
  rows: CustomerHolidayRow[];
  filters: {
    customers: string[];
    bdms: string[];
    practiceHeads: string[];
  };
  savedAt?: string;
};

export type CustomerWorkingDaysRow = {
  customerName: string;
  bdm: string;
  practiceHead: string;
  geoHead: string;
  workingDays: Record<string, number>;
  updatedBy?: string;
  updatedAt?: string | null;
};

export type CustomerWorkingDaysPayload = {
  months: string[];
  rows: CustomerWorkingDaysRow[];
  filters: {
    customers: string[];
    bdms: string[];
    practiceHeads: string[];
    geoHeads: string[];
  };
  savedAt?: string;
};

export type AdminForecastControl = {
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

export type RevenueNameOptions = {
  bdm: string[];
  "practice-head": string[];
  "geo-head": string[];
};

export type AdminAuditLog = {
  id: string;
  userId: string;
  userEmail: string;
  role: string;
  module: string;
  description: string;
  ipAddress: string;
  userAgent: string;
  actorUserId: string;
  actorName: string;
  actorRole: string;
  action: string;
  status: string;
  detail: string;
  metadata: Record<string, unknown>;
  createdAt: string | null;
};

export type AdminAuditLogsResponse = {
  logs: AdminAuditLog[];
  count: number;
};

export type AdminActivityUser = {
  userId: string;
  userName: string;
  userEmail: string;
  roleId: string;
  roleName: string;
  isActive: boolean;
  lastSeenAt: string | null;
  startedAt: string | null;
  totalActiveSeconds: number;
  sessionCount: number;
  lastPath: string;
};

export type AdminActivitySession = {
  sessionId: string;
  userId: string;
  userName: string;
  userEmail: string;
  roleId: string;
  roleName: string;
  startedAt: string | null;
  lastSeenAt: string | null;
  endedAt: string | null;
  totalActiveSeconds: number;
  heartbeatCount: number;
  lastPath: string;
  isActive: boolean;
  metadata: Record<string, unknown>;
};

export type AdminActivityOverview = {
  summary: {
    activeCount: number;
    trackedUsers: number;
    sessionCount: number;
  };
  activeWithinMinutes: number;
  users: AdminActivityUser[];
  sessions: AdminActivitySession[];
};

export type WorkspaceDashboard = {
  headline: {
    title: string;
    subtitle: string;
  };
  cards: Array<{
    label: string;
    value: string;
    detail: string;
  }>;
  highlights: string[];
};

export type WorkspaceSlicers = {
  geographies: string[];
  practices: string[];
  financialYears: string[];
  recommendedViews: string[];
};

export type RevenueDashboardFilters = {
  financialYear?: string | null;
  region?: string | null;
  practiceHead?: string | null;
  geoHead?: string | null;
  customerName?: string | null;
  strategicAccount?: string | null;
  dealType?: string | null;
  businessType?: string | null;
  eeennn?: string | null;
  financialYears?: string[];
  geographies?: string[];
  practices?: string[];
  geoHeads?: string[];
  bdms?: string[];
  entities?: string[];
  verticals?: string[];
  accounts?: string[];
  strategicAccounts?: string[];
  dealTypes?: string[];
  businessTypes?: string[];
  eeennns?: string[];
  periodFrom?: string | null;
  periodTo?: string | null;
  comparisonMode?: "absolute" | "percentage" | null;
  comparisonMetric?:
    | "budget_vs_actual"
    | "actual_vs_forecast"
    | "budget_vs_forecast"
    | null;
  comparisonPeriod?: "qoq" | "yoy" | null;
  comparePrevious?: boolean;
  breakdownDimension?: "region" | "practice_head" | "bdm" | "customer_name" | null;
  whatIfPct?: number | null;
};

export type RevenueTrendPoint = {
  month: string;
  quarter: string;
  budget: number;
  budgetMs?: number;
  budgetPs?: number;
  forecast: number;
  forecastMs?: number;
  forecastPs?: number;
  forecastLow: number;
  forecastHigh: number;
  actual: number;
  actualMs?: number;
  actualPs?: number;
  variance: number;
  variancePct: number;
  anomaly: boolean;
};

export type RevenueBreakdownRow = {
  label: string;
  budget: number;
  forecast?: number;
  outlook?: number;
  actual: number;
  variance: number;
  contributionPct?: number;
};

export type RevenueDashboardData = {
  database: {
    status: string;
    message: string;
  };
  selectedFilters: RevenueDashboardFilters & {
    financialYears: string[];
    geographies: string[];
    practices: string[];
    geoHeads: string[];
    bdms: string[];
    entities: string[];
    verticals: string[];
    accounts: string[];
    strategicAccounts: string[];
    dealTypes: string[];
    businessTypes: string[];
    eeennns: string[];
    periodFrom: string;
    periodTo: string;
    comparisonMode: "absolute" | "percentage";
    comparisonMetric: "budget_vs_actual" | "actual_vs_forecast" | "budget_vs_forecast";
    comparisonPeriod: "qoq" | "yoy";
    comparePrevious: boolean;
    breakdownDimension: "region" | "practice_head" | "bdm" | "customer_name";
    whatIfPct: number;
  };
  filters: {
    financialYears: string[];
    regions: string[];
    practiceHeads: string[];
    geoHeads: string[];
    entities: string[];
    verticals: string[];
    customerNames: string[];
    strategicAccounts: string[];
    dealTypes: string[];
    businessTypes: string[];
    eeennns: string[];
    bdms: string[];
    accounts: string[];
    periods: string[];
  };
  summary: {
    rowCount: number;
    resourceCount: number;
    customerCount: number;
    projectCount: number;
    totalBudget: number;
    totalOutlook: number;
    totalActual: number;
    totalVariance: number;
    totalsByMsps: {
      budget: {
        ms: number;
        ps: number;
      };
      forecast: {
        ms: number;
        ps: number;
      };
      actual: {
        ms: number;
        ps: number;
      };
    };
  };
  monthlySeries: RevenueTrendPoint[];
  topCustomers: RevenueBreakdownRow[];
  topRegions: RevenueBreakdownRow[];
  resourceTable: Array<{
    resourceId: string;
    resourceName: string;
    customerName: string;
    projectName: string;
    region: string;
    practiceHead: string;
    geoHead: string;
    billRate: number;
    startDate: string | null;
    endDate: string | null;
    budget: number;
    outlook: number;
    variance: number;
  }>;
  dataset: {
    uploadId: string | null;
    financialYear: string | null;
    originalFilename: string | null;
    uploadedAt: string | null;
    importedRows: number;
    parsedSheets: string[];
  };
  highlights: string[];
  comparison: {
    label: string;
    mode: "absolute" | "percentage";
    period: "qoq" | "yoy";
    currentValue: number;
    baselineValue: number;
    delta: number;
    deltaPct: number;
    previousValue: number | null;
    previousDelta: number | null;
    previousLabel: string | null;
  };
  trend: {
    rows: RevenueTrendPoint[];
    metric: "budget_vs_actual" | "actual_vs_forecast" | "budget_vs_forecast";
    fromPeriod: string;
    toPeriod: string;
    whatIfPct: number;
  };
  variance: {
    mode: "absolute" | "percentage";
    rows: Array<{
      month: string;
      variance: number;
      variancePct: number;
      tone: "positive" | "negative";
    }>;
  };
  contribution: {
    dimension: "region" | "practice_head" | "bdm" | "customer_name";
    dimensionLabel: string;
    rows: RevenueBreakdownRow[];
  };
  heatmap: {
    dimension: "region" | "practice_head" | "bdm" | "customer_name";
    xLabels: string[];
    yLabels: string[];
    cells: Array<{
      x: string;
      y: string;
      value: number;
      actual: number;
      intensity: number;
    }>;
    metric: string;
  };
  performers: {
    dimension: "region" | "practice_head" | "bdm" | "customer_name";
    rows: Array<{
      label: string;
      region: string;
      practiceHead: string;
      bdm: string;
      account: string;
      budget: number;
      forecast: number;
      actual: number;
      variance: number;
      variancePct: number;
      sparkline: number[];
      tone: "positive" | "negative";
    }>;
  };
  waterfall: {
    metric: string;
    steps: Array<{
      label: string;
      value: number;
      start: number;
      end: number;
      type: "total" | "increase" | "decrease";
    }>;
  };
  insights: Array<{
    tone: "positive" | "negative" | "warning" | "neutral";
    headline: string;
    detail: string;
  }>;
  sideBySide: {
    dimension: "bdm";
    left: {
      label: string;
      actual: number;
      forecast: number;
      variance: number;
      sparkline: number[];
    };
    right: {
      label: string;
      actual: number;
      forecast: number;
      variance: number;
      sparkline: number[];
    };
  } | null;
  exports: {
    csvRows: number;
    pngReady: boolean;
  };
  nlq: {
    supportedExamples: string[];
  };
  meta?: RevenueDashboardMeta;
};

export type RevenueDashboardFailureReason =
  | "unauthorized"
  | "forbidden"
  | "backend_unavailable"
  | "timeout";

export type RevenueDashboardMeta = {
  dataState: "fresh" | "stale" | "fallback";
  reason?: RevenueDashboardFailureReason;
  statusCode?: number;
  lastSuccessAt?: string | null;
};

export type RevenueDashboardDataSlice = Pick<
  RevenueDashboardData,
  "summary" | "dataset" | "monthlySeries"
> & {
  meta?: RevenueDashboardMeta;
};

type RevenueDashboardFetchResult<T> = {
  payload: T;
  meta: RevenueDashboardMeta;
};

const BACKEND_API_URL = process.env.BACKEND_API_URL ?? "http://127.0.0.1:8000";
export const CLIENT_BACKEND_API_URL =
  process.env.NEXT_PUBLIC_BACKEND_API_URL ?? "http://127.0.0.1:8000";
const BACKEND_FETCH_TIMEOUT_MS = Math.max(
  Number(process.env.BACKEND_FETCH_TIMEOUT_MS ?? 30000),
  1000,
);
const DASHBOARD_FETCH_CACHE_TTL_MS = Math.max(
  Number(process.env.RAPID_DASHBOARD_FETCH_CACHE_TTL_MS ?? 20000),
  0,
);
const DASHBOARD_FETCH_CACHE_MAX_ENTRIES = Math.max(
  Number(process.env.RAPID_DASHBOARD_FETCH_CACHE_MAX_ENTRIES ?? 256),
  64,
);
const dashboardFetchCache = new Map<
  string,
  { expiresAt: number; savedAt: number; value: unknown }
>();

function mapDashboardFailureReason(statusCode: number): RevenueDashboardFailureReason {
  if (statusCode === 401) {
    return "unauthorized";
  }
  if (statusCode === 403) {
    return "forbidden";
  }
  if (statusCode === 408 || statusCode === 504) {
    return "timeout";
  }
  return "backend_unavailable";
}

function pruneDashboardFetchCache(now: number) {
  for (const [key, entry] of dashboardFetchCache.entries()) {
    if (entry.expiresAt <= now) {
      dashboardFetchCache.delete(key);
    }
  }
  while (dashboardFetchCache.size > DASHBOARD_FETCH_CACHE_MAX_ENTRIES) {
    const oldestKey = dashboardFetchCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    dashboardFetchCache.delete(oldestKey);
  }
}

async function fetchBackendJsonWithMeta<T>(
  path: string,
  fallback: T,
  options?: {
    cacheable?: boolean;
    cacheKey?: string;
  },
): Promise<RevenueDashboardFetchResult<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BACKEND_FETCH_TIMEOUT_MS);
  const session = await getSessionProfile().catch(() => null);
  const cacheable = Boolean(options?.cacheable) && DASHBOARD_FETCH_CACHE_TTL_MS > 0;
  const scopeKey = session
    ? `${session.userId}:${session.role?.id ?? session.roleId ?? "unknown-role"}`
    : "anonymous";
  const responseCacheKey =
    options?.cacheKey && options.cacheKey.trim().length > 0
      ? `${scopeKey}:${options.cacheKey.trim()}`
      : `${scopeKey}:${path}`;
  const now = Date.now();
  const cached = cacheable ? dashboardFetchCache.get(responseCacheKey) : undefined;
  const cachedTimestamp = cached ? new Date(cached.savedAt).toISOString() : null;

  if (cacheable) {
    if (cached && cached.expiresAt > now) {
      return {
        payload: cached.value as T,
        meta: {
          dataState: "fresh",
          lastSuccessAt: cachedTimestamp,
        },
      };
    }
    if (cached && cached.expiresAt <= now) {
      dashboardFetchCache.delete(responseCacheKey);
    }
  }

  try {
    const response = await fetch(`${BACKEND_API_URL}${path}`, {
      cache: "no-store",
      headers: session ? buildBackendAuthHeaders(session) : undefined,
      signal: controller.signal,
    });

    if (!response.ok) {
      const reason = mapDashboardFailureReason(response.status);
      if (cached) {
        return {
          payload: cached.value as T,
          meta: {
            dataState: "stale",
            reason,
            statusCode: response.status,
            lastSuccessAt: cachedTimestamp,
          },
        };
      }
      return {
        payload: fallback,
        meta: {
          dataState: "fallback",
          reason,
          statusCode: response.status,
          lastSuccessAt: null,
        },
      };
    }

    const body = (await response.json()) as T;
    if (cacheable) {
      const savedAt = Date.now();
      dashboardFetchCache.set(responseCacheKey, {
        expiresAt: savedAt + DASHBOARD_FETCH_CACHE_TTL_MS,
        savedAt,
        value: body,
      });
      pruneDashboardFetchCache(savedAt);
    }

    return {
      payload: body,
      meta: {
        dataState: "fresh",
        lastSuccessAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    const reason: RevenueDashboardFailureReason =
      controller.signal.aborted ||
      (error instanceof DOMException && error.name === "AbortError")
        ? "timeout"
        : "backend_unavailable";
    if (cached) {
      return {
        payload: cached.value as T,
        meta: {
          dataState: "stale",
          reason,
          lastSuccessAt: cachedTimestamp,
        },
      };
    }
    return {
      payload: fallback,
      meta: {
        dataState: "fallback",
        reason,
        lastSuccessAt: null,
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}
 
async function fetchBackendJson<T>(path: string, fallback: T): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BACKEND_FETCH_TIMEOUT_MS);
  const session = await getSessionProfile().catch(() => null);

  try {
    const response = await fetch(`${BACKEND_API_URL}${path}`, {
      cache: "no-store",
      headers: session ? buildBackendAuthHeaders(session) : undefined,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Backend request failed for ${path}`);
    }

    return (await response.json()) as T;
  } catch {
    return fallback;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getBackendHealth() {
  return fetchBackendJson<BackendHealth>("/api/health", {
    service: "rapid-fastapi-backend",
    status: "offline",
    timestamp: new Date().toISOString(),
    database: {
      status: "offline",
      message: "Backend is unavailable.",
    },
  });
}

export async function getAdminOverview() {
  return fetchBackendJson<AdminOverview>("/api/admin/overview", {
    status: "offline",
    totals: {
      users: 0,
      activeUsers: 0,
      roles: 0,
      mfaRequired: 0,
      mfaEnrolled: 0,
      uploads: 0,
      locations: 0,
      mappedBudgetRows: 0,
    },
    budgetMapping: {
      latestBatchId: null,
      financialYear: null,
      updatedAt: null,
      summary: {
        totalRows: 0,
        validRows: 0,
        mappedRows: 0,
        autoEnrichedRows: 0,
        manualApprovedRows: 0,
        manualReviewRows: 0,
        unmatchedRows: 0,
        errorRows: 0,
        coveragePercent: 0,
      },
      mappedRows: [],
      logicalMappings: [],
    },
    latestUploads: [],
    localLlm: {
      assistantName: "Neural Switch",
      localLlmEnabled: false,
      localLlmBaseUrl: CLIENT_BACKEND_API_URL,
      localLlmPlatformBaseUrl: "",
      localLlmApiKey: "",
      localLlmModel: "Unavailable",
      localLlmTemperature: 0,
      defaultFinancialYear: "2026-2027",
      showRestrictedRoleBudgets: false,
    },
    users: [],
  });
}

export async function getAdminLocations() {
  return fetchBackendJson<AdminLocations>("/api/admin/locations", {
    geographies: [],
    practices: [],
    total: 0,
  });
}

export async function getAdminUploads() {
  return fetchBackendJson<AdminUploads>("/api/admin/uploads", {
    financialYears: [],
    uploads: [],
    total: 0,
  });
}

export async function getAdminSettings() {
  return fetchBackendJson<AdminSettingsResponse>("/api/admin/settings", {
    settings: {
      assistantName: "Neural Switch",
      localLlmEnabled: false,
      localLlmBaseUrl: CLIENT_BACKEND_API_URL,
      localLlmPlatformBaseUrl: "",
      localLlmApiKey: "",
      localLlmModel: "Unavailable",
      localLlmTemperature: 0,
      defaultFinancialYear: "2026-2027",
      showRestrictedRoleBudgets: false,
    },
    financialYears: [],
  });
}

export async function getAdminWorkingDays() {
  return fetchBackendJson<AdminWorkingDays>("/api/admin/working-days", {
    months: [
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
    ],
    countries: ["Global"],
    rows: [
      {
        country: "Global",
        workingDays: {
          "Apr 2026": 22,
          "May 2026": 22,
          "Jun 2026": 22,
          "Jul 2026": 22,
          "Aug 2026": 22,
          "Sep 2026": 22,
          "Oct 2026": 22,
          "Nov 2026": 22,
          "Dec 2026": 22,
          "Jan 2027": 22,
          "Feb 2027": 22,
          "Mar 2027": 22,
        },
      },
    ],
  });
}

export async function getRevenueWorkingDays() {
  return fetchBackendJson<AdminWorkingDays>("/api/revenue/working-days", {
    months: [
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
    ],
    countries: ["US", "IND", "MAL", "SIN", "ROW"],
    rows: [
      {
        country: "US",
        workingDays: {
          "Apr 2026": 22,
          "May 2026": 22,
          "Jun 2026": 22,
          "Jul 2026": 22,
          "Aug 2026": 22,
          "Sep 2026": 22,
          "Oct 2026": 22,
          "Nov 2026": 22,
          "Dec 2026": 22,
          "Jan 2027": 22,
          "Feb 2027": 22,
          "Mar 2027": 22,
        },
      },
    ],
  });
}

export async function getAdminForecastControl() {
  return fetchBackendJson<AdminForecastControl>("/api/admin/forecast-control", {
    lockinDay: 1,
    lockoutDay: 10,
    lockinDate: null,
    lockoutDate: null,
    rolloutStartMonth: "Apr 2026",
    activeMonth: "Apr 2026",
    visibleMonths: [
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
    ],
    lockedMonths: [],
    editableMonths: [
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
    ],
    submissionWindowOpen: true,
    updatedBy: null,
    updatedAt: null,
  });
}

export async function getAdminCustomerHolidays() {
  return fetchBackendJson<CustomerHolidayPayload>("/api/admin/customer-holidays", {
    rows: [],
    filters: {
      customers: [],
      bdms: [],
      practiceHeads: [],
    },
  });
}

export async function getAdminCustomerWorkingDays() {
  return fetchBackendJson<CustomerWorkingDaysPayload>("/api/admin/customer-working-days", {
    months: [
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
    ],
    rows: [],
    filters: {
      customers: [],
      bdms: [],
      practiceHeads: [],
      geoHeads: [],
    },
  });
}

export async function getScopedCustomerHolidays(scope?: {
  bdms?: string[];
  practiceHeads?: string[];
  geoHeads?: string[];
}) {
  const search = new URLSearchParams();
  (scope?.bdms ?? []).forEach((value) => search.append("bdms", value));
  (scope?.practiceHeads ?? []).forEach((value) => search.append("practiceHeads", value));
  (scope?.geoHeads ?? []).forEach((value) => search.append("geoHeads", value));
  const query = search.toString();
  return fetchBackendJson<CustomerHolidayPayload>(
    `/api/revenue/customer-holidays${query ? `?${query}` : ""}`,
    {
      rows: [],
      filters: {
        customers: [],
        bdms: [],
        practiceHeads: [],
      },
    },
  );
}

export async function getScopedCustomerHolidaysViaSession() {
  return fetchBackendJson<CustomerHolidayPayload>("/api/revenue/customer-holidays", {
    rows: [],
    filters: {
      customers: [],
      bdms: [],
      practiceHeads: [],
    },
  });
}

export async function getScopedCustomerWorkingDays(scope?: {
  bdms?: string[];
  practiceHeads?: string[];
  geoHeads?: string[];
}) {
  const search = new URLSearchParams();
  (scope?.bdms ?? []).forEach((value) => search.append("bdms", value));
  (scope?.practiceHeads ?? []).forEach((value) => search.append("practiceHeads", value));
  (scope?.geoHeads ?? []).forEach((value) => search.append("geoHeads", value));
  const query = search.toString();
  return fetchBackendJson<CustomerWorkingDaysPayload>(
    `/api/revenue/customer-working-days${query ? `?${query}` : ""}`,
    {
      months: [
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
      ],
      rows: [],
      filters: {
        customers: [],
        bdms: [],
        practiceHeads: [],
        geoHeads: [],
      },
    },
  );
}

export async function getRevenueNameOptions() {
  return fetchBackendJson<RevenueNameOptions>("/api/admin/revenue-name-options", {
    bdm: [],
    "practice-head": [],
    "geo-head": [],
  });
}

export async function getAdminAuditLogs(limit = 500) {
  const search = new URLSearchParams({ limit: String(limit) });
  return fetchBackendJson<AdminAuditLogsResponse>(`/api/admin/audit?${search.toString()}`, {
    logs: [],
    count: 0,
  });
}

export async function getAdminActivityOverview(limit = 250, activeWithinMinutes = 5) {
  const search = new URLSearchParams({
    limit: String(limit),
    activeWithinMinutes: String(activeWithinMinutes),
  });
  return fetchBackendJson<AdminActivityOverview>(`/api/admin/activity?${search.toString()}`, {
    summary: {
      activeCount: 0,
      trackedUsers: 0,
      sessionCount: 0,
    },
    activeWithinMinutes,
    users: [],
    sessions: [],
  });
}

export async function getWorkspaceDashboard(role: string, geo: string, practice: string) {
  const search = new URLSearchParams({ role, geo, practice });
  return fetchBackendJson<WorkspaceDashboard>(
    `/api/workspace/dashboard?${search.toString()}`,
    {
      headline: {
        title: "Revenue control tower",
        subtitle: "FastAPI backend is currently unavailable.",
      },
      cards: [],
      highlights: [],
    },
  );
}

export async function getWorkspaceSlicers() {
  return fetchBackendJson<WorkspaceSlicers>("/api/workspace/slicers", {
    geographies: [],
    practices: [],
    financialYears: [],
    recommendedViews: [],
  });
}

function buildRevenueDashboardSearch(filters: RevenueDashboardFilters = {}) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (Array.isArray(value)) {
      value
        .map((entry) => String(entry).trim())
        .filter(Boolean)
        .forEach((entry) => search.append(key, entry));
      continue;
    }

    if (typeof value === "boolean") {
      search.set(key, value ? "true" : "false");
      continue;
    }

    const normalized = String(value ?? "").trim();
    if (normalized) {
      search.set(key, normalized);
    }
  }

  return search.toString();
}

function getEmptyRevenueDashboard(
  filters: RevenueDashboardFilters = {},
): RevenueDashboardData {
  return {
    database: {
      status: "offline",
      message: "FastAPI backend is unavailable.",
    },
    selectedFilters: {
      ...filters,
      financialYears: filters.financialYears ?? [],
      geographies: filters.geographies ?? [],
      practices: filters.practices ?? [],
      geoHeads: filters.geoHeads ?? [],
      bdms: filters.bdms ?? [],
      entities: filters.entities ?? [],
      verticals: filters.verticals ?? [],
      accounts: filters.accounts ?? [],
      strategicAccounts: filters.strategicAccounts ?? [],
      dealTypes: filters.dealTypes ?? [],
      businessTypes: filters.businessTypes ?? [],
      eeennns: filters.eeennns ?? [],
      periodFrom: filters.periodFrom ?? "Apr",
      periodTo: filters.periodTo ?? "Mar",
      comparisonMode: filters.comparisonMode ?? "absolute",
      comparisonMetric: filters.comparisonMetric ?? "budget_vs_actual",
      comparisonPeriod: filters.comparisonPeriod ?? "qoq",
      comparePrevious: filters.comparePrevious ?? false,
      breakdownDimension: filters.breakdownDimension ?? "region",
      whatIfPct: filters.whatIfPct ?? 0,
    },
    filters: {
      financialYears: [],
      regions: [],
      practiceHeads: [],
      geoHeads: [],
      entities: [],
      verticals: [],
      customerNames: [],
      strategicAccounts: [],
      dealTypes: [],
      businessTypes: [],
      eeennns: [],
      bdms: [],
      accounts: [],
      periods: [],
    },
    summary: {
      rowCount: 0,
      resourceCount: 0,
      customerCount: 0,
      projectCount: 0,
      totalBudget: 0,
      totalOutlook: 0,
      totalActual: 0,
      totalVariance: 0,
      totalsByMsps: {
        budget: {
          ms: 0,
          ps: 0,
        },
        forecast: {
          ms: 0,
          ps: 0,
        },
        actual: {
          ms: 0,
          ps: 0,
        },
      },
    },
    monthlySeries: [],
    topCustomers: [],
    topRegions: [],
    resourceTable: [],
    dataset: {
      uploadId: null,
      financialYear: filters.financialYear ?? null,
      originalFilename: null,
      uploadedAt: null,
      importedRows: 0,
      parsedSheets: [],
    },
    highlights: ["Upload a workbook from admin to populate the dashboard."],
    comparison: {
      label: "Budget vs Actual",
      mode: "absolute",
      period: "qoq",
      currentValue: 0,
      baselineValue: 0,
      delta: 0,
      deltaPct: 0,
      previousValue: null,
      previousDelta: null,
      previousLabel: null,
    },
    trend: {
      rows: [],
      metric: "budget_vs_actual",
      fromPeriod: "Apr",
      toPeriod: "Mar",
      whatIfPct: 0,
    },
    variance: {
      mode: "absolute",
      rows: [],
    },
    contribution: {
      dimension: "region",
      dimensionLabel: "Geography",
      rows: [],
    },
    heatmap: {
      dimension: "region",
      xLabels: [],
      yLabels: [],
      cells: [],
      metric: "variance",
    },
    performers: {
      dimension: "region",
      rows: [],
    },
    waterfall: {
      metric: "budget_vs_actual",
      steps: [],
    },
    insights: [
      {
        tone: "neutral",
        headline: "Upload a workbook to unlock intelligent analysis.",
        detail: "FastAPI backend is unavailable.",
      },
    ],
    sideBySide: null,
    exports: {
      csvRows: 0,
      pngReady: false,
    },
    nlq: {
      supportedExamples: [],
    },
  };
}

export async function getRevenueDashboardData(
  filters: RevenueDashboardFilters = {},
) {
  const result = await getRevenueDashboardDataDetailed(filters);
  return result.payload;
}

export async function getRevenueDashboardDataDetailed(
  filters: RevenueDashboardFilters = {},
) {
  const search = buildRevenueDashboardSearch(filters);
  const result = await fetchBackendJsonWithMeta<RevenueDashboardData>(
    `/api/workspace/revenue-dashboard${search ? `?${search}` : ""}`,
    getEmptyRevenueDashboard(filters),
    {
      cacheable: true,
      cacheKey: `workspace-revenue-dashboard:${search}`,
    },
  );
  return {
    payload: {
      ...result.payload,
      meta: result.meta,
    },
    meta: result.meta,
  } satisfies RevenueDashboardFetchResult<RevenueDashboardData>;
}

export async function getRevenueOverviewData(
  filters: RevenueDashboardFilters = {},
) {
  const result = await getRevenueOverviewDataDetailed(filters);
  return result.payload;
}

export async function getRevenueOverviewDataDetailed(
  filters: RevenueDashboardFilters = {},
) {
  const search = buildRevenueDashboardSearch(filters);
  const emptyDashboard = getEmptyRevenueDashboard(filters);
  const result = await fetchBackendJsonWithMeta<RevenueDashboardDataSlice>(
    `/api/workspace/revenue-overview${search ? `?${search}` : ""}`,
    {
      summary: emptyDashboard.summary,
      dataset: emptyDashboard.dataset,
      monthlySeries: emptyDashboard.monthlySeries,
    },
    {
      cacheable: true,
      cacheKey: `workspace-revenue-overview:${search}`,
    },
  );
  return {
    payload: {
      ...result.payload,
      meta: result.meta,
    },
    meta: result.meta,
  } satisfies RevenueDashboardFetchResult<RevenueDashboardDataSlice>;
}
