import type { RevenueDashboardFilters } from "@/lib/backend-api";
import { getCurrentFinancialYear } from "@/lib/financial-years";

export type RevenueDashboardSearchParams = {
  [key: string]: string | string[] | undefined;
};

const GLOBAL_SLICER_ARRAY_MAP = {
  financialYear: "financialYear",
  rowUs: "geographies",
  practiceHeads: "practices",
  geoHeads: "geoHeads",
  bdms: "bdms",
  entities: "entities",
  verticals: "verticals",
  customerNames: "accounts",
  strategicAccounts: "strategicAccounts",
  dealTypes: "dealTypes",
  msps: "businessTypes",
  eeennns: "eeennns",
} as const;

function getArrayParam(
  params: RevenueDashboardSearchParams,
  key: string,
) {
  const value = params[key];
  if (Array.isArray(value)) {
    return value.map((entry) => entry.trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  return [];
}

function getStringParam(
  params: RevenueDashboardSearchParams,
  key: string,
) {
  const value = params[key];
  if (Array.isArray(value)) {
    return value[0]?.trim() || undefined;
  }
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return undefined;
}

function getBooleanParam(
  params: RevenueDashboardSearchParams,
  key: string,
) {
  const value = getStringParam(params, key);
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return undefined;
}

function getNumberParam(
  params: RevenueDashboardSearchParams,
  key: string,
) {
  const value = getStringParam(params, key);
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function mergeStringLists(...lists: string[][]) {
  return Array.from(
    new Set(
      lists.flatMap((list) => list.map((entry) => entry.trim()).filter(Boolean)),
    ),
  );
}

export function buildRevenueDashboardFiltersFromSearchParams(
  params: RevenueDashboardSearchParams,
): RevenueDashboardFilters {
  const filters: RevenueDashboardFilters = {};

  const financialYears = mergeStringLists(
    getArrayParam(params, "financialYears"),
    getArrayParam(params, GLOBAL_SLICER_ARRAY_MAP.financialYear),
  );
  const geographies = mergeStringLists(
    getArrayParam(params, "geographies"),
    getArrayParam(params, GLOBAL_SLICER_ARRAY_MAP.rowUs),
  );
  const practices = mergeStringLists(
    getArrayParam(params, "practices"),
    getArrayParam(params, GLOBAL_SLICER_ARRAY_MAP.practiceHeads),
  );
  const geoHeads = mergeStringLists(
    getArrayParam(params, "geoHeads"),
    getArrayParam(params, GLOBAL_SLICER_ARRAY_MAP.geoHeads),
  );
  const bdms = mergeStringLists(
    getArrayParam(params, "bdms"),
    getArrayParam(params, GLOBAL_SLICER_ARRAY_MAP.bdms),
  );
  const entities = mergeStringLists(
    getArrayParam(params, "entities"),
    getArrayParam(params, GLOBAL_SLICER_ARRAY_MAP.entities),
  );
  const verticals = mergeStringLists(
    getArrayParam(params, "verticals"),
    getArrayParam(params, GLOBAL_SLICER_ARRAY_MAP.verticals),
  );
  const accounts = mergeStringLists(
    getArrayParam(params, "accounts"),
    getArrayParam(params, GLOBAL_SLICER_ARRAY_MAP.customerNames),
  );
  const strategicAccounts = mergeStringLists(
    getArrayParam(params, "strategicAccounts"),
    getArrayParam(params, GLOBAL_SLICER_ARRAY_MAP.strategicAccounts),
  );
  const dealTypes = mergeStringLists(
    getArrayParam(params, "dealTypes"),
    getArrayParam(params, GLOBAL_SLICER_ARRAY_MAP.dealTypes),
  );
  const businessTypes = mergeStringLists(
    getArrayParam(params, "businessTypes"),
    getArrayParam(params, GLOBAL_SLICER_ARRAY_MAP.msps),
  );
  const eeennns = mergeStringLists(
    getArrayParam(params, "eeennns"),
    getArrayParam(params, GLOBAL_SLICER_ARRAY_MAP.eeennns),
  );

  filters.financialYears = financialYears.length ? financialYears : [getCurrentFinancialYear()];
  if (geographies.length) {
    filters.geographies = geographies;
  }
  if (practices.length) {
    filters.practices = practices;
  }
  if (geoHeads.length) {
    filters.geoHeads = geoHeads;
  }
  if (bdms.length) {
    filters.bdms = bdms;
  }
  if (entities.length) {
    filters.entities = entities;
  }
  if (verticals.length) {
    filters.verticals = verticals;
  }
  if (accounts.length) {
    filters.accounts = accounts;
  }
  if (strategicAccounts.length) {
    filters.strategicAccounts = strategicAccounts;
  }
  if (dealTypes.length) {
    filters.dealTypes = dealTypes;
  }
  if (businessTypes.length) {
    filters.businessTypes = businessTypes;
  }
  if (eeennns.length) {
    filters.eeennns = eeennns;
  }

  const periodFrom = getStringParam(params, "periodFrom");
  const periodTo = getStringParam(params, "periodTo");
  const comparisonMode = getStringParam(params, "comparisonMode");
  const comparisonMetric = getStringParam(params, "comparisonMetric");
  const comparisonPeriod = getStringParam(params, "comparisonPeriod");
  const comparePrevious = getBooleanParam(params, "comparePrevious");
  const breakdownDimension = getStringParam(params, "breakdownDimension");
  const whatIfPct = getNumberParam(params, "whatIfPct");

  if (periodFrom) {
    filters.periodFrom = periodFrom;
  }
  if (periodTo) {
    filters.periodTo = periodTo;
  }
  if (comparisonMode === "absolute" || comparisonMode === "percentage") {
    filters.comparisonMode = comparisonMode;
  }
  if (
    comparisonMetric === "budget_vs_actual" ||
    comparisonMetric === "actual_vs_forecast" ||
    comparisonMetric === "budget_vs_forecast"
  ) {
    filters.comparisonMetric = comparisonMetric;
  }
  if (comparisonPeriod === "qoq" || comparisonPeriod === "yoy") {
    filters.comparisonPeriod = comparisonPeriod;
  }
  if (typeof comparePrevious === "boolean") {
    filters.comparePrevious = comparePrevious;
  }
  if (
    breakdownDimension === "region" ||
    breakdownDimension === "practice_head" ||
    breakdownDimension === "bdm" ||
    breakdownDimension === "customer_name"
  ) {
    filters.breakdownDimension = breakdownDimension;
  }
  if (typeof whatIfPct === "number") {
    filters.whatIfPct = whatIfPct;
  }

  return filters;
}

function mergeScopedValues(requested: string[] | undefined, allowed: string[] | undefined) {
  if (!allowed || allowed.length === 0) {
    return requested;
  }
  if (!requested || requested.length === 0) {
    return allowed;
  }

  const allowedMap = new Map(
    allowed
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => [value.toLowerCase(), value] as const),
  );

  return Array.from(
    new Set(
      requested
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => allowedMap.get(value.toLowerCase()))
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

export function mergeScopedRevenueDashboardFilters(
  requested: RevenueDashboardFilters,
  scope: {
    practiceHeads?: string[];
    geoHeads?: string[];
    bdms?: string[];
    entities?: string[];
    verticals?: string[];
  },
): RevenueDashboardFilters {
  return {
    ...requested,
    practices: mergeScopedValues(requested.practices, scope.practiceHeads),
    geoHeads: mergeScopedValues(requested.geoHeads, scope.geoHeads),
    bdms: mergeScopedValues(requested.bdms, scope.bdms),
    entities: mergeScopedValues(requested.entities, scope.entities),
    verticals: mergeScopedValues(requested.verticals, scope.verticals),
  };
}
