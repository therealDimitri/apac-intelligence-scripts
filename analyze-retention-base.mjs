import XLSX from 'xlsx';

const burcPath = '/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth/APAC Leadership Team - General/Performance/Financials/BURC/2025/2025 APAC Performance.xlsx';

const workbook = XLSX.readFile(burcPath);

console.log('=== RETENTION METRIC REVERSE ENGINEERING ===\n');

// Given stored values
const storedNRR = 121.4;
const storedGRR = 97.6;
const expansion = 6613278;
const churn = 675000;

console.log('Stored Values:');
console.log('  NRR: ' + storedNRR + '%');
console.log('  GRR: ' + storedGRR + '%');
console.log('  Expansion: $' + expansion.toLocaleString());
console.log('  Churn: $' + churn.toLocaleString());

// Reverse engineer the base ARR from GRR
// GRR = (ARR - Churn) / ARR
// GRR * ARR = ARR - Churn
// Churn = ARR - GRR * ARR
// Churn = ARR * (1 - GRR)
// ARR = Churn / (1 - GRR)
const impliedARRFromGRR = churn / (1 - storedGRR / 100);
console.log('\nImplied ARR from GRR formula: $' + Math.round(impliedARRFromGRR).toLocaleString());

// Reverse engineer from NRR
// NRR = (ARR + Expansion - Churn) / ARR
// NRR * ARR = ARR + Expansion - Churn
// NRR * ARR - ARR = Expansion - Churn
// ARR * (NRR - 1) = Expansion - Churn
// ARR = (Expansion - Churn) / (NRR - 1)
const impliedARRFromNRR = (expansion - churn) / (storedNRR / 100 - 1);
console.log('Implied ARR from NRR formula: $' + Math.round(impliedARRFromNRR).toLocaleString());

console.log('\n=== KNOWN ARR FIGURES ===\n');

// Get maintenance totals
const maintSheet = workbook.Sheets['Maint Net Rev 2025'];
if (maintSheet) {
  const data = XLSX.utils.sheet_to_json(maintSheet, { header: 1 });
  // Row 20 has totals based on earlier output
  const totalsRow = data[19]; // 0-indexed
  if (totalsRow) {
    console.log('From Maint Net Rev 2025 sheet:');
    console.log('  2024 Actual to Jul: $' + (totalsRow[1] || 0).toLocaleString());
    console.log('  2024 F.Cast to Dec: $' + (totalsRow[2] || 0).toLocaleString());
    console.log('  2024 Annual Gross: $' + (totalsRow[3] || 0).toLocaleString());
    console.log('  2024 COGS: $' + (totalsRow[4] || 0).toLocaleString());
    console.log('  2024 NR: $' + (totalsRow[5] || 0).toLocaleString());
    console.log('  2025 Gross: $' + (totalsRow[7] || 0).toLocaleString());
  }
}

// Get Gross Revenue from APAC BURC
console.log('\nFrom APAC BURC (Annual Totals):');
const burcSheet = workbook.Sheets['APAC BURC'];
if (burcSheet) {
  const data = XLSX.utils.sheet_to_json(burcSheet, { header: 1 });
  // Look for the FY Total column (usually last)
  data.slice(0, 50).forEach((row, i) => {
    if (row && row[0]) {
      const label = String(row[0]).toLowerCase();
      if (label.includes('gross revenue') ||
          label.includes('net revenue') ||
          label.includes('gross maintenance')) {
        // Find FY Total column (usually position 14 or later)
        const fyTotal = row.slice(10, 16).find(v => typeof v === 'number' && v > 10000000);
        if (fyTotal) {
          console.log('  ' + row[0] + ': $' + Math.round(fyTotal).toLocaleString());
        }
      }
    }
  });
}

console.log('\n=== RECALCULATION OPTIONS ===\n');

// Option 1: Using burc_arr_tracking total ($17.1M)
const arrTracking = 17134493.2;
const calcGRR1 = ((arrTracking - churn) / arrTracking * 100).toFixed(1);
const calcNRR1 = ((arrTracking + expansion - churn) / arrTracking * 100).toFixed(1);
console.log('Option 1: Using burc_arr_tracking ($17.1M):');
console.log('  GRR = (ARR - Churn) / ARR = ' + calcGRR1 + '%');
console.log('  NRR = (ARR + Expansion - Churn) / ARR = ' + calcNRR1 + '%');

// Option 2: Using implied ARR from stored GRR
const calcNRR2 = ((impliedARRFromGRR + expansion - churn) / impliedARRFromGRR * 100).toFixed(1);
console.log('\nOption 2: Using implied ARR from stored GRR ($' + Math.round(impliedARRFromGRR).toLocaleString() + '):');
console.log('  GRR = 97.6% (matches stored)');
console.log('  NRR = ' + calcNRR2 + '%');

// Option 3: Using 2024 Maintenance NR
const maint2024NR = 15617723;
const calcGRR3 = ((maint2024NR - churn) / maint2024NR * 100).toFixed(1);
const calcNRR3 = ((maint2024NR + expansion - churn) / maint2024NR * 100).toFixed(1);
console.log('\nOption 3: Using 2024 Maintenance NR ($15.6M):');
console.log('  GRR = ' + calcGRR3 + '%');
console.log('  NRR = ' + calcNRR3 + '%');

// Option 4: Using 2024 Maintenance Gross
const maint2024Gross = 17490818;
const calcGRR4 = ((maint2024Gross - churn) / maint2024Gross * 100).toFixed(1);
const calcNRR4 = ((maint2024Gross + expansion - churn) / maint2024Gross * 100).toFixed(1);
console.log('\nOption 4: Using 2024 Maintenance Gross ($17.5M):');
console.log('  GRR = ' + calcGRR4 + '%');
console.log('  NRR = ' + calcNRR4 + '%');

// Option 5: Using 2025 Gross Revenue
const grossRev2025 = 33738278;
const calcGRR5 = ((grossRev2025 - churn) / grossRev2025 * 100).toFixed(1);
const calcNRR5 = ((grossRev2025 + expansion - churn) / grossRev2025 * 100).toFixed(1);
console.log('\nOption 5: Using 2025 Gross Revenue ($33.7M):');
console.log('  GRR = ' + calcGRR5 + '%');
console.log('  NRR = ' + calcNRR5 + '%');

console.log('\n=== CONCLUSION ===\n');
console.log('The stored NRR (121.4%) and GRR (97.6%) appear to be calculated');
console.log('using a base ARR of approximately $' + Math.round(impliedARRFromGRR).toLocaleString());
console.log('\nThis is closest to the implied value from the stored GRR formula.');
console.log('The burc_arr_tracking total of $17.1M is likely the CORRECT base,');
console.log('but the stored values may have been calculated with different assumptions.');
