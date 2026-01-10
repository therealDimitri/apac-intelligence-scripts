import XLSX from 'xlsx';

const burcPath = '/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth/APAC Leadership Team - General/Performance/Financials/BURC/2026/2026 APAC Performance.xlsx';

const workbook = XLSX.readFile(burcPath);

console.log('=== SEARCHING 2026 FILE FOR NRR/GRR VALUES ===\n');

// Search all sheets for NRR, GRR, retention metrics
workbook.SheetNames.forEach(sheetName => {
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  let found = [];

  data.forEach((row, rowIdx) => {
    if (!row) return;
    row.forEach((cell, colIdx) => {
      if (typeof cell === 'string') {
        const cellLower = cell.toLowerCase();
        if (cellLower.includes('nrr') ||
            cellLower.includes('grr') ||
            cellLower.includes('net revenue retention') ||
            cellLower.includes('gross revenue retention') ||
            cellLower.includes('retention') ||
            cellLower.includes('rule of 40') ||
            cellLower.includes('churn') ||
            cellLower.includes('expansion')) {
          const values = row.slice(colIdx + 1, colIdx + 6).filter(v => v !== undefined && v !== null);
          found.push({
            row: rowIdx + 1,
            col: colIdx + 1,
            label: cell,
            values: values.map(v => {
              if (typeof v === 'number') {
                if (v > 0 && v < 2) return (v * 100).toFixed(1) + '%';
                if (v > 1000) return '$' + Math.round(v).toLocaleString();
                return v;
              }
              return v;
            })
          });
        }
      }
    });
  });

  if (found.length > 0) {
    console.log('Sheet: ' + sheetName);
    found.forEach(f => {
      console.log('  Row ' + f.row + ': ' + f.label);
      if (f.values.length > 0) {
        console.log('    Values: ' + f.values.join(', '));
      }
    });
    console.log('');
  }
});

// Check the Attrition sheet specifically
console.log('\n=== ATTRITION SHEET ANALYSIS ===\n');
const attrSheet = workbook.Sheets['Attrition'];
if (attrSheet) {
  const data = XLSX.utils.sheet_to_json(attrSheet, { header: 1 });

  console.log('First 20 rows:');
  data.slice(0, 20).forEach((row, i) => {
    if (row && row.some(c => c !== undefined && c !== null)) {
      const formatted = row.slice(0, 10).map(c => {
        if (c === undefined || c === null) return '';
        if (typeof c === 'number') {
          if (c > 1000) return '$' + Math.round(c).toLocaleString();
          if (c > 40000 && c < 50000) return new Date((c - 25569) * 86400 * 1000).toLocaleDateString();
          return c;
        }
        return String(c).substring(0, 25);
      });
      console.log('Row ' + (i+1).toString().padStart(2) + ': ' + formatted.join(' | '));
    }
  });
}

// Check Maint sheet for ARR/retention data
console.log('\n=== MAINT SHEET - LOOKING FOR TOTALS ===\n');
const maintSheet = workbook.Sheets['Maint'];
if (maintSheet) {
  const data = XLSX.utils.sheet_to_json(maintSheet, { header: 1 });

  data.forEach((row, i) => {
    if (row && row[0]) {
      const label = String(row[0]).toLowerCase();
      if (label.includes('total') || label.includes('arr') || label.includes('retention')) {
        const values = row.slice(1, 10).filter(v => typeof v === 'number' && v > 100000);
        if (values.length > 0) {
          console.log('Row ' + (i+1) + ': ' + row[0]);
          console.log('  Values: ' + values.map(v => '$' + Math.round(v).toLocaleString()).join(', '));
        }
      }
    }
  });
}

// Look at 26 vs 25 comparison for more detail
console.log('\n=== 26 vs 25 Q COMPARISON - FULL BREAKDOWN ===\n');
const compSheet = workbook.Sheets['26 vs 25 Q Comparison'];
if (compSheet) {
  const data = XLSX.utils.sheet_to_json(compSheet, { header: 1 });

  // Print rows 1-40
  data.slice(0, 45).forEach((row, i) => {
    if (row && row.some(c => c !== undefined && c !== null && c !== '')) {
      const formatted = row.slice(0, 12).map(c => {
        if (c === undefined || c === null) return '';
        if (typeof c === 'number') {
          if (c > 0 && c < 2) return (c * 100).toFixed(1) + '%';
          if (Math.abs(c) > 100000) return '$' + Math.round(c).toLocaleString();
          return Math.round(c);
        }
        return String(c).substring(0, 18);
      });
      console.log('Row ' + (i+1).toString().padStart(2) + ': ' + formatted.join(' | '));
    }
  });
}
