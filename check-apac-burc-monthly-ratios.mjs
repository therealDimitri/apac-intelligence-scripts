import XLSX from 'xlsx';
import { BURC_MASTER_FILE, requireOneDrive } from './lib/onedrive-paths.mjs'

requireOneDrive()

const burcPath = BURC_MASTER_FILE;

const workbook = XLSX.readFile(burcPath);
const burcSheet = workbook.Sheets['APAC BURC'];
const data = XLSX.utils.sheet_to_json(burcSheet, { header: 1 });

console.log('=== APAC BURC SHEET - MONTHLY CSI RATIOS (2026) ===\n');

// CSI Ratio rows (based on earlier analysis)
const ratioRows = [
  { row: 121, name: 'Customer Service / Maint (>4)' },
  { row: 122, name: 'Sales & Marketing (>1)' },
  { row: 123, name: 'R&D (>1)' },
  { row: 124, name: 'Professional Services (>2)' },
  { row: 125, name: 'Administration (≤20%)' },
];

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

console.log('Row | Ratio'.padEnd(35) + ' | ' + months.map(m => m.padStart(6)).join(' | ') + ' | Q1 Avg');
console.log('-'.repeat(140));

ratioRows.forEach(({ row, name }) => {
  const rowData = data[row - 1]; // 0-indexed
  if (!rowData) {
    console.log(row + ' | ' + name + ' | NO DATA');
    return;
  }

  // Columns 1-12 are Jan-Dec (0-indexed means columns 1-12)
  const values = [];
  for (let col = 1; col <= 12; col++) {
    const val = rowData[col];
    if (typeof val === 'number') {
      // Check if it's a percentage (0-1 range) or a ratio
      if (val > 0 && val < 1) {
        values.push((val * 100).toFixed(1) + '%');
      } else {
        values.push(val.toFixed(2));
      }
    } else {
      values.push('-');
    }
  }

  // Calculate Q1 average (Jan, Feb, Mar)
  const q1Values = [];
  for (let col = 1; col <= 3; col++) {
    const val = rowData[col];
    if (typeof val === 'number') {
      q1Values.push(val);
    }
  }
  const q1Avg = q1Values.length > 0 ? q1Values.reduce((a, b) => a + b, 0) / q1Values.length : 0;

  console.log(row.toString().padStart(3) + ' | ' + name.padEnd(30) + ' | ' + values.map(v => v.padStart(6)).join(' | ') + ' | ' + q1Avg.toFixed(2));
});

// Now check the underlying NR and OPEX values that feed these ratios
console.log('\n\n=== APAC BURC - UNDERLYING VALUES (2026) ===\n');

const underlyingRows = [
  { row: 56, name: 'License NR' },
  { row: 57, name: 'PS NR' },
  { row: 58, name: 'Maintenance NR' },
  { row: 69, name: 'PS OPEX' },
  { row: 74, name: 'Maint OPEX' },
  { row: 80, name: 'S&M OPEX' },
  { row: 86, name: 'R&D OPEX' },
  { row: 93, name: 'G&A OPEX' },
];

console.log('Row | Field'.padEnd(25) + ' | ' + months.map(m => m.padStart(10)).join(' | '));
console.log('-'.repeat(160));

underlyingRows.forEach(({ row, name }) => {
  const rowData = data[row - 1];
  if (!rowData) return;

  const values = [];
  for (let col = 1; col <= 12; col++) {
    const val = rowData[col];
    if (typeof val === 'number') {
      values.push('$' + Math.round(val / 1000) + 'K');
    } else {
      values.push('-');
    }
  }

  console.log(row.toString().padStart(3) + ' | ' + name.padEnd(20) + ' | ' + values.map(v => v.padStart(10)).join(' | '));
});

// Compare with 26 vs 25 Q Comparison
console.log('\n\n=== 26 vs 25 Q COMPARISON - QUARTERLY RATIOS ===\n');

const compSheet = workbook.Sheets['26 vs 25 Q Comparison'];
const compData = XLSX.utils.sheet_to_json(compSheet, { header: 1 });

// Find CSI ratio rows
console.log('Row | Ratio'.padEnd(40) + ' | Q1 2026 | Q2 2026 | Q3 2026 | Q4 2026 | FY 2026');
console.log('-'.repeat(100));

for (let i = 64; i <= 70; i++) {
  const row = compData[i];
  if (!row || !row[0]) continue;

  const values = [];
  // Columns for 2026: Q1=1, Q2=2, Q3=3, Q4=4, FY=5
  for (let c = 1; c <= 5; c++) {
    const val = row[c];
    if (typeof val === 'number') {
      if (val > 0 && val < 1) {
        values.push((val * 100).toFixed(2) + '%');
      } else {
        values.push(val.toFixed(2));
      }
    } else {
      values.push('-');
    }
  }

  console.log((i + 1).toString().padStart(3) + ' | ' + (row[0] || '').toString().substring(0, 35).padEnd(37) + ' | ' + values.map(v => v.padStart(7)).join(' | '));
}
