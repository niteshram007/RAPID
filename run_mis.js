const lib = require("./mis-trends-workbook.js");
const sheets = lib.readMisWorkbook();
console.log("sheets", sheets.length);
if (sheets[0]) {
  console.log("first", sheets[0].name, sheets[0].sections.length);
}
