const lib = require('./.tmp_mis_compile/mis-trends-workbook.js');
const sheets = lib.readMisWorkbook(process.argv[2]);
console.log('sheetPages=' + sheets.length);
for (const s of sheets){
  console.log('---', s.name, 'id=', s.id, 'sections=', s.sections.length, 'rows=', s.rows.length);
  for (const sec of s.sections.slice(0,5)){
    console.log('  section', sec.title, 'rows', sec.rows.length, 'headers', sec.headers.length, 'numeric', sec.numericKeys.length);
  }
}
