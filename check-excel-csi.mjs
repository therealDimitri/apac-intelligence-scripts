import XLSX from 'xlsx';

const workbook = XLSX.readFile('/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth(2)/APAC Leadership Team - General/Performance/Financials/BURC/2026/2026 APAC Performance.xlsx');

console.log('Sheet names:', workbook.SheetNames);

// Get APAC BURC sheet
const sheet = workbook.Sheets['APAC BURC'];
if (!sheet) {
  console.log('APAC BURC sheet not found');
  process.exit(1);
}

console.log('Sheet range:', sheet['!ref']);

// Get column letters - extended range
const cols = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// Check row 55 for month headers
console.log('\n=== Row 55 (checking for month headers) ===');
let row55 = [];
cols.slice(0, 20).forEach(col => {
  const cell = sheet[col + '55'];
  row55.push(cell ? cell.v : '');
});
console.log(row55.join(' | '));

// Check CSI ratio rows (121-129 per bug report)
console.log('\n=== CSI Ratio Rows (121-129) ===');
const ratioRows = [121, 122, 123, 124, 125, 126, 127, 128, 129];
ratioRows.forEach(row => {
  let rowData = [];
  cols.slice(0, 20).forEach(col => {
    const cell = sheet[col + row];
    rowData.push(cell ? (typeof cell.v === 'number' ? cell.v.toFixed(2) : cell.v) : '');
  });
  console.log(`Row ${row}: ${rowData.join(' | ')}`);
});

// Also check revenue rows (56-58)
console.log('\n=== Revenue Rows (56-59) ===');
[56, 57, 58, 59].forEach(row => {
  let rowData = [];
  cols.slice(0, 20).forEach(col => {
    const cell = sheet[col + row];
    rowData.push(cell ? (typeof cell.v === 'number' ? Math.round(cell.v).toLocaleString() : cell.v) : '');
  });
  console.log(`Row ${row}: ${rowData.join(' | ')}`);
});

// Check OPEX rows (69, 74, 80, 86, 93)
console.log('\n=== OPEX Rows (69, 74, 80, 86, 93) ===');
[69, 74, 80, 86, 93].forEach(row => {
  let rowData = [];
  cols.slice(0, 20).forEach(col => {
    const cell = sheet[col + row];
    rowData.push(cell ? (typeof cell.v === 'number' ? Math.round(cell.v).toLocaleString() : cell.v) : '');
  });
  console.log(`Row ${row}: ${rowData.join(' | ')}`);
});

// Find column for Dec 2025 and Jan/Feb 2026 by checking header row
console.log('\n=== Looking for month columns ===');
// Check rows 1-5 for headers
for (let r = 1; r <= 10; r++) {
  let rowData = [];
  cols.slice(0, 20).forEach(col => {
    const cell = sheet[col + r];
    if (cell && cell.v) rowData.push(`${col}:${cell.v}`);
  });
  if (rowData.length > 0) console.log(`Row ${r}: ${rowData.join(' | ')}`);
}
