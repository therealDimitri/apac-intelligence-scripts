import XLSX from 'xlsx';
import { BURC_MASTER_FILE, requireOneDrive } from './lib/onedrive-paths.mjs'
import { getCellValue } from './lib/excel-utils.mjs'

requireOneDrive()

const workbook = XLSX.readFile(BURC_MASTER_FILE);

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
  row55.push(getCellValue(sheet, col + '55', ''));
});
console.log(row55.join(' | '));

// Check CSI ratio rows (121-129 per bug report)
console.log('\n=== CSI Ratio Rows (121-129) ===');
const ratioRows = [121, 122, 123, 124, 125, 126, 127, 128, 129];
ratioRows.forEach(row => {
  let rowData = [];
  cols.slice(0, 20).forEach(col => {
    const val = getCellValue(sheet, col + row, '');
    rowData.push(typeof val === 'number' ? val.toFixed(2) : val);
  });
  console.log(`Row ${row}: ${rowData.join(' | ')}`);
});

// Also check revenue rows (56-58)
console.log('\n=== Revenue Rows (56-59) ===');
[56, 57, 58, 59].forEach(row => {
  let rowData = [];
  cols.slice(0, 20).forEach(col => {
    const val = getCellValue(sheet, col + row, '');
    rowData.push(typeof val === 'number' ? Math.round(val).toLocaleString() : val);
  });
  console.log(`Row ${row}: ${rowData.join(' | ')}`);
});

// Check OPEX rows (69, 74, 80, 86, 93)
console.log('\n=== OPEX Rows (69, 74, 80, 86, 93) ===');
[69, 74, 80, 86, 93].forEach(row => {
  let rowData = [];
  cols.slice(0, 20).forEach(col => {
    const val = getCellValue(sheet, col + row, '');
    rowData.push(typeof val === 'number' ? Math.round(val).toLocaleString() : val);
  });
  console.log(`Row ${row}: ${rowData.join(' | ')}`);
});

// Find column for Dec 2025 and Jan/Feb 2026 by checking header row
console.log('\n=== Looking for month columns ===');
// Check rows 1-5 for headers
for (let r = 1; r <= 10; r++) {
  let rowData = [];
  cols.slice(0, 20).forEach(col => {
    const val = getCellValue(sheet, col + r);
    if (val !== null) rowData.push(`${col}:${val}`);
  });
  if (rowData.length > 0) console.log(`Row ${r}: ${rowData.join(' | ')}`);
}
