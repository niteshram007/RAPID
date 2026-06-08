"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.readMisWorkbook = readMisWorkbook;
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = require("node:fs");
const XLSX = __importStar(require("xlsx"));
const MAX_PARSED_ROWS = 420;
function toText(value) {
    return String(value ?? "").trim();
}
function toNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    const normalized = Number(String(value ?? "").replace(/,/g, "").trim());
    return Number.isFinite(normalized) ? normalized : null;
}
function normalizeCell(value) {
    const numeric = toNumber(value);
    if (numeric !== null) {
        return numeric;
    }
    const text = toText(value);
    return text || "";
}
function resolveUsedRange(sheet) {
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
        const rawValue = cell.v;
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
function countNonEmptyCells(row) {
    return row.reduce((count, value) => count + (toText(value) !== "" ? 1 : 0), 0);
}
function rowToLine(row) {
    return row.map((value) => toText(value)).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}
function trimTrailingEmptyCells(row) {
    let endIndex = row.length;
    while (endIndex > 0 && toText(row[endIndex - 1]) === "") {
        endIndex -= 1;
    }
    return row.slice(0, endIndex);
}
function slugify(value, fallback) {
    const slug = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return slug || fallback;
}
function makeUniqueHeaders(headers) {
    const counts = new Map();
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
function fillHeaderRowGaps(row, columnCount) {
    const normalized = [];
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
function combineHeaderRows(rows) {
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
function buildRowClusters(rows) {
    const clusters = [];
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
function parseClusterAsSection(cluster, sectionIndex) {
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
    const rows = [];
    const notes = [];
    for (const rawRow of cluster.rows.slice(headerRowIndex + headerRowCount)) {
        if (countNonEmptyCells(rawRow) === 0) {
            continue;
        }
        const noteText = rowToLine(rawRow);
        if (/^(note|remarks?)\b/i.test(noteText) && countNonEmptyCells(rawRow) <= 4) {
            notes.push(noteText);
            continue;
        }
        const rowObject = {};
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
        id: `section-${sectionIndex + 1}-${slugify(title, `section-${sectionIndex + 1}`)}`,
        title,
        subtitle: subtitle || undefined,
        labelKey,
        headers,
        numericKeys,
        rows,
        notes,
    };
}
function parseMisWorkbook(filePath) {
    if (!(0, node_fs_1.existsSync)(filePath)) {
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
                };
            }
            const rawRows = XLSX.utils
                .sheet_to_json(worksheet, {
                header: 1,
                range,
                raw: true,
                defval: null,
                blankrows: true,
            })
                .slice(0, MAX_PARSED_ROWS)
                .map((row) => trimTrailingEmptyCells(row ?? []));
            const clusters = buildRowClusters(rawRows);
            const sections = [];
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
                            id: `section-1-${slugify(sheetName, "overview")}`,
                            title: sheetName,
                            subtitle: undefined,
                            labelKey: "Notes",
                            headers: ["Notes"],
                            numericKeys: [],
                            rows: looseNotes.map((note) => ({ Notes: note })),
                            notes: [],
                        });
                    }
                    else {
                        sections[sections.length - 1].notes.push(...looseNotes);
                    }
                }
            }
            const primarySection = sections.find((section) => section.rows.length > 0) ?? sections[0];
            return {
                id: `sheet-${sheetIndex + 1}-${slugify(sheetName, `sheet-${sheetIndex + 1}`)}`,
                name: sheetName,
                labelKey: primarySection?.labelKey ?? "Row Labels",
                headers: primarySection?.headers ?? ["Row Labels"],
                numericKeys: primarySection?.numericKeys ?? [],
                rows: primarySection?.rows ?? [],
                sections,
            };
        });
    }
    catch {
        return [];
    }
}
let cachedMisWorkbook = null;
function resolveDefaultWorkbookPath() {
    const explicit = [
        process.env.RAPID_MIS_WORKBOOK_PATH,
        process.env.MIS_WORKBOOK_PATH,
    ]
        .map((value) => String(value || "").trim())
        .filter(Boolean);
    const cwd = node_path_1.default.resolve(process.cwd());
    const candidates = [
        ...explicit.map((candidate) => node_path_1.default.resolve(candidate)),
        node_path_1.default.join(cwd, "MIS.xlsx"),
        node_path_1.default.join(cwd, "rapid", "current", "MIS.xlsx"),
        node_path_1.default.resolve(cwd, "..", "MIS.xlsx"),
        node_path_1.default.resolve(cwd, "..", "..", "MIS.xlsx"),
        node_path_1.default.resolve(cwd, "..", "..", "..", "MIS.xlsx"),
        "/home/user/rapid/current/MIS.xlsx",
    ];
    const unique = Array.from(new Set(candidates));
    const found = unique.find((candidate) => (0, node_fs_1.existsSync)(candidate));
    return found ?? node_path_1.default.join(cwd, "MIS.xlsx");
}
function readMisWorkbook(filePath) {
    const resolvedPath = filePath ? node_path_1.default.resolve(filePath) : resolveDefaultWorkbookPath();
    try {
        if (!(0, node_fs_1.existsSync)(resolvedPath)) {
            return [];
        }
        const mtimeMs = (0, node_fs_1.statSync)(resolvedPath).mtimeMs;
        if (cachedMisWorkbook &&
            cachedMisWorkbook.filePath === resolvedPath &&
            cachedMisWorkbook.mtimeMs === mtimeMs) {
            return cachedMisWorkbook.sheets;
        }
        const parsed = parseMisWorkbook(resolvedPath);
        cachedMisWorkbook = {
            filePath: resolvedPath,
            mtimeMs,
            sheets: parsed,
        };
        return parsed;
    }
    catch {
        return [];
    }
}
