import XLSX from 'xlsx';

const burcPath = '/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth/APAC Leadership Team - General/Performance/Financials/BURC/2026/2026 APAC Performance.xlsx';

const workbook = XLSX.readFile(burcPath);
const compSheet = workbook.Sheets['26 vs 25 Q Comparison'];
const compData = XLSX.utils.sheet_to_json(compSheet, { header: 1 });

console.log('=== FY 2026 OPEX VALUES FROM EXCEL ===\n');
console.log('Source: 26 vs 25 Q Comparison sheet, Column 5 (FY 2026)\n');

// Search for OPEX rows
compData.forEach((row, i) => {
  if (!row || !row[0]) return;
  const label = String(row[0]).toLowerCase();

  if (label.includes('opex') ||
      label.includes('professional services') ||
      label.includes('sales & marketing') ||
      label.includes('maintenance') ||
      label.includes('r&d') ||
      label.includes('research') ||
      label.includes('g&a') ||
      label.includes('admin')) {

    const fy26 = row[5];
    if (typeof fy26 === 'number' && Math.abs(fy26) > 10000) {
      console.log('Row ' + (i + 1).toString().padStart(3) + ': ' + row[0].substring(0, 50).padEnd(52) + ' | $' + Math.round(fy26).toLocaleString());
    }
  }
});

// Calculate what the CSI ratios SHOULD be
console.log('\n=== CALCULATED CSI RATIOS (FROM EXCEL VALUES) ===\n');

// Values from Excel
const licenseNR = 1908790;
const psNR = 2482649;
const maintNR = 6475993;

// Need to find OPEX values - let me search more specifically
let psOpex = 0, smOpex = 0, maintOpex = 0, rdOpex = 0, gaOpex = 0;

compData.forEach((row, i) => {
  if (!row || !row[0]) return;
  const label = String(row[0]).toLowerCase();
  const fy26 = row[5];

  if (typeof fy26 === 'number') {
    if (label.includes('professional services') && label.includes('opex')) psOpex = fy26;
    if ((label.includes('sales') || label.includes('s&m')) && label.includes('opex')) smOpex = fy26;
    if (label.includes('maintenance') && label.includes('opex')) maintOpex = fy26;
    if ((label.includes('r&d') || label.includes('research')) && label.includes('opex')) rdOpex = fy26;
    if ((label.includes('g&a') || label.includes('admin')) && label.includes('opex')) gaOpex = fy26;
  }
});

console.log('Found OPEX values:');
console.log('  PS OPEX: $' + psOpex.toLocaleString());
console.log('  S&M OPEX: $' + smOpex.toLocaleString());
console.log('  Maint OPEX: $' + maintOpex.toLocaleString());
console.log('  R&D OPEX: $' + rdOpex.toLocaleString());
console.log('  G&A OPEX: $' + gaOpex.toLocaleString());

if (psOpex && smOpex && maintOpex && rdOpex && gaOpex) {
  // CSI Ratio calculations
  const psRatio = psNR / psOpex;
  const salesRatio = (0.7 * licenseNR) / smOpex;
  const maintRatio = (0.85 * maintNR) / maintOpex;
  const rdRatio = (0.3 * licenseNR + 0.15 * maintNR) / rdOpex;
  const totalNR = psNR + licenseNR + maintNR;
  const gaRatio = (gaOpex / totalNR) * 100;

  console.log('\nCalculated CSI Ratios (using standard formulas):');
  console.log('  PS Ratio (NR/OPEX): ' + psRatio.toFixed(2));
  console.log('  Sales Ratio (70%×License/S&M OPEX): ' + salesRatio.toFixed(2));
  console.log('  Maint Ratio (85%×Maint/OPEX): ' + maintRatio.toFixed(2));
  console.log('  R&D Ratio (30%×License+15%×Maint)/OPEX: ' + rdRatio.toFixed(2));
  console.log('  G&A Ratio (OPEX/Total NR): ' + gaRatio.toFixed(1) + '%');

  console.log('\n=== EXCEL vs CALCULATED CSI RATIOS ===\n');
  console.log('| Ratio | Excel Shows | Calculated | Match |');
  console.log('|-------|-------------|------------|-------|');
  console.log('| Maint (Customer Service) | 8.49 | ' + maintRatio.toFixed(2) + ' | ' + (Math.abs(maintRatio - 8.49) < 0.1 ? '✅' : '❌'));
  console.log('| Sales (S&M) | 1.87 | ' + salesRatio.toFixed(2) + ' | ' + (Math.abs(salesRatio - 1.87) < 0.1 ? '✅' : '❌'));
  console.log('| PS | 2.70 | ' + psRatio.toFixed(2) + ' | ' + (Math.abs(psRatio - 2.70) < 0.1 ? '✅' : '❌'));
  console.log('| G&A (<10%) | 8.87% | ' + gaRatio.toFixed(1) + '% | ' + (Math.abs(gaRatio - 8.87) < 0.5 ? '✅' : '❌'));
}
