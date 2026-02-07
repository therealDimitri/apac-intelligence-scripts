import XLSX from 'xlsx';
import { resolve } from 'path';
import { burcFile, requireOneDrive } from './lib/onedrive-paths.mjs'

requireOneDrive()

const burcPath = burcFile(2025, '2025 APAC Performance.xlsx');

console.log('=== Reading BURC Performance File ===\n');
console.log('File:', burcPath);
console.log('');

const workbook = XLSX.readFile(burcPath);

console.log('Sheets:', workbook.SheetNames.join(', '));
console.log('');

// Look for sheets that might contain retention metrics
const metricsKeywords = ['retention', 'nrr', 'grr', 'rule', 'summary', 'kpi', 'arr', 'churn'];

workbook.SheetNames.forEach(sheetName => {
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  // Search for NRR, GRR, Rule of 40, ARR in this sheet
  let foundMetrics = [];

  data.forEach((row, rowIdx) => {
    if (!row) return;
    row.forEach((cell, colIdx) => {
      if (cell && typeof cell === 'string') {
        const cellLower = cell.toLowerCase();
        if (cellLower.includes('nrr') ||
            cellLower.includes('net revenue retention') ||
            cellLower.includes('grr') ||
            cellLower.includes('gross revenue retention') ||
            cellLower.includes('rule of 40') ||
            cellLower.includes('total arr') ||
            cellLower.includes('churn') ||
            cellLower.includes('expansion')) {
          // Get the value in adjacent cells
          const nextCells = row.slice(colIdx + 1, colIdx + 4);
          foundMetrics.push({
            sheet: sheetName,
            row: rowIdx + 1,
            label: cell,
            values: nextCells.filter(v => v !== undefined && v !== null)
          });
        }
      }
    });
  });

  if (foundMetrics.length > 0) {
    console.log('=== Sheet: ' + sheetName + ' ===');
    foundMetrics.forEach(m => {
      console.log('  Row ' + m.row + ': ' + m.label);
      if (m.values.length > 0) {
        console.log('    Values: ' + m.values.map(v => {
          if (typeof v === 'number') {
            // Format as percentage if small decimal, otherwise as currency
            if (v > 0 && v < 3) return (v * 100).toFixed(1) + '%';
            if (v > 1000) return '$' + v.toLocaleString();
            return v;
          }
          return v;
        }).join(', '));
      }
    });
    console.log('');
  }
});

// Also look at specific sheets that might have the data
const summarySheets = ['Summary', 'Executive Summary', 'KPIs', 'Dashboard', 'Retention'];
summarySheets.forEach(name => {
  const matchingSheet = workbook.SheetNames.find(s => s.toLowerCase().includes(name.toLowerCase()));
  if (matchingSheet) {
    console.log('\n=== Detailed view of: ' + matchingSheet + ' ===');
    const sheet = workbook.Sheets[matchingSheet];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    // Print first 30 rows
    data.slice(0, 30).forEach((row, i) => {
      if (row && row.some(cell => cell !== undefined && cell !== null && cell !== '')) {
        console.log('Row ' + (i+1) + ': ' + row.slice(0, 8).map(c => {
          if (c === undefined || c === null) return '';
          if (typeof c === 'number' && c > 0 && c < 3) return (c * 100).toFixed(1) + '%';
          if (typeof c === 'number' && c > 10000) return '$' + Math.round(c).toLocaleString();
          return String(c).substring(0, 30);
        }).join(' | '));
      }
    });
  }
});
