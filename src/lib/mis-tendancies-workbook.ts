import path from "node:path";
import { existsSync, statSync } from "node:fs";

import * as XLSX from "xlsx";

type WorkbookCellObject = XLSX.CellObject;
type WorkbookSheet = XLSX.WorkSheet;

export type MisSheetSection = {
  id: string;
  title: string;
  subtitle?: string;
  labelKey: string;
  headers: string[];
  numericKeys: string[];
  rows: Array<Record<string, string | number>>;
  notes: string[];
};

export type MisSheetPage = {
  id: string;
  name: string;
  labelKey: string;
  headers: string[];
  numericKeys: string[];
  rows: Array<Record<string, string | number>>;
  sections: MisSheetSection[];
};

type WorkbookCell = string | number | null;
type RowCluster = {
  startRowIndex: number;
  rows: WorkbookCell[][];
};

const MAX_PARSED_ROWS = 420;

function toText(value: unknown) {
  return String(value ?? "").trim();
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const normalized = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(normalized) ? normalized : null;
}

function normalizeCell(value: unknown) {
  const numeric = toNumber(value);
  if (numeric !== null) {
    return numeric;
  }
  const text = toText(value);
  return text || "";
}

function resolveUsedRange(sheet: WorkbookSheet | undefined) {
  if (!sheet) {
    return null;
  }
  const addresses = Object.keys(sheet).filter((key) => !key.startsWith("!"));
  if (addresses.length === 0) {
    return null;
  }

  let minRow = Number.POSITIVE_INFINITY;
  let minCol = Number.POSITIVE_INFINITY;
  let maxRow = 0;
  let maxCol = 0;

  for (const address of addresses) {
    const cell = sheet[address];
    if (!cell) {
      continue;
    }
    const rawValue = (cell as WorkbookCellObject).v;
    if (rawValue === undefined || rawValue === null || toText(rawValue) === "") {
      continue;
    }
    const decoded = XLSX.utils.decode_cell(address);
    minRow = Math.min(minRow, decoded.r);
    minCol = Math.min(minCol, decoded.c);
    maxRow = Math.max(maxRow, decoded.r);
    maxCol = Math.max(maxCol, decoded.c);
  }

  if (!Number.isFinite(minRow) || !Number.isFinite(minCol)) {
    return null;
  }

  return { s: { r: minRow, c: minCol }, e: { r: maxRow, c: maxCol } };
}

function countNonEmptyCells(row: WorkbookCell[]) {
  return row.reduce<number>((count, value) => count + (toText(value) !== "" ? 1 : 0), 0);
}

function rowToLine(row: WorkbookCell[]) {
  return row.map((value) => toText(value)).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function trimTrailingEmptyCells(row: WorkbookCell[]) {
  let endIndex = row.length;
  while (endIndex > 0 && toText(row[endIndex - 1]) === "") {
    endIndex -= 1;
  }
  return row.slice(0, endIndex);
}

export function slugifyMisSheetName(value: string, fallback: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

function makeUniqueHeaders(headers: string[]) {
  const counts = new Map<string, number>();
  return headers.map((header, index) => {
    const fallback = header || `Column ${index + 1}`;
    const key = fallback.toLowerCase();
    const current = counts.get(key) ?? 0;
    counts.set(key, current + 1);
    if (current === 0) {
      return fallback;
    }
    return `${fallback} (${current + 1})`;
  });
}

function fillHeaderRowGaps(row: WorkbookCell[], columnCount: number) {
  const normalized: string[] = [];
  let activeLabel = "";
  for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
    const text = toText(row[columnIndex]);
    if (text) {
      activeLabel = text;
      normalized.push(text);
      continue;
    }
    normalized.push(activeLabel);
  }
  return normalized;
}

function combineHeaderRows(rows: WorkbookCell[][]) {
  const columnCount = Math.max(0, ...rows.map((row) => row.length));
  const normalizedRows = rows.map((row) => fillHeaderRowGaps(row, columnCount));
  const headers = Array.from({ length: columnCount }, (_, columnIndex) => {
    const parts = normalizedRows
      .map((row) => row[columnIndex])
      .filter(Boolean)
      .filter((part, partIndex, items) => partIndex === 0 || part !== items[partIndex - 1]);
    return parts.join(" ").replace(/\s+/g, " ").trim();
  });
  return makeUniqueHeaders(headers);
}

function buildRowClusters(rows: WorkbookCell[][]): RowCluster[] {
  const clusters: RowCluster[] = [];
  let clusterStart = -1;
  let blankRun = 0;

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    if (countNonEmptyCells(row) > 0) {
      if (clusterStart === -1) {
        clusterStart = rowIndex;
      }
      blankRun = 0;
      continue;
    }

    if (clusterStart === -1) {
      continue;
    }

    blankRun += 1;
    if (blankRun >= 2) {
      const clusterEnd = rowIndex - blankRun;
      clusters.push({
        startRowIndex: clusterStart,
        rows: rows.slice(clusterStart, clusterEnd + 1),
      });
      clusterStart = -1;
      blankRun = 0;
    }
  }

  if (clusterStart !== -1) {
    clusters.push({
      startRowIndex: clusterStart,
      rows: rows.slice(clusterStart),
    });
  }

  return clusters;
}

function parseClusterAsSection(cluster: RowCluster, sectionIndex: number): MisSheetSection | null {
  if (cluster.rows.length === 0) {
    return null;
  }

  let headerRowIndex = 0;
  let maxHeaderCount = 0;
  for (let rowIndex = 0; rowIndex < Math.min(cluster.rows.length, 5); rowIndex += 1) {
    const nonEmptyCount = countNonEmptyCells(cluster.rows[rowIndex] ?? []);
    if (nonEmptyCount > maxHeaderCount) {
      maxHeaderCount = nonEmptyCount;
      headerRowIndex = rowIndex;
    }
  }

  if (maxHeaderCount <= 1) {
    return null;
  }

  const nextRowCount = countNonEmptyCells(cluster.rows[headerRowIndex + 1] ?? []);
  const headerRowCount = nextRowCount >= Math.max(2, Math.floor(maxHeaderCount * 0.45)) ? 2 : 1;
  const titleLines = cluster.rows.slice(0, headerRowIndex).map(rowToLine).filter(Boolean);
  const headers = combineHeaderRows(cluster.rows.slice(headerRowIndex, headerRowIndex + headerRowCount));
  if (headers.length === 0) {
    return null;
  }

  const rows: Array<Record<string, string | number>> = [];
  const notes: string[] = [];

  for (const rawRow of cluster.rows.slice(headerRowIndex + headerRowCount)) {
    if (countNonEmptyCells(rawRow) === 0) {
      continue;
    }

    const noteText = rowToLine(rawRow);
    if (/^(note|remarks?)\b/i.test(noteText) && countNonEmptyCells(rawRow) <= 4) {
      notes.push(noteText);
      continue;
    }

    const rowObject: Record<string, string | number> = {};
    let hasValue = false;

    headers.forEach((header, columnIndex) => {
      const normalizedValue = normalizeCell(rawRow[columnIndex]);
      rowObject[header] = normalizedValue;
      if (normalizedValue !== "") {
        hasValue = true;
      }
    });

    if (hasValue) {
      rows.push(rowObject);
    }
  }

  const numericKeys = headers.filter((header) => rows.some((row) => typeof row[header] === "number"));
  const labelKey = headers.find((header) => !numericKeys.includes(header)) ?? headers[0] ?? "Row Labels";
  const title = titleLines[0] || rowToLine(cluster.rows[headerRowIndex] ?? []) || `Section ${sectionIndex + 1}`;
  const subtitle = titleLines.slice(1).join(" ").trim();

  return {
    id: `section-${sectionIndex + 1}-${slugifyMisSheetName(title, `section-${sectionIndex + 1}`)}`,
    title,
    subtitle: subtitle || undefined,
    labelKey,
    headers,
    numericKeys,
    rows,
    notes,
  };
}

function parseMisWorkbook(filePath: string): MisSheetPage[] {
  if (!existsSync(filePath)) {
    return [];
  }

  try {
    const workbook = XLSX.readFile(filePath, {
      cellDates: true,
      cellFormula: false,
      dense: false,
    });

    return workbook.SheetNames.map((sheetName, sheetIndex) => {
      const worksheet = workbook.Sheets[sheetName];
      const range = resolveUsedRange(worksheet);
      if (!range || !worksheet) {
        return {
          id: `sheet-${sheetIndex + 1}`,
          name: sheetName,
          labelKey: "Row Labels",
          headers: ["Row Labels"],
          numericKeys: [],
          rows: [],
          sections: [],
        } satisfies MisSheetPage;
      }

      const rawRows = XLSX.utils
        .sheet_to_json<WorkbookCell[]>(worksheet, {
          header: 1,
          range,
          raw: true,
          defval: null,
          blankrows: true,
        })
        .slice(0, MAX_PARSED_ROWS)
        .map((row) => trimTrailingEmptyCells(row ?? []));

      const clusters = buildRowClusters(rawRows);
      const sections: MisSheetSection[] = [];

      for (const cluster of clusters) {
        const parsedSection = parseClusterAsSection(cluster, sections.length);
        if (parsedSection) {
          sections.push(parsedSection);
          continue;
        }

        const looseNotes = cluster.rows.map(rowToLine).filter(Boolean);
        if (looseNotes.length > 0) {
          if (sections.length === 0) {
            sections.push({
              id: `section-1-${slugifyMisSheetName(sheetName, "overview")}`,
              title: sheetName,
              subtitle: undefined,
              labelKey: "Notes",
              headers: ["Notes"],
              numericKeys: [],
              rows: looseNotes.map((note) => ({ Notes: note })),
              notes: [],
            });
          } else {
            sections[sections.length - 1].notes.push(...looseNotes);
          }
        }
      }

      const primarySection = sections.find((section) => section.rows.length > 0) ?? sections[0];

      return {
        id: slugifyMisSheetName(sheetName, `sheet-${sheetIndex + 1}`),
        name: sheetName,
        labelKey: primarySection?.labelKey ?? "Row Labels",
        headers: primarySection?.headers ?? ["Row Labels"],
        numericKeys: primarySection?.numericKeys ?? [],
        rows: primarySection?.rows ?? [],
        sections,
      } satisfies MisSheetPage;
    });
  } catch {
    return [];
  }
}

let cachedMisWorkbook: {
  filePath: string;
  mtimeMs: number;
  sheets: MisSheetPage[];
} | null = null;

const WORKBOOK_BASENAMES = [
  "MIS-Graphs.xlsx",
  "MIS-Graphs.server.xlsx",
  "mis-graphs.xlsx",
  "mis-graphs.server.xlsx",
  "MIS.xlsx",
  "MIS.server.xlsx",
  "mis.xlsx",
  "mis.server.xlsx",
];

function resolveDefaultWorkbookPath() {
  const explicit = [
    process.env.RAPID_MIS_WORKBOOK_PATH,
    process.env.MIS_WORKBOOK_PATH,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  const cwd = path.resolve(/*turbopackIgnore: true*/ process.cwd());
  const parent = path.resolve(cwd, "..");
  const grandparent = path.resolve(parent, "..");
  const localCandidates = [cwd, parent, grandparent].flatMap((basePath) =>
    WORKBOOK_BASENAMES.map((name) => path.join(basePath, name)),
  );

  const candidates: string[] = [
    ...explicit.map((candidate) => path.resolve(candidate)),
    ...localCandidates,
    "/home/user/rapid/current/MIS-Graphs.xlsx",
    "/home/user/rapid/current/MIS-Graphs.server.xlsx",
    "/home/user/rapid/current/MIS.xlsx",
    "/home/user/rapid/current/MIS.server.xlsx",
  ];

  const unique = Array.from(new Set(candidates));
  const found = unique.find((candidate) => existsSync(candidate));
  return found ?? path.join(cwd, WORKBOOK_BASENAMES[0]);
}

export function readMisWorkbook(filePath?: string) {
  const resolvedPath = filePath ? path.resolve(filePath) : resolveDefaultWorkbookPath();
  try {
    if (!existsSync(resolvedPath)) {
      return [];
    }
    const mtimeMs = statSync(resolvedPath).mtimeMs;
    if (
      cachedMisWorkbook &&
      cachedMisWorkbook.filePath === resolvedPath &&
      cachedMisWorkbook.mtimeMs === mtimeMs
    ) {
      return cachedMisWorkbook.sheets;
    }

    const parsed = parseMisWorkbook(resolvedPath);
    if (parsed.length > 0) {
      cachedMisWorkbook = {
        filePath: resolvedPath,
        mtimeMs,
        sheets: parsed,
      };
    }
    return parsed;
  } catch {
    return [];
  }
}

export const readMisTrendsWorkbook = readMisWorkbook;
