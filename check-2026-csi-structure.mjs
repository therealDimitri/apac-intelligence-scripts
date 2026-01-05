import XLSX from 'xlsx';

const burcPath = '/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth(2)/APAC Leadership Team - General/Performance/Financials/BURC/2026/2026 APAC Performance.xlsx';

const workbook = XLSX.readFile(burcPath);

// Check the 26 vs 25 comparison for full year values
console.log('=== 26 vs 25 Q COMPARISON - COLUMN HEADERS ===\n');
const compSheet = workbook.Sheets['26 vs 25 Q Comparison'];
const compData = XLSX.utils.sheet_to_json(compSheet, { header: 1 });

// Show headers (first few rows)
console.log('Row 1:');
compData[0]?.slice(0, 15).forEach((val, i) => {
  console.log('  Col ' + i + ': ' + (val || '-'));
});

console.log('\nRow 2:');
compData[1]?.slice(0, 15).forEach((val, i) => {
  if (val) console.log('  Col ' + i + ': ' + val);
});

// Find key rows and show FY values
console.log('\n=== KEY NR AND OPEX ROWS (FY 2026 vs FY 2025) ===\n');
console.log('Row | Label'.padEnd(50) + ' | FY 2026 | FY 2025');
console.log('-'.repeat(80));

const keyTerms = ['license nr', 'ps nr', 'professional service nr', 'maintenance nr',
                  'ps.*opex', 'maint.*opex', 's&m.*opex', 'sales.*opex',
                  'r&d.*opex', 'g&a.*opex', 'admin.*opex', 'total opex'];

compData.forEach((row, i) => {
  if (!row || !row[0]) return;
  const label = String(row[0]).toLowerCase();

  const isRelevant = keyTerms.some(term => {
    if (term.includes('*')) {
      const parts = term.split('*');
      return parts.every(p => label.includes(p));
    }
    return label.includes(term);
  });

  if (isRelevant) {
    const fy26 = row[5]; // FY 2026 total column
    const fy25 = row[11]; // FY 2025 total column

    const format = (v) => {
      if (v === undefined || v === null || v === '') return '-';
      if (typeof v === 'number') {
        if (Math.abs(v) >= 1000) return '$' + Math.round(v).toLocaleString();
        if (v < 1) return (v * 100).toFixed(1) + '%';
        return v.toFixed(2);
      }
      return String(v).substring(0, 15);
    };

    console.log((i + 1).toString().padStart(3) + ' | ' + row[0].substring(0, 45).padEnd(47) + ' | ' + format(fy26).padStart(12) + ' | ' + format(fy25).padStart(12));
  }
});

// Now show the CSI ratios section
console.log('\n=== CSI RATIOS SECTION ===\n');
console.log('Row | Ratio'.padEnd(50) + ' | FY 2026 | FY 2025');
console.log('-'.repeat(80));

for (let i = 63; i <= 70; i++) {
  const row = compData[i];
  if (!row) continue;

  const fy26 = row[5];
  const fy25 = row[11];

  const format = (v) => {
    if (v === undefined || v === null || v === '') return '-';
    if (typeof v === 'number') {
      if (v >= 0 && v < 1) return (v * 100).toFixed(2) + '%';
      if (v >= 1 && v < 100) return v.toFixed(2);
      return v.toString();
    }
    return String(v).substring(0, 15);
  };

  console.log((i + 1).toString().padStart(3) + ' | ' + (row[0] || '').toString().substring(0, 45).padEnd(47) + ' | ' + format(fy26).padStart(12) + ' | ' + format(fy25).padStart(12));
}
