import XLSX from 'xlsx';

const burcPath = '/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth(2)/APAC Leadership Team - General/Performance/Financials/BURC/2025/2025 APAC Performance.xlsx';

const workbook = XLSX.readFile(burcPath);

console.log('=== Searching ALL sheets for retention metrics ===\n');

// Search all sheets for any cells containing retention-related values
workbook.SheetNames.forEach(sheetName => {
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  let found = [];

  data.forEach((row, rowIdx) => {
    if (!row) return;
    row.forEach((cell, colIdx) => {
      // Look for percentage values that could be NRR/GRR (90-140% range)
      if (typeof cell === 'number' && cell > 0.9 && cell < 1.5) {
        const pct = (cell * 100).toFixed(1);
        // Check if adjacent cell has a label
        const label = row[colIdx - 1] || row[colIdx + 1] || '';
        if (typeof label === 'string' &&
            (label.toLowerCase().includes('retention') ||
             label.toLowerCase().includes('nrr') ||
             label.toLowerCase().includes('grr') ||
             label.toLowerCase().includes('rule'))) {
          found.push({ row: rowIdx + 1, col: colIdx + 1, value: pct + '%', label });
        }
      }
      // Also look for text labels
      if (typeof cell === 'string') {
        const cellLower = cell.toLowerCase();
        if (cellLower.includes('net revenue retention') ||
            cellLower.includes('gross revenue retention') ||
            cellLower === 'nrr' ||
            cellLower === 'grr' ||
            cellLower.includes('rule of 40')) {
          // Get adjacent values
          const values = row.slice(colIdx + 1, colIdx + 5).filter(v => v !== undefined);
          found.push({ row: rowIdx + 1, col: colIdx + 1, label: cell, values });
        }
      }
    });
  });

  if (found.length > 0) {
    console.log('Sheet: ' + sheetName);
    found.forEach(f => {
      if (f.value) {
        console.log('  Row ' + f.row + ': ' + f.label + ' = ' + f.value);
      } else {
        console.log('  Row ' + f.row + ': ' + f.label + ' -> ' + (f.values || []).join(', '));
      }
    });
    console.log('');
  }
});

// Also check Maint sheet for base ARR figures
console.log('\n=== Maintenance Revenue Summary ===\n');
const maintSheet = workbook.Sheets['Maint Net Rev 2025'];
if (maintSheet) {
  const data = XLSX.utils.sheet_to_json(maintSheet, { header: 1 });
  // Find totals row
  data.forEach((row, i) => {
    if (row && row[0] && typeof row[0] === 'string' && row[0].toLowerCase().includes('total')) {
      console.log('Row ' + (i+1) + ': ' + row.slice(0, 8).map(c => {
        if (typeof c === 'number' && c > 100000) return '$' + Math.round(c).toLocaleString();
        return c;
      }).join(' | '));
    }
    // Empty row with totals
    if (!row[0] && row[1] && typeof row[1] === 'number' && row[1] > 1000000) {
      console.log('Row ' + (i+1) + ' (Totals): ' + row.slice(1, 8).map(c => {
        if (typeof c === 'number' && c > 100000) return '$' + Math.round(c).toLocaleString();
        return c || '';
      }).join(' | '));
    }
  });
}

// Check Attrition totals
console.log('\n=== Attrition Summary ===\n');
const attrSheet = workbook.Sheets['Attrition'];
if (attrSheet) {
  const data = XLSX.utils.sheet_to_json(attrSheet, { header: 1 });
  data.forEach((row, i) => {
    if (row && row[0] && typeof row[0] === 'string' &&
        (row[0].toLowerCase().includes('total') || row[0].toLowerCase().includes('grand'))) {
      console.log('Row ' + (i+1) + ': ' + row.slice(0, 8).map(c => {
        if (typeof c === 'number' && c > 100) return '$' + Math.round(c * 1000).toLocaleString();
        return c;
      }).join(' | '));
    }
  });
}

// Look at the APAC BURC sheet more thoroughly - rows 60-100 for summary metrics
console.log('\n=== APAC BURC Sheet - Summary Section (Rows 60-100) ===\n');
const burcSheet = workbook.Sheets['APAC BURC'];
if (burcSheet) {
  const data = XLSX.utils.sheet_to_json(burcSheet, { header: 1 });
  data.slice(59, 100).forEach((row, i) => {
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
      console.log('Row ' + (i+60).toString().padStart(2) + ': ' + formatted.join(' | '));
    }
  });
}
