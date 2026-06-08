const path = require("node:path");
const { existsSync, statSync } = require("node:fs");
const XLSX = require("xlsx");

const workbookPath = process.argv[2] || "/home/user/rapid/current/MIS.xlsx";
console.log("path", workbookPath, "exists", existsSync(workbookPath));

try {
  const workbook = XLSX.readFile(workbookPath, { cellDates: true, cellFormula: false });
  console.log("sheetNames", workbook.SheetNames.length, workbook.SheetNames.join(", "));
} catch (error) {
  console.error("readFile failed", error);
  process.exit(1);
}
