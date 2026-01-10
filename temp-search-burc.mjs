import XLSX from 'xlsx';

const workbook = XLSX.readFile('/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth/APAC Leadership Team - General/Performance/Financials/BURC/2025/Nov/2025 11 BURC File FINAL.xlsb');

console.log('=== 2025 11 BURC File FINAL.xlsb ===\n');
console.log('Sheets:', workbook.SheetNames.join(', '));

// Search for NRR/GRR/retention related data
workbook.SheetNames.forEach(sheetName => {
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  // Search for retention-related rows
  let found = false;
  data.forEach((row, i) => {
    const rowStr = JSON.stringify(row).toLowerCase();
    if (rowStr.includes('nrr') || rowStr.includes('grr') ||
        rowStr.includes('retention') || rowStr.includes('churn') ||
        rowStr.includes('expansion')) {
      if (!found) {
        console.log('\n--- ' + sheetName + ' ---');
        found = true;
      }
      console.log('Row ' + i + ':', JSON.stringify(row.slice(0, 10)));
    }
  });
});

// Also show Attrition sheet if it exists
const attrSheet = workbook.Sheets['Attrition'];
if (attrSheet) {
  console.log('\n=== ATTRITION SHEET (first 15 rows) ===');
  const data = XLSX.utils.sheet_to_json(attrSheet, { header: 1 });
  data.slice(0, 15).forEach((row, i) => {
    console.log(i + ':', JSON.stringify(row.slice(0, 8)));
  });
}
