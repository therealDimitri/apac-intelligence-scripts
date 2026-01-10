import XLSX from 'xlsx';

const burcPath = '/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth/APAC Leadership Team - General/Performance/Financials/BURC/2026/2026 APAC Performance.xlsx';

const workbook = XLSX.readFile(burcPath);

console.log('=== INVESTIGATING G&A RATIO DISCREPANCY ===\n');

// Check what Total NR Excel uses
// G&A Ratio = G&A OPEX / Total NR * 100
// If G&A OPEX = $1,163,897 and ratio = 8.87%
// Then Total NR = $1,163,897 / 0.0887 = $13,122,571

const gaOpex = 1163897;
const excelGaRatio = 8.87;
const impliedTotalNR = gaOpex / (excelGaRatio / 100);

console.log('G&A OPEX (FY 2026): $' + gaOpex.toLocaleString());
console.log('Excel G&A Ratio: ' + excelGaRatio + '%');
console.log('Implied Total NR: $' + Math.round(impliedTotalNR).toLocaleString());

// Our calculation
const licenseNR = 1908790;
const psNR = 2482649;
const maintNR = 6475993;
const ourTotalNR = licenseNR + psNR + maintNR;

console.log('\nOur Total NR calculation:');
console.log('  License NR: $' + licenseNR.toLocaleString());
console.log('  PS NR: $' + psNR.toLocaleString());
console.log('  Maintenance NR: $' + maintNR.toLocaleString());
console.log('  Sum: $' + ourTotalNR.toLocaleString());
console.log('  Our G&A Ratio: ' + ((gaOpex / ourTotalNR) * 100).toFixed(1) + '%');

console.log('\n=== CHECKING EXCEL FOR TOTAL NR DEFINITION ===\n');

const compSheet = workbook.Sheets['26 vs 25 Q Comparison'];
const compData = XLSX.utils.sheet_to_json(compSheet, { header: 1 });

// Find all revenue/NR rows
console.log('All Revenue/NR rows in 26 vs 25 Q Comparison (FY 2026 column):');
console.log('Row | Label'.padEnd(50) + ' | FY 2026');
console.log('-'.repeat(70));

let runningTotal = 0;

compData.forEach((row, i) => {
  if (!row || !row[0]) return;
  const label = String(row[0]).toLowerCase();
  const fy26 = row[5];

  // Look for revenue-related rows
  if ((label.includes('revenue') || label.includes(' nr') || label.includes('net revenue')) &&
      !label.includes('cogs') && !label.includes('opex') && !label.includes('headcount')) {

    if (typeof fy26 === 'number') {
      console.log((i + 1).toString().padStart(3) + ' | ' + row[0].substring(0, 45).padEnd(47) + ' | $' + Math.round(fy26).toLocaleString().padStart(12));

      // Add to running total if it's a component (not a total row)
      if (!label.includes('total') && !label.includes('gross')) {
        runningTotal += fy26;
      }
    }
  }
});

console.log('\nSum of individual NR components: $' + Math.round(runningTotal).toLocaleString());

// Also check for "Total Net Revenue" row
console.log('\n=== CHECKING FOR TOTAL NET REVENUE ROW ===\n');

compData.forEach((row, i) => {
  if (!row || !row[0]) return;
  const label = String(row[0]).toLowerCase();
  const fy26 = row[5];

  if ((label.includes('total') && (label.includes('nr') || label.includes('net revenue'))) ||
      label === 'total nr' || label === 'net revenue') {

    if (typeof fy26 === 'number') {
      console.log('Row ' + (i + 1) + ': ' + row[0] + ' = $' + Math.round(fy26).toLocaleString());
    }
  }
});

// Check APAC BURC sheet for G&A ratio formula context
console.log('\n=== APAC BURC SHEET - G&A RATIO ROW ===\n');

const burcSheet = workbook.Sheets['APAC BURC'];
const burcData = XLSX.utils.sheet_to_json(burcSheet, { header: 1 });

burcData.forEach((row, i) => {
  if (!row || !row[0]) return;
  const label = String(row[0]).toLowerCase();

  if (label.includes('admin') && (label.includes('%') || label.includes('ratio'))) {
    console.log('Row ' + (i + 1) + ': ' + row[0]);
    console.log('  Dec value: ' + (typeof row[12] === 'number' ? (row[12] * 100).toFixed(2) + '%' : row[12]));
    console.log('  FY value: ' + (typeof row[13] === 'number' ? (row[13] * 100).toFixed(2) + '%' : row[13]));
  }
});

// Check what NR components exist
console.log('\n=== ALL NR ROWS IN APAC BURC (Row 50-70) ===\n');
for (let i = 49; i < 70; i++) {
  const row = burcData[i];
  if (!row || !row[0]) continue;

  const label = String(row[0]);
  const dec = row[12];
  const fy = row[13];

  if (label.toLowerCase().includes('nr') || label.toLowerCase().includes('revenue')) {
    console.log('Row ' + (i + 1) + ': ' + label.substring(0, 40));
    if (typeof dec === 'number') {
      console.log('  Dec: $' + Math.round(dec).toLocaleString());
    }
  }
}
