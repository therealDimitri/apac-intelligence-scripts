import XLSX from 'xlsx';

const burcPath = '/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth/APAC Leadership Team - General/Performance/Financials/BURC/2025/2025 APAC Performance.xlsx';

const workbook = XLSX.readFile(burcPath);

console.log('=== SEARCHING FOR $33.7M VALUE ===\n');

const targetValue = 33738278;
const tolerance = 100000; // Within $100K

workbook.SheetNames.forEach(sheetName => {
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  data.forEach((row, rowIdx) => {
    if (!row) return;
    row.forEach((cell, colIdx) => {
      if (typeof cell === 'number') {
        if (Math.abs(cell - targetValue) < tolerance) {
          const label = row[0] || '';
          console.log('FOUND in "' + sheetName + '" at Row ' + (rowIdx + 1) + ', Col ' + (colIdx + 1));
          console.log('  Value: $' + Math.round(cell).toLocaleString());
          console.log('  Row label: ' + label);
          console.log('');
        }
      }
    });
  });
});

// Also search for values around $26.3M (the correct Excel total)
console.log('\n=== SEARCHING FOR $26.3M VALUE ===\n');
const targetValue2 = 26311282;

workbook.SheetNames.forEach(sheetName => {
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  data.forEach((row, rowIdx) => {
    if (!row) return;
    row.forEach((cell, colIdx) => {
      if (typeof cell === 'number') {
        if (Math.abs(cell - targetValue2) < tolerance) {
          const label = row[0] || '';
          console.log('FOUND in "' + sheetName + '" at Row ' + (rowIdx + 1) + ', Col ' + (colIdx + 1));
          console.log('  Value: $' + Math.round(cell).toLocaleString());
          console.log('  Row label: ' + label);
          console.log('');
        }
      }
    });
  });
});

// Check the sync script to see where it pulls data from
console.log('\n=== CHECKING APAC BURC SHEET TOTALS ===\n');

const burcSheet = workbook.Sheets['APAC BURC'];
if (burcSheet) {
  const data = XLSX.utils.sheet_to_json(burcSheet, { header: 1 });

  // Look at row 29 (Gross Revenue row) more closely
  const grossRevRow = data[28]; // 0-indexed
  if (grossRevRow) {
    console.log('Row 29 (Gross Revenue):');
    console.log('  Label: ' + grossRevRow[0]);
    console.log('  All values:');
    grossRevRow.forEach((cell, i) => {
      if (typeof cell === 'number' && cell > 1000000) {
        console.log('    Col ' + i + ': $' + Math.round(cell).toLocaleString());
      }
    });
  }

  // Look for any row with $33.7M
  data.forEach((row, i) => {
    if (row) {
      row.forEach((cell, j) => {
        if (typeof cell === 'number' && Math.abs(cell - 33738278) < 100000) {
          console.log('\nRow ' + (i+1) + ', Col ' + j + ': $' + Math.round(cell).toLocaleString());
          console.log('  Row label: ' + (row[0] || ''));
        }
      });
    }
  });
}

// Check if there's a different total that includes pipeline
console.log('\n=== LOOKING FOR TOTALS WITH PIPELINE ===\n');

const burcData = XLSX.utils.sheet_to_json(workbook.Sheets['APAC BURC'], { header: 1 });
burcData.slice(0, 35).forEach((row, i) => {
  if (row && row[0]) {
    const label = String(row[0]).toLowerCase();
    if (label.includes('total') || label.includes('forecast') || label.includes('pipeline')) {
      const values = row.filter(c => typeof c === 'number' && c > 1000000);
      if (values.length > 0) {
        console.log('Row ' + (i+1) + ': ' + row[0]);
        console.log('  Values > $1M: ' + values.map(v => '$' + Math.round(v).toLocaleString()).join(', '));
      }
    }
  }
});
