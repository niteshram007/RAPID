export type ReconciliationCell = string | number | boolean | null;
export type ReconciliationRow = Record<string, ReconciliationCell>;

export type MasterdataReconciliationResult = {
  generatedAt: string;
  financialYear: string;
  mappingExplanation: string[];
  summary: {
    budgetRows: number;
    actualRows: number;
    autoApproved: number;
    reviewRecommended: number;
    reviewRequired: number;
    unmapped: number;
  };
  tables: {
    referenceMaster: ReconciliationRow[];
    customerMaster: ReconciliationRow[];
    projectMaster: ReconciliationRow[];
    employeeMaster: ReconciliationRow[];
    organizationMaster: ReconciliationRow[];
    entityMaster: ReconciliationRow[];
    aliasMapping: ReconciliationRow[];
    identifierMapping: ReconciliationRow[];
    groupedByOcn: ReconciliationRow[];
    groupedByEmpId: ReconciliationRow[];
    nameNormalization: ReconciliationRow[];
    budgetNotInActuals: ReconciliationRow[];
    actualsNotInBudget: ReconciliationRow[];
    exceptions: ReconciliationRow[];
    recordRecommendations: ReconciliationRow[];
  };
};

type SourceFile = "Budget" | "Global Revenue";
type MatchStatus = "Auto Approved" | "Review Recommended" | "Review Required" | "Unmapped";

type CanonicalRecord = {
  sourceFile: SourceFile;
  sourceRow: number;
  customerName: string;
  projectName: string;
  resourceName: string;
  empId: string;
  normalizedEmpId: string;
  ocnProjectReference: string;
  normalizedOcnProjectReference: string;
  bdm: string;
  msps: string;
  vertical: string;
  horizontal: string;
  practiceHead: string;
  geoHead: string;
  buh: string;
  salesRegion: string;
  deliveryManager: string;
  entity: string;
  grEntity: string;
  rowUs: string;
  strategicAccount: string;
  dealType: string;
  cleanedCustomerName: string;
  cleanedProjectName: string;
  cleanedResourceName: string;
  cleanedEntityName: string;
};

type StandardCustomer = {
  code: string;
  standardName: string;
  cleanedName: string;
  strategicAccount: string;
  salesRegion: string;
  rowUs: string;
};

type StandardProject = {
  code: string;
  standardName: string;
  cleanedName: string;
  customerCode: string;
  customerName: string;
  dealType: string;
  msps: string;
  ocnProjectReference: string;
};

type StandardEmployee = {
  code: string;
  sourceEmpId: string;
  standardResourceName: string;
  cleanedName: string;
  msps: string;
};

type StandardEntity = {
  code: string;
  standardName: string;
  cleanedName: string;
  grEntity: string;
  rowUs: string;
};

type StandardOrganization = {
  code: string;
  bdm: string;
  practiceHead: string;
  geoHead: string;
  buh: string;
  deliveryManager: string;
  vertical: string;
  horizontal: string;
  salesRegion: string;
};

type ReferenceDescriptor = {
  key: string;
  logic: string;
};

type MatchResolution = {
  status: MatchStatus;
  confidence: number;
  method: string;
  standardCode: string;
  standardValue: string;
  reviewRequired: boolean;
  suggestedMatch: string;
};

const FIELD_ALIASES = {
  customerName: ["customer_name", "customer name", "customer", "updated customer", "updated customer name", "client name"],
  projectName: ["project_name", "project name", "project", "project title"],
  resourceName: ["resource_name", "resource name", "employee name", "emp name", "name"],
  empId: ["resource_id", "resource id", "emp id", "employee id", "employee_id", "emp_id", "source emp id", "source_emp_id"],
  ocnProjectReference: ["ocn_number", "ocn number", "ocn", "project reference", "project_ref", "project reference code", "ocn / project reference"],
  bdm: ["bdm"],
  msps: ["ms_ps", "ms/ps", "bdm ms/ps", "business_type", "business type"],
  vertical: ["vertical"],
  horizontal: ["horizontal"],
  practiceHead: ["practice_head", "practice head"],
  geoHead: ["geo_head", "geo head", "geohead"],
  buh: ["buh", "business unit head", "business_unit_head"],
  salesRegion: ["sales_region", "sales region", "region"],
  deliveryManager: ["delivery_manager", "delivery manager"],
  entity: ["entity", "company"],
  grEntity: ["gr_entity", "gr entity"],
  rowUs: ["row_us", "row/us", "row us"],
  strategicAccount: ["strategic_account", "strategic account"],
  dealType: ["deal_type", "deal type"],
} as const;

const LEGAL_SUFFIXES = new Set([
  "ltd",
  "limited",
  "llc",
  "llp",
  "inc",
  "corp",
  "corporation",
  "co",
  "company",
  "plc",
  "gmbh",
  "pvt",
  "private",
]);

const SAFE_GENERIC_TOKENS = new Set(["services", "solutions", "technologies", "technology"]);

function normalizeHeaderKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
}

function toText(value: unknown) {
  return String(value ?? "").trim();
}

function toTitleCase(value: string) {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token[0]?.toUpperCase() + token.slice(1))
    .join(" ");
}

function normalizeMsPs(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized.startsWith("ms")) {
    return "MS";
  }
  if (normalized.startsWith("ps")) {
    return "PS";
  }
  return "";
}

function normalizeUsaRow(value: string) {
  const compact = value.toUpperCase().replace(/[^A-Z]/g, "");
  if (
    compact === "US" ||
    compact === "USA" ||
    compact === "UNITEDSTATES" ||
    compact === "UNITEDSTATESOFAMERICA" ||
    compact === "NORTHAMERICA"
  ) {
    return "USA";
  }
  if (compact === "ROW" || compact === "RESTOFWORLD") {
    return "ROW";
  }
  return value.trim();
}

function cleanName(rawValue: string) {
  let value = rawValue.toLowerCase().trim();
  if (!value) {
    return "";
  }

  value = value
    .replace(/limitted/g, "limited")
    .replace(/pvt\.?\s*ltd\.?/g, "private limited")
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  let tokens = value.split(" ").filter(Boolean);

  while (tokens.length >= 2) {
    const lastTwo = `${tokens[tokens.length - 2]} ${tokens[tokens.length - 1]}`;
    if (lastTwo === "private limited") {
      tokens = tokens.slice(0, -2);
      continue;
    }
    break;
  }

  while (tokens.length > 0 && LEGAL_SUFFIXES.has(tokens[tokens.length - 1])) {
    tokens = tokens.slice(0, -1);
  }

  if (tokens.length > 1) {
    const genericFiltered = tokens.filter((token) => !SAFE_GENERIC_TOKENS.has(token));
    if (genericFiltered.length > 0) {
      tokens = genericFiltered;
    }
  }

  return tokens.join(" ").trim();
}

function cleanIdentifier(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
}

function bigramSet(value: string) {
  const text = ` ${value} `;
  const output = new Set<string>();
  for (let index = 0; index < text.length - 1; index += 1) {
    output.add(text.slice(index, index + 2));
  }
  return output;
}

function similarityPercent(left: string, right: string) {
  const a = left.trim().toLowerCase();
  const b = right.trim().toLowerCase();
  if (!a || !b) {
    return 0;
  }
  if (a === b) {
    return 100;
  }

  const leftTokens = new Set(a.split(/\s+/).filter(Boolean));
  const rightTokens = new Set(b.split(/\s+/).filter(Boolean));
  const tokenIntersection = Array.from(leftTokens).filter((token) => rightTokens.has(token)).length;
  const tokenUnion = new Set([...leftTokens, ...rightTokens]).size;
  const tokenScore = tokenUnion > 0 ? (tokenIntersection / tokenUnion) * 100 : 0;

  const bigramsA = bigramSet(a);
  const bigramsB = bigramSet(b);
  const bigramIntersection = Array.from(bigramsA).filter((token) => bigramsB.has(token)).length;
  const bigramScore = ((2 * bigramIntersection) / (bigramsA.size + bigramsB.size)) * 100;

  const containsScore =
    a.includes(b) || b.includes(a)
      ? (Math.min(a.length, b.length) / Math.max(a.length, b.length)) * 100
      : 0;

  return Math.round(Math.max(tokenScore, bigramScore, containsScore));
}

function statusFromConfidence(confidence: number, exact: boolean): MatchStatus {
  if (exact || confidence >= 100) {
    return "Auto Approved";
  }
  if (confidence >= 90) {
    return "Review Recommended";
  }
  if (confidence >= 80) {
    return "Review Required";
  }
  return "Unmapped";
}

function readAliasValue(row: Record<string, unknown>, aliases: readonly string[]) {
  const byNormalized = new Map<string, unknown>();
  for (const [key, value] of Object.entries(row)) {
    byNormalized.set(normalizeHeaderKey(key), value);
  }
  for (const alias of aliases) {
    const hit = byNormalized.get(normalizeHeaderKey(alias));
    if (hit !== undefined && toText(hit)) {
      return toText(hit);
    }
  }
  return "";
}

function parseCanonicalRecord(row: Record<string, unknown>, sourceFile: SourceFile, sourceRow: number): CanonicalRecord {
  const customerName = readAliasValue(row, FIELD_ALIASES.customerName);
  const projectName = readAliasValue(row, FIELD_ALIASES.projectName);
  const resourceName = readAliasValue(row, FIELD_ALIASES.resourceName);
  const empId = readAliasValue(row, FIELD_ALIASES.empId);
  const ocnProjectReference = readAliasValue(row, FIELD_ALIASES.ocnProjectReference);
  const msps = normalizeMsPs(readAliasValue(row, FIELD_ALIASES.msps));

  const entityRaw = readAliasValue(row, FIELD_ALIASES.entity);
  const rowUsRaw = readAliasValue(row, FIELD_ALIASES.rowUs) || readAliasValue(row, FIELD_ALIASES.salesRegion);

  return {
    sourceFile,
    sourceRow,
    customerName,
    projectName,
    resourceName,
    empId,
    normalizedEmpId: cleanIdentifier(empId),
    ocnProjectReference,
    normalizedOcnProjectReference: cleanIdentifier(ocnProjectReference),
    bdm: readAliasValue(row, FIELD_ALIASES.bdm),
    msps,
    vertical: readAliasValue(row, FIELD_ALIASES.vertical),
    horizontal: readAliasValue(row, FIELD_ALIASES.horizontal),
    practiceHead: readAliasValue(row, FIELD_ALIASES.practiceHead),
    geoHead: readAliasValue(row, FIELD_ALIASES.geoHead),
    buh: readAliasValue(row, FIELD_ALIASES.buh),
    salesRegion: readAliasValue(row, FIELD_ALIASES.salesRegion),
    deliveryManager: readAliasValue(row, FIELD_ALIASES.deliveryManager),
    entity: entityRaw,
    grEntity: readAliasValue(row, FIELD_ALIASES.grEntity),
    rowUs: normalizeUsaRow(rowUsRaw),
    strategicAccount: readAliasValue(row, FIELD_ALIASES.strategicAccount),
    dealType: readAliasValue(row, FIELD_ALIASES.dealType),
    cleanedCustomerName: cleanName(customerName),
    cleanedProjectName: cleanName(projectName),
    cleanedResourceName: cleanName(resourceName),
    cleanedEntityName: cleanName(entityRaw),
  };
}

function resolvePrimaryKey(record: CanonicalRecord): ReferenceDescriptor {
  const hasOcn = Boolean(record.normalizedOcnProjectReference);
  const hasEmpId = Boolean(record.normalizedEmpId);

  if (record.msps === "MS" && hasOcn) {
    return {
      key: `OCN:${record.normalizedOcnProjectReference}`,
      logic: "MS primary rule: normalized OCN Number",
    };
  }

  if (record.msps === "PS" && hasEmpId) {
    return {
      key: `EMP:${record.normalizedEmpId}`,
      logic: "PS primary rule: normalized Emp ID",
    };
  }

  if (record.msps === "MS" && hasEmpId) {
    return {
      key: `EMP:${record.normalizedEmpId}`,
      logic: "MS fallback rule: Emp ID used because OCN Number is missing",
    };
  }

  if (record.msps === "PS" && hasOcn) {
    return {
      key: `OCN:${record.normalizedOcnProjectReference}`,
      logic: "PS fallback rule: OCN Number used because Emp ID is missing",
    };
  }

  if (hasOcn) {
    return {
      key: `OCN:${record.normalizedOcnProjectReference}`,
      logic: "Fallback rule: normalized OCN Number (MS/PS missing or inconsistent)",
    };
  }

  if (hasEmpId) {
    return {
      key: `EMP:${record.normalizedEmpId}`,
      logic: "Fallback rule: normalized Emp ID (MS/PS missing or inconsistent)",
    };
  }

  if (record.msps === "MS") {
    return {
      key: "",
      logic: "MS primary rule failed: OCN Number missing",
    };
  }

  if (record.msps === "PS") {
    return {
      key: "",
      logic: "PS primary rule failed: Emp ID missing",
    };
  }

  return {
    key: "",
    logic: "MS/PS not available and both OCN Number and Emp ID are missing",
  };
}

function resolveNameMatchType(actualNormalized: string, budgetNormalized: string) {
  const actual = toText(actualNormalized);
  const budget = toText(budgetNormalized);
  if (!actual && !budget) {
    return "Unknown";
  }
  if (actual && budget && actual === budget) {
    return "Same";
  }
  return "Different";
}

function resolveMappingRuleLabel(record: CanonicalRecord, primaryKey: ReferenceDescriptor) {
  if (primaryKey.key.startsWith("OCN:")) {
    return record.msps === "MS"
      ? "MS by OCN Number"
      : "OCN Number fallback";
  }
  if (primaryKey.key.startsWith("EMP:")) {
    return record.msps === "PS"
      ? "PS by Emp ID"
      : "Emp ID fallback";
  }
  return "Missing OCN and Emp ID";
}

function resolveGroupStatus(referenceCode: string): MatchStatus {
  return referenceCode ? "Auto Approved" : "Unmapped";
}

function resolveGroupComparisonNote(referenceCode: string, identifierLabel: string) {
  if (referenceCode) {
    return `Mapped through strict ${identifierLabel} matching.`;
  }
  return `No matching budget row found for this ${identifierLabel}.`;
}

function nextCode(prefix: string, index: number) {
  return `${prefix}-${String(index).padStart(4, "0")}`;
}

function resolveEntityStandardName(record: CanonicalRecord) {
  if (record.entity) {
    return record.entity;
  }
  if (record.grEntity) {
    return record.grEntity;
  }
  return "Unknown Entity";
}

function normalizeStatusCount(aliasRows: ReconciliationRow[], status: MatchStatus) {
  return aliasRows.filter((row) => String(row["Mapping Status"] || "") === status).length;
}

function matchToStandard(
  cleanedValue: string,
  standards: Array<{ code: string; value: string; cleaned: string }>,
): MatchResolution {
  if (!cleanedValue) {
    return {
      status: "Unmapped",
      confidence: 0,
      method: "none",
      standardCode: "",
      standardValue: "",
      reviewRequired: true,
      suggestedMatch: "",
    };
  }

  const exact = standards.find((item) => item.cleaned === cleanedValue);
  if (exact) {
    return {
      status: "Auto Approved",
      confidence: 100,
      method: "exact_cleaned",
      standardCode: exact.code,
      standardValue: exact.value,
      reviewRequired: false,
      suggestedMatch: exact.value,
    };
  }

  let best: { code: string; value: string; cleaned: string; score: number } | null = null;
  for (const candidate of standards) {
    const score = similarityPercent(cleanedValue, candidate.cleaned);
    if (!best || score > best.score) {
      best = { ...candidate, score };
    }
  }

  if (!best) {
    return {
      status: "Unmapped",
      confidence: 0,
      method: "none",
      standardCode: "",
      standardValue: "",
      reviewRequired: true,
      suggestedMatch: "",
    };
  }

  const status = statusFromConfidence(best.score, false);
  return {
    status,
    confidence: best.score,
    method: "fuzzy",
    standardCode: status === "Unmapped" ? "" : best.code,
    standardValue: status === "Unmapped" ? "" : best.value,
    reviewRequired: status !== "Auto Approved",
    suggestedMatch: best.value,
  };
}

export function buildMasterdataReconciliation(input: {
  financialYear: string;
  budgetRows: Array<Record<string, unknown>>;
  actualRows: Array<Record<string, unknown>>;
}) : MasterdataReconciliationResult {
  const budget = input.budgetRows.map((row, index) => parseCanonicalRecord(row, "Budget", index + 1));
  const actual = input.actualRows.map((row, index) => parseCanonicalRecord(row, "Global Revenue", index + 1));

  const aliasMapping: ReconciliationRow[] = [];
  const exceptions: ReconciliationRow[] = [];
  const recordRecommendations: ReconciliationRow[] = [];
  const referenceMaster: ReconciliationRow[] = [];
  const customerMaster: ReconciliationRow[] = [];
  const projectMaster: ReconciliationRow[] = [];
  const employeeMaster: ReconciliationRow[] = [];
  const organizationMaster: ReconciliationRow[] = [];
  const entityMaster: ReconciliationRow[] = [];
  const identifierMapping: ReconciliationRow[] = [];
  const groupedByOcn: ReconciliationRow[] = [];
  const groupedByEmpId: ReconciliationRow[] = [];
  const nameNormalization: ReconciliationRow[] = [];
  const budgetNotInActuals: ReconciliationRow[] = [];
  const actualsNotInBudget: ReconciliationRow[] = [];

  const customerByCleaned = new Map<string, StandardCustomer>();
  const projectByComposite = new Map<string, StandardProject>();
  const employeeByKey = new Map<string, StandardEmployee>();
  const entityByCleaned = new Map<string, StandardEntity>();
  const organizationByComposite = new Map<string, StandardOrganization>();
  const budgetReferenceKeys = new Map<string, string>();
  const budgetReferenceDetails = new Map<
    string,
    {
      referenceCode: string;
      sourceRow: number;
      customerName: string;
      cleanedCustomerName: string;
      projectName: string;
      cleanedProjectName: string;
      resourceName: string;
      cleanedResourceName: string;
      msps: string;
      ocnProjectReference: string;
      empId: string;
    }
  >();
  const matchedBudgetReferenceKeys = new Set<string>();

  let customerIndex = 1;
  let projectIndex = 1;
  let employeeIndex = 1;
  let entityIndex = 1;
  let organizationIndex = 1;
  let referenceIndex = 1;

  const addException = (entry: ReconciliationRow) => {
    exceptions.push({
      "Source File": entry["Source File"] ?? "",
      "Source Column Name": entry["Source Column Name"] ?? "",
      "Source Value": entry["Source Value"] ?? "",
      "Cleaned Matching Value": entry["Cleaned Matching Value"] ?? "",
      "Suggested Match": entry["Suggested Match"] ?? "",
      "Match Confidence": entry["Match Confidence"] ?? 0,
      "Issue Type": entry["Issue Type"] ?? "",
      "Mapping Status": entry["Mapping Status"] ?? "Unmapped",
      "Action Required": entry["Action Required"] ?? "Review master alias mapping",
      "Reviewer Comment": entry["Reviewer Comment"] ?? "",
    });
  };

  for (const row of budget) {
    if (!row.cleanedCustomerName) {
      continue;
    }
    if (!customerByCleaned.has(row.cleanedCustomerName)) {
      const standard: StandardCustomer = {
        code: nextCode("CUS", customerIndex),
        standardName: row.customerName || toTitleCase(row.cleanedCustomerName) || "Unknown Customer",
        cleanedName: row.cleanedCustomerName,
        strategicAccount: row.strategicAccount,
        salesRegion: row.salesRegion,
        rowUs: row.rowUs,
      };
      customerIndex += 1;
      customerByCleaned.set(row.cleanedCustomerName, standard);
      customerMaster.push({
        "Standard Customer Code": standard.code,
        "Standard Customer Name": standard.standardName,
        "Cleaned Customer Name": standard.cleanedName,
        "Source Customer Name": row.customerName,
        "Alias Customer Name": row.customerName,
        "Source File": row.sourceFile,
        "Strategic Account": standard.strategicAccount,
        "Sales Region": standard.salesRegion,
        "ROW/US": standard.rowUs,
        "Active/Inactive Status": "Active",
        "Notes": "Baseline from budget",
      });
    }

    const cust = customerByCleaned.get(row.cleanedCustomerName);
    if (!cust) {
      continue;
    }

    const projectComposite = `${cust.code}|${row.cleanedProjectName}`;
    if (row.cleanedProjectName && !projectByComposite.has(projectComposite)) {
      const standardProject: StandardProject = {
        code: nextCode("PRJ", projectIndex),
        standardName: row.projectName || toTitleCase(row.cleanedProjectName) || "Unknown Project",
        cleanedName: row.cleanedProjectName,
        customerCode: cust.code,
        customerName: cust.standardName,
        dealType: row.dealType,
        msps: row.msps,
        ocnProjectReference: row.ocnProjectReference,
      };
      projectIndex += 1;
      projectByComposite.set(projectComposite, standardProject);
      projectMaster.push({
        "Standard Project Code": standardProject.code,
        "Standard Project Name": standardProject.standardName,
        "Cleaned Project Name": standardProject.cleanedName,
        "Source Project Name": row.projectName,
        "Alias Project Name": row.projectName,
        "Source File": row.sourceFile,
        "Customer Code": standardProject.customerCode,
        "Customer Name": standardProject.customerName,
        "Deal Type": standardProject.dealType,
        "MS/PS": standardProject.msps,
        "OCN / Project Reference": standardProject.ocnProjectReference,
        "Active/Inactive Status": "Active",
        "Notes": "Baseline from budget",
      });
    }

    const employeeKey = row.normalizedEmpId ? `emp:${row.normalizedEmpId}` : row.cleanedResourceName ? `name:${row.cleanedResourceName}` : "";
    if (employeeKey && !employeeByKey.has(employeeKey)) {
      const standardEmployee: StandardEmployee = {
        code: nextCode("EMP", employeeIndex),
        sourceEmpId: row.empId,
        standardResourceName: row.resourceName || toTitleCase(row.cleanedResourceName) || "Unknown Resource",
        cleanedName: row.cleanedResourceName,
        msps: row.msps,
      };
      employeeIndex += 1;
      employeeByKey.set(employeeKey, standardEmployee);
      employeeMaster.push({
        "Standard Emp ID": standardEmployee.code,
        "Source Emp ID": standardEmployee.sourceEmpId,
        "Standard Resource Name": standardEmployee.standardResourceName,
        "Source Resource Name": row.resourceName,
        "Alias Resource Name": row.resourceName,
        "MS/PS": standardEmployee.msps,
        "Active/Inactive Status": "Active",
        "Notes": "Baseline from budget",
      });
    }

    const cleanedEntity = row.cleanedEntityName || cleanName(resolveEntityStandardName(row));
    if (cleanedEntity && !entityByCleaned.has(cleanedEntity)) {
      const standardEntity: StandardEntity = {
        code: nextCode("ENT", entityIndex),
        standardName: resolveEntityStandardName(row),
        cleanedName: cleanedEntity,
        grEntity: row.grEntity,
        rowUs: row.rowUs,
      };
      entityIndex += 1;
      entityByCleaned.set(cleanedEntity, standardEntity);
      entityMaster.push({
        "Standard Entity Code": standardEntity.code,
        "Standard Entity Name": standardEntity.standardName,
        "Source Entity Name": row.entity,
        "GR Entity": row.grEntity,
        "Alias Entity Name": row.entity,
        "ROW/US": standardEntity.rowUs,
        "Active/Inactive Status": "Active",
        "Notes": "Baseline from budget",
      });
    }

    const orgKey = [
      row.bdm.toLowerCase(),
      row.practiceHead.toLowerCase(),
      row.geoHead.toLowerCase(),
      row.buh.toLowerCase(),
      row.deliveryManager.toLowerCase(),
      row.vertical.toLowerCase(),
      row.horizontal.toLowerCase(),
      row.salesRegion.toLowerCase(),
    ].join("|");
    if (orgKey && !organizationByComposite.has(orgKey)) {
      const standardOrganization: StandardOrganization = {
        code: nextCode("ORG", organizationIndex),
        bdm: row.bdm,
        practiceHead: row.practiceHead,
        geoHead: row.geoHead,
        buh: row.buh,
        deliveryManager: row.deliveryManager,
        vertical: row.vertical,
        horizontal: row.horizontal,
        salesRegion: row.salesRegion,
      };
      organizationIndex += 1;
      organizationByComposite.set(orgKey, standardOrganization);
      organizationMaster.push({
        "Standard Org Code": standardOrganization.code,
        "BDM": standardOrganization.bdm,
        "Practice Head": standardOrganization.practiceHead,
        "Geo Head": standardOrganization.geoHead,
        "BUH": standardOrganization.buh,
        "Delivery Manager": standardOrganization.deliveryManager,
        "Vertical": standardOrganization.vertical,
        "Horizontal": standardOrganization.horizontal,
        "Sales Region": standardOrganization.salesRegion,
        "Active/Inactive Status": "Active",
        "Notes": "Baseline from budget",
      });
    }

    const reference = resolvePrimaryKey(row);
    const project = projectByComposite.get(projectComposite);
    const referenceCode = nextCode("REF", referenceIndex);
    referenceIndex += 1;

    if (reference.key) {
      budgetReferenceKeys.set(reference.key, referenceCode);
      budgetReferenceDetails.set(reference.key, {
        referenceCode,
        sourceRow: row.sourceRow,
        customerName: row.customerName,
        cleanedCustomerName: row.cleanedCustomerName,
        projectName: row.projectName,
        cleanedProjectName: row.cleanedProjectName,
        resourceName: row.resourceName,
        cleanedResourceName: row.cleanedResourceName,
        msps: row.msps,
        ocnProjectReference: row.ocnProjectReference,
        empId: row.empId,
      });
    } else {
      addException({
        "Source File": row.sourceFile,
        "Source Column Name": "Primary Matching Key",
        "Source Value": `${row.customerName} | ${row.projectName} | ${row.empId} | ${row.ocnProjectReference}`,
        "Cleaned Matching Value": "",
        "Suggested Match": "",
        "Match Confidence": 0,
        "Issue Type": "Missing primary key",
        "Mapping Status": "Unmapped",
        "Action Required": "Populate OCN Number and/or Emp ID in master data",
      });
    }

    referenceMaster.push({
      "Standard Reference Code": referenceCode,
      "MS/PS": row.msps,
      "Primary Matching Key": reference.key,
      "Matching Logic": reference.logic,
        "OCN / Project Reference": row.ocnProjectReference,
        "Normalized OCN": row.normalizedOcnProjectReference,
        "Emp ID": row.empId,
        "Normalized Emp ID": row.normalizedEmpId,
      "Standard Project Code": project?.code ?? "",
      "Standard Customer Code": cust.code,
      "Active/Inactive Status": "Active",
      "Notes": "Baseline from budget",
    });

    recordRecommendations.push({
      "Source File": row.sourceFile,
      "Source Row": row.sourceRow,
      "MS/PS": row.msps,
      "Source Customer Name": row.customerName,
      "Source Project Name": row.projectName,
      "Source Resource Name": row.resourceName,
      "Recommended Final Matching Key": reference.key,
      "Matching Logic": reference.logic,
      "Match Confidence": reference.key ? 100 : 0,
      "Mapping Status": reference.key ? "Auto Approved" : "Unmapped",
      "Notes": "Budget baseline. Primary key uses OCN for MS and Emp ID for PS; cleaned names are alias evidence only.",
    });
  }

  const customerStandards = Array.from(customerByCleaned.values()).map((item) => ({
    code: item.code,
    value: item.standardName,
    cleaned: item.cleanedName,
  }));
  const projectStandards = Array.from(projectByComposite.values()).map((item) => ({
    code: item.code,
    value: item.standardName,
    cleaned: item.cleanedName,
  }));
  const entityStandards = Array.from(entityByCleaned.values()).map((item) => ({
    code: item.code,
    value: item.standardName,
    cleaned: item.cleanedName,
  }));
  const employeeStandards = Array.from(employeeByKey.values()).map((item) => ({
    code: item.code,
    value: item.standardResourceName,
    cleaned: item.cleanedName,
  }));

  for (const row of actual) {
    const customerMatch = matchToStandard(row.cleanedCustomerName, customerStandards);
    const projectMatch = matchToStandard(row.cleanedProjectName, projectStandards);
    const entityMatch = matchToStandard(row.cleanedEntityName, entityStandards);

    const employeeExact = row.normalizedEmpId
      ? employeeByKey.get(`emp:${row.normalizedEmpId}`)
      : undefined;
    const employeeMatch = employeeExact
      ? {
          status: "Auto Approved" as MatchStatus,
          confidence: 100,
          method: "exact_emp_id",
          standardCode: employeeExact.code,
          standardValue: employeeExact.standardResourceName,
          reviewRequired: false,
          suggestedMatch: employeeExact.standardResourceName,
        }
      : matchToStandard(row.cleanedResourceName, employeeStandards);

    const primaryKey = resolvePrimaryKey(row);
    const referenceCode = primaryKey.key ? budgetReferenceKeys.get(primaryKey.key) ?? "" : "";
    const referenceDetail = primaryKey.key ? budgetReferenceDetails.get(primaryKey.key) : undefined;
    const ocnReferenceKey = row.normalizedOcnProjectReference
      ? `OCN:${row.normalizedOcnProjectReference}`
      : "";
    const ocnReferenceCode = ocnReferenceKey
      ? budgetReferenceKeys.get(ocnReferenceKey) ?? ""
      : "";
    const ocnReferenceDetail = ocnReferenceKey
      ? budgetReferenceDetails.get(ocnReferenceKey)
      : undefined;
    const empReferenceKey = row.normalizedEmpId
      ? `EMP:${row.normalizedEmpId}`
      : "";
    const empReferenceCode = empReferenceKey
      ? budgetReferenceKeys.get(empReferenceKey) ?? ""
      : "";
    const empReferenceDetail = empReferenceKey
      ? budgetReferenceDetails.get(empReferenceKey)
      : undefined;
    const referenceStatus: MatchStatus = referenceCode ? "Auto Approved" : "Unmapped";
    const referenceConfidence = referenceCode ? 100 : 0;
    if (referenceCode && primaryKey.key) {
      matchedBudgetReferenceKeys.add(primaryKey.key);
    }

    identifierMapping.push({
      "Source File": row.sourceFile,
      "Source Row": row.sourceRow,
      "MS/PS": row.msps,
      "Mapping Rule": resolveMappingRuleLabel(row, primaryKey),
      "Primary Matching Key": primaryKey.key,
      "Actual Customer": row.customerName,
      "Budget Customer": referenceDetail?.customerName ?? "",
      "Actual Project": row.projectName,
      "Budget Project": referenceDetail?.projectName ?? "",
      "Actual Resource": row.resourceName,
      "Budget Resource": referenceDetail?.resourceName ?? "",
      "OCN Number": row.ocnProjectReference,
      "Emp ID": row.empId,
      "Reference Code": referenceCode,
      "Mapping Status": referenceStatus,
      "Notes": referenceCode
        ? "Mapped to budget through strict identifier logic."
        : "Present in actuals but no matching budget identifier was found.",
    });

    if (row.normalizedOcnProjectReference) {
      const groupCustomerMatchType = resolveNameMatchType(
        row.cleanedCustomerName,
        ocnReferenceDetail?.cleanedCustomerName ?? "",
      );
      const groupProjectMatchType = resolveNameMatchType(
        row.cleanedProjectName,
        ocnReferenceDetail?.cleanedProjectName ?? "",
      );
      groupedByOcn.push({
        "OCN Number": row.ocnProjectReference || row.normalizedOcnProjectReference,
        "Mapping Status": resolveGroupStatus(ocnReferenceCode),
        "Reference Code": ocnReferenceCode,
        "Actual Customer": row.customerName,
        "Budget Customer": ocnReferenceDetail?.customerName ?? "",
        "Actual Customer (Normalized)": row.cleanedCustomerName,
        "Budget Customer (Normalized)": ocnReferenceDetail?.cleanedCustomerName ?? "",
        "Customer Name Match": groupCustomerMatchType,
        "Actual Project": row.projectName,
        "Budget Project": ocnReferenceDetail?.projectName ?? "",
        "Actual Project (Normalized)": row.cleanedProjectName,
        "Budget Project (Normalized)": ocnReferenceDetail?.cleanedProjectName ?? "",
        "Project Name Match": groupProjectMatchType,
        "Actual Resource": row.resourceName,
        "Budget Resource": ocnReferenceDetail?.resourceName ?? "",
        "Normalization Basis": "Actual normalized against budget normalized",
        "Notes": resolveGroupComparisonNote(ocnReferenceCode, "OCN"),
      });
    }

    if (row.normalizedEmpId) {
      const groupCustomerMatchType = resolveNameMatchType(
        row.cleanedCustomerName,
        empReferenceDetail?.cleanedCustomerName ?? "",
      );
      const groupProjectMatchType = resolveNameMatchType(
        row.cleanedProjectName,
        empReferenceDetail?.cleanedProjectName ?? "",
      );
      groupedByEmpId.push({
        "Emp ID": row.empId || row.normalizedEmpId,
        "Mapping Status": resolveGroupStatus(empReferenceCode),
        "Reference Code": empReferenceCode,
        "Actual Customer": row.customerName,
        "Budget Customer": empReferenceDetail?.customerName ?? "",
        "Actual Customer (Normalized)": row.cleanedCustomerName,
        "Budget Customer (Normalized)": empReferenceDetail?.cleanedCustomerName ?? "",
        "Customer Name Match": groupCustomerMatchType,
        "Actual Project": row.projectName,
        "Budget Project": empReferenceDetail?.projectName ?? "",
        "Actual Project (Normalized)": row.cleanedProjectName,
        "Budget Project (Normalized)": empReferenceDetail?.cleanedProjectName ?? "",
        "Project Name Match": groupProjectMatchType,
        "Actual Resource": row.resourceName,
        "Budget Resource": empReferenceDetail?.resourceName ?? "",
        "Actual Resource (Normalized)": row.cleanedResourceName,
        "Budget Resource (Normalized)": empReferenceDetail?.cleanedResourceName ?? "",
        "Normalization Basis": "Actual normalized against budget normalized",
        "Notes": resolveGroupComparisonNote(empReferenceCode, "Emp ID"),
      });
    }

    if (!referenceCode) {
      actualsNotInBudget.push({
        "Source Row": row.sourceRow,
        "MS/PS": row.msps,
        "Customer Name": row.customerName,
        "Project Name": row.projectName,
        "Resource Name": row.resourceName,
        "OCN Number": row.ocnProjectReference,
        "Emp ID": row.empId,
        "Primary Matching Key": primaryKey.key,
        "Cleaned Customer Name": row.cleanedCustomerName,
        "Cleaned Project Name": row.cleanedProjectName,
        "Reason": primaryKey.key
          ? "Actuals identifier is not present in budget."
          : "Actuals row is missing the strict identifier needed for matching.",
      });
    }

    const aliasRows: Array<{
      attributeType: string;
      sourceColumn: string;
      sourceValue: string;
      cleaned: string;
      match: MatchResolution;
      notes: string;
    }> = [
      {
        attributeType: "Customer Name",
        sourceColumn: "Customer Name",
        sourceValue: row.customerName,
        cleaned: row.cleanedCustomerName,
        match: customerMatch,
        notes: "Global Revenue to Budget customer alias",
      },
      {
        attributeType: "Project Name",
        sourceColumn: "Project Name",
        sourceValue: row.projectName,
        cleaned: row.cleanedProjectName,
        match: projectMatch,
        notes: "Global Revenue to Budget project alias",
      },
      {
        attributeType: "Resource Name",
        sourceColumn: row.empId ? "Emp ID / Resource Name" : "Resource Name",
        sourceValue: row.empId || row.resourceName,
        cleaned: row.normalizedEmpId || row.cleanedResourceName,
        match: employeeMatch,
        notes: "PS rows use normalized Emp ID as the primary key; resource-name similarity is only alias evidence.",
      },
      {
        attributeType: "Entity",
        sourceColumn: "Entity / Company",
        sourceValue: row.entity,
        cleaned: row.cleanedEntityName,
        match: entityMatch,
        notes: "Entity harmonization for Budget vs Global Revenue",
      },
    ];

    for (const alias of aliasRows) {
      aliasMapping.push({
        "Attribute Type": alias.attributeType,
        "Source File": row.sourceFile,
        "Source Column Name": alias.sourceColumn,
        "Source Value": alias.sourceValue,
        "Cleaned Matching Value": alias.cleaned,
        "Standard Code": alias.match.standardCode,
        "Standard Value": alias.match.standardValue,
        "Match Method": alias.match.method,
        "Match Confidence": alias.match.confidence,
        "Mapping Status": alias.match.status,
        "Review Required": alias.match.reviewRequired ? "Yes" : "No",
        "Notes": alias.notes,
      });

      if (alias.match.status === "Unmapped") {
        addException({
          "Source File": row.sourceFile,
          "Source Column Name": alias.sourceColumn,
          "Source Value": alias.sourceValue,
          "Cleaned Matching Value": alias.cleaned,
          "Suggested Match": alias.match.suggestedMatch,
          "Match Confidence": alias.match.confidence,
          "Issue Type": `${alias.attributeType} confidence below threshold`,
          "Mapping Status": alias.match.status,
          "Action Required": "Review in alias mapping table",
        });
      }

      const sourceValue = toText(alias.sourceValue);
      const standardValue = toText(alias.match.standardValue);
      if (
        sourceValue &&
        standardValue &&
        alias.match.status !== "Unmapped" &&
        sourceValue.toLowerCase() !== standardValue.toLowerCase()
      ) {
        nameNormalization.push({
          "Attribute Type": alias.attributeType,
          "Source File": row.sourceFile,
          "Source Row": row.sourceRow,
          "Actual Value": sourceValue,
          "Budget Standard Value": standardValue,
          "Cleaned Matching Value": alias.cleaned,
          "Match Method": alias.match.method,
          "Match Confidence": alias.match.confidence,
          "Mapping Status": alias.match.status,
          "Notes": alias.notes,
        });
      }
    }

    if (!primaryKey.key) {
      addException({
        "Source File": row.sourceFile,
        "Source Column Name": "Primary Matching Key",
        "Source Value": `${row.customerName} | ${row.projectName} | ${row.empId} | ${row.ocnProjectReference}`,
        "Cleaned Matching Value": "",
        "Suggested Match": "",
        "Match Confidence": 0,
        "Issue Type": "Missing strict identifier inputs",
        "Mapping Status": "Unmapped",
        "Action Required": "Populate OCN Number and/or Emp ID in source data",
      });
    } else if (!referenceCode) {
      addException({
        "Source File": row.sourceFile,
        "Source Column Name": "Primary Matching Key",
        "Source Value": primaryKey.key,
        "Cleaned Matching Value": primaryKey.key,
        "Suggested Match": "",
        "Match Confidence": 0,
        "Issue Type": "No matching budget reference key",
        "Mapping Status": "Unmapped",
        "Action Required": "Create/update reference master alias",
      });
    }

    recordRecommendations.push({
      "Source File": row.sourceFile,
      "Source Row": row.sourceRow,
      "MS/PS": row.msps,
      "Source Customer Name": row.customerName,
      "Source Project Name": row.projectName,
      "Source Resource Name": row.resourceName,
      "Recommended Final Matching Key": primaryKey.key,
      "Matching Logic": primaryKey.logic,
      "Match Confidence": referenceConfidence,
      "Mapping Status": referenceStatus,
      "Notes": referenceCode
        ? `Matched to ${referenceCode} using strict ${primaryKey.key.startsWith("OCN:") ? "OCN" : primaryKey.key.startsWith("EMP:") ? "Emp ID" : "identifier"} logic.`
        : "Needs manual master-data review because the strict OCN/Emp ID key did not match budget.",
    });
  }

  for (const [referenceKey, detail] of budgetReferenceDetails.entries()) {
    if (!referenceKey || matchedBudgetReferenceKeys.has(referenceKey)) {
      continue;
    }
    budgetNotInActuals.push({
      "Source Row": detail.sourceRow,
      "MS/PS": detail.msps,
      "Primary Matching Key": referenceKey,
      "Reference Code": detail.referenceCode,
      "Customer Name": detail.customerName,
      "Project Name": detail.projectName,
      "Resource Name": detail.resourceName,
      "OCN Number": detail.ocnProjectReference,
      "Emp ID": detail.empId,
      "Customer Name (Normalized)": detail.cleanedCustomerName,
      "Project Name (Normalized)": detail.cleanedProjectName,
      "Reason": "Budget identifier has no matching row in actuals for this financial year.",
    });
  }

  const generatedAt = new Date().toISOString();
  const autoApproved = normalizeStatusCount(aliasMapping, "Auto Approved");
  const reviewRecommended = normalizeStatusCount(aliasMapping, "Review Recommended");
  const reviewRequired = normalizeStatusCount(aliasMapping, "Review Required");
  const unmapped = normalizeStatusCount(aliasMapping, "Unmapped") + exceptions.length;

  return {
    generatedAt,
    financialYear: input.financialYear,
    mappingExplanation: [
      "MS rows are matched by normalized OCN Number only. Spaces, punctuation, and case are removed before comparison.",
      "PS rows are matched by normalized Emp ID only. Spaces, punctuation, and case are removed before comparison.",
      "When MS/PS is missing or inconsistent but OCN Number or Emp ID exists, fallback identifier grouping is applied to prevent false unmapped records.",
      "Customer, project, resource, and entity names are cleaned for alias review: legal suffixes, punctuation, extra spaces, and common minor spelling differences are normalized before fuzzy scoring.",
      "Name similarity can recommend aliases, but it does not override the strict OCN/Emp ID primary matching key.",
    ],
    summary: {
      budgetRows: budget.length,
      actualRows: actual.length,
      autoApproved,
      reviewRecommended,
      reviewRequired,
      unmapped,
    },
    tables: {
      referenceMaster,
      customerMaster,
      projectMaster,
      employeeMaster,
      organizationMaster,
      entityMaster,
      aliasMapping,
      identifierMapping,
      groupedByOcn,
      groupedByEmpId,
      nameNormalization,
      budgetNotInActuals,
      actualsNotInBudget,
      exceptions,
      recordRecommendations,
    },
  };
}
