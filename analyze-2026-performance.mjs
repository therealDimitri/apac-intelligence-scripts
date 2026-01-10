import XLSX from 'xlsx';

// Correct 2026 file
const burcPath = '/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth/APAC Leadership Team - General/Performance/Financials/BURC/2026/2026 APAC Performance.xlsx';

console.log('=== ANALYZING 2026 APAC PERFORMANCE FILE ===\n');
console.log('File: ' + burcPath);

const workbook = XLSX.readFile(burcPath);

console.log('\nSheets:', workbook.SheetNames.join(', '));

// Look for the comparison sheet
const compSheetName = workbook.SheetNames.find(s =>
  s.toLowerCase().includes('25 vs 24') ||
  s.toLowerCase().includes('26 vs 25') ||
  s.toLowerCase().includes('comparison')
);

console.log('\nComparison sheet found: ' + (compSheetName || 'Not found'));

// Check "25 vs 24 Q Comparison" or similar
console.log('\n=== CHECKING Q COMPARISON SHEET ===\n');

const qCompSheet = workbook.Sheets['25 vs 24 Q Comparison'] ||
                   workbook.Sheets['26 vs 25 Q Comparison'] ||
                   workbook.Sheets[compSheetName];

if (qCompSheet) {
  const data = XLSX.utils.sheet_to_json(qCompSheet, { header: 1 });

  console.log('First 30 rows of comparison sheet:\n');
  data.slice(0, 30).forEach((row, i) => {
    if (row && row.some(cell => cell !== undefined && cell !== null && cell !== '')) {
      const formatted = row.slice(0, 10).map(c => {
        if (c === undefined || c === null) return '';
        if (typeof c === 'number') {
          if (c > 0 && c < 2) return (c * 100).toFixed(1) + '%';
          if (Math.abs(c) > 100000) return '$' + Math.round(c).toLocaleString();
          return Math.round(c);
        }
        return String(c).substring(0, 20);
      });
      console.log('Row ' + (i+1).toString().padStart(2) + ': ' + formatted.join(' | '));
    }
  });
}

// Check APAC BURC main sheet
console.log('\n\n=== APAC BURC SHEET - GROSS REVENUE ROW ===\n');

const burcSheet = workbook.Sheets['APAC BURC'];
if (burcSheet) {
  const data = XLSX.utils.sheet_to_json(burcSheet, { header: 1 });

  // Find header row with months/quarters
  console.log('Header rows:');
  data.slice(5, 9).forEach((row, i) => {
    if (row) {
      console.log('Row ' + (i+6) + ': ' + row.slice(0, 22).map((c, j) => j + ':' + (c || '')).join(' | '));
    }
  });

  // Find Gross Revenue row
  console.log('\nGross Revenue row:');
  data.forEach((row, i) => {
    if (row && row[0] && String(row[0]).toLowerCase().includes('gross revenue (actual')) {
      console.log('Row ' + (i+1) + ': ' + row[0]);
      console.log('Values:');
      row.forEach((cell, j) => {
        if (typeof cell === 'number' && cell > 1000000) {
          console.log('  Col ' + j + ': $' + Math.round(cell).toLocaleString());
        }
      });
    }
  });
}

// Search for key totals
console.log('\n\n=== SEARCHING FOR FY TOTALS ===\n');

workbook.SheetNames.forEach(sheetName => {
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  let found = [];
  data.forEach((row, rowIdx) => {
    if (!row) return;
    row.forEach((cell, colIdx) => {
      // Look for values between $25M and $40M
      if (typeof cell === 'number' && cell > 25000000 && cell < 40000000) {
        found.push({
          row: rowIdx + 1,
          col: colIdx + 1,
          value: cell,
          label: row[0] || ''
        });
      }
    });
  });

  if (found.length > 0) {
    console.log('Sheet: ' + sheetName);
    found.forEach(f => {
      console.log('  Row ' + f.row + ', Col ' + f.col + ': $' + Math.round(f.value).toLocaleString() + ' (' + f.label + ')');
    });
    console.log('');
  }
});
