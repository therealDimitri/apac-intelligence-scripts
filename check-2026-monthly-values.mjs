import XLSX from 'xlsx';
import { BURC_MASTER_FILE, requireOneDrive } from './lib/onedrive-paths.mjs'

requireOneDrive()

const burcPath = BURC_MASTER_FILE;

const workbook = XLSX.readFile(burcPath);
const burcSheet = workbook.Sheets['APAC BURC'];
const data = XLSX.utils.sheet_to_json(burcSheet, { header: 1 });

console.log('=== 2026 APAC BURC - MONTHLY VALUES FOR CSI CALCULATION ===\n');

// Key rows for CSI calculation
const keyRows = [
  { rowNum: 56, name: 'License NR' },
  { rowNum: 57, name: 'PS NR' },
  { rowNum: 58, name: 'Maintenance NR' },
  { rowNum: 69, name: 'PS OPEX' },
  { rowNum: 80, name: 'S&M OPEX' },
  { rowNum: 74, name: 'Maint OPEX' },
  { rowNum: 86, name: 'R&D OPEX' },
  { rowNum: 93, name: 'G&A OPEX' },
];

// Columns 1-12 are Jan-Dec (0-indexed), Column 0 is label
console.log('Row | Field'.padEnd(25) + ' | Jan | Feb | Mar | Apr | May | Jun | Jul | Aug | Sep | Oct | Nov | Dec | FY Total');
console.log('-'.repeat(180));

keyRows.forEach(({ rowNum, name }) => {
  const row = data[rowNum - 1]; // Convert to 0-indexed
  if (!row) {
    console.log(rowNum.toString().padStart(3) + ' | ' + name.padEnd(20) + ' | NO DATA');
    return;
  }

  // Get monthly values (columns 1-12) and FY total (column 13 or 14)
  const values = [];
  let fyTotal = 0;
  for (let col = 1; col <= 12; col++) {
    const val = row[col];
    if (typeof val === 'number') {
      values.push(Math.round(val / 1000)); // Show in thousands
      fyTotal += val;
    } else {
      values.push('-');
    }
  }

  // Check for FY total in column 13 or 14
  const storedFY = typeof row[13] === 'number' ? row[13] : (typeof row[14] === 'number' ? row[14] : null);

  const line = rowNum.toString().padStart(3) + ' | ' +
    name.padEnd(20) + ' | ' +
    values.map(v => (v === '-' ? v : v.toString()).padStart(5)).join(' | ') +
    ' | $' + Math.round(fyTotal).toLocaleString().padStart(12);

  console.log(line);
});

// Now also check the 26 vs 25 sheet column structure
console.log('\n\n=== 26 vs 25 Q COMPARISON - COLUMN STRUCTURE ===\n');
const compSheet = workbook.Sheets['26 vs 25 Q Comparison'];
const compData = XLSX.utils.sheet_to_json(compSheet, { header: 1 });

// Show header rows
console.log('First 3 rows:');
for (let i = 0; i < 3; i++) {
  const row = compData[i];
  if (row) {
    console.log('Row ' + (i + 1) + ': ' + row.slice(0, 15).map((v, j) => 'Col' + j + ':' + (v || '')).join(' | '));
  }
}

// Show NR rows
console.log('\n\nNR Rows (with quarterly and annual values):');
console.log('Row | Field'.padEnd(40) + ' | Q1 | Q2 | Q3 | Q4 | FY26 | Q1 | Q2 | Q3 | Q4 | FY25');
compData.forEach((row, i) => {
  if (!row || !row[0]) return;
  const label = String(row[0]).toLowerCase();
  if (label.includes('nr') && (label.includes('license') || label.includes('maintenance') || label.includes('professional'))) {
    const values = [];
    for (let c = 1; c <= 10; c++) {
      const val = row[c];
      if (typeof val === 'number') {
        values.push('$' + Math.round(val / 1000) + 'K');
      } else {
        values.push('-');
      }
    }
    console.log((i + 1).toString().padStart(3) + ' | ' + row[0].substring(0, 35).padEnd(38) + ' | ' + values.join(' | '));
  }
});

// Show OPEX rows
console.log('\n\nOPEX Rows (with quarterly and annual values):');
compData.forEach((row, i) => {
  if (!row || !row[0]) return;
  const label = String(row[0]).toLowerCase();
  if (label.includes('opex') && !label.includes('total') && !label.includes('headcount') && !label.includes('%')) {
    const values = [];
    for (let c = 1; c <= 10; c++) {
      const val = row[c];
      if (typeof val === 'number') {
        values.push('$' + Math.round(val / 1000) + 'K');
      } else {
        values.push('-');
      }
    }
    console.log((i + 1).toString().padStart(3) + ' | ' + row[0].substring(0, 35).padEnd(38) + ' | ' + values.join(' | '));
  }
});
