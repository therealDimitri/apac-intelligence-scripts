import XLSX from 'xlsx';
import { burcFile, requireOneDrive } from './lib/onedrive-paths.mjs'

requireOneDrive()

const burcPath = burcFile(2025, '2025 APAC Performance.xlsx');

const workbook = XLSX.readFile(burcPath);

// Check the main APAC BURC sheet
console.log('=== APAC BURC Sheet (First 50 rows) ===\n');
const burcSheet = workbook.Sheets['APAC BURC'];
if (burcSheet) {
  const data = XLSX.utils.sheet_to_json(burcSheet, { header: 1 });
  data.slice(0, 50).forEach((row, i) => {
    if (row && row.some(cell => cell !== undefined && cell !== null && cell !== '')) {
      const formatted = row.slice(0, 10).map(c => {
        if (c === undefined || c === null) return '';
        if (typeof c === 'number') {
          if (c > 0 && c < 2) return (c * 100).toFixed(1) + '%';
          if (Math.abs(c) > 100000) return '$' + Math.round(c).toLocaleString();
          return c.toFixed ? c.toFixed(1) : c;
        }
        return String(c).substring(0, 25);
      });
      console.log('Row ' + (i+1).toString().padStart(2) + ': ' + formatted.join(' | '));
    }
  });
}

// Check Maint Net Rev sheet which might have ARR
console.log('\n\n=== Maint Net Rev 2025 Sheet (First 40 rows) ===\n');
const maintSheet = workbook.Sheets['Maint Net Rev 2025'];
if (maintSheet) {
  const data = XLSX.utils.sheet_to_json(maintSheet, { header: 1 });
  data.slice(0, 40).forEach((row, i) => {
    if (row && row.some(cell => cell !== undefined && cell !== null && cell !== '')) {
      const formatted = row.slice(0, 8).map(c => {
        if (c === undefined || c === null) return '';
        if (typeof c === 'number') {
          if (c > 0 && c < 2) return (c * 100).toFixed(1) + '%';
          if (Math.abs(c) > 100000) return '$' + Math.round(c).toLocaleString();
          return c.toFixed ? c.toFixed(1) : c;
        }
        return String(c).substring(0, 25);
      });
      console.log('Row ' + (i+1).toString().padStart(2) + ': ' + formatted.join(' | '));
    }
  });
}

// Check Attrition sheet
console.log('\n\n=== Attrition Sheet (First 30 rows) ===\n');
const attrSheet = workbook.Sheets['Attrition'];
if (attrSheet) {
  const data = XLSX.utils.sheet_to_json(attrSheet, { header: 1 });
  data.slice(0, 30).forEach((row, i) => {
    if (row && row.some(cell => cell !== undefined && cell !== null && cell !== '')) {
      const formatted = row.slice(0, 10).map(c => {
        if (c === undefined || c === null) return '';
        if (typeof c === 'number') {
          if (c > 0 && c < 2) return (c * 100).toFixed(1) + '%';
          if (Math.abs(c) > 100000) return '$' + Math.round(c).toLocaleString();
          return c.toFixed ? c.toFixed(1) : c;
        }
        return String(c).substring(0, 25);
      });
      console.log('Row ' + (i+1).toString().padStart(2) + ': ' + formatted.join(' | '));
    }
  });
}

// Check Net Rev Waterfall
console.log('\n\n=== Net Rev Waterfall Sheet (First 30 rows) ===\n');
const waterfallSheet = workbook.Sheets['Net Rev Waterfall'];
if (waterfallSheet) {
  const data = XLSX.utils.sheet_to_json(waterfallSheet, { header: 1 });
  data.slice(0, 30).forEach((row, i) => {
    if (row && row.some(cell => cell !== undefined && cell !== null && cell !== '')) {
      const formatted = row.slice(0, 8).map(c => {
        if (c === undefined || c === null) return '';
        if (typeof c === 'number') {
          if (c > 0 && c < 2) return (c * 100).toFixed(1) + '%';
          if (Math.abs(c) > 100000) return '$' + Math.round(c).toLocaleString();
          return c.toFixed ? c.toFixed(1) : c;
        }
        return String(c).substring(0, 25);
      });
      console.log('Row ' + (i+1).toString().padStart(2) + ': ' + formatted.join(' | '));
    }
  });
}
