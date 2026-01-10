import XLSX from 'xlsx';

const burcPath = '/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth/APAC Leadership Team - General/Performance/Financials/BURC/2026/2026 APAC Performance.xlsx';

const workbook = XLSX.readFile(burcPath);
const burcSheet = workbook.Sheets['APAC BURC'];
const data = XLSX.utils.sheet_to_json(burcSheet, { header: 1 });

console.log('=== DEBUGGING SALES RATIO SOURCE ===\n');

// First, find all rows that might contain "License" or "Licence" or "SW" revenue
console.log('Searching for License/Licence/SW revenue rows...\n');

data.forEach((row, i) => {
  if (!row || !row[0]) return;
  const label = String(row[0]).toLowerCase();

  if (label.includes('license') || label.includes('licence') || label.includes('sw nr') ||
      label.includes('software') || label.includes('sales ratio') || label.includes('s&m')) {

    console.log('Row ' + (i + 1) + ': ' + row[0]);

    // Show columns 1-12 (Jan-Dec)
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    for (let col = 1; col <= 12; col++) {
      const val = row[col];
      if (val !== undefined && val !== null && val !== '') {
        let formatted;
        if (typeof val === 'number') {
          if (Math.abs(val) > 1000) formatted = '$' + Math.round(val).toLocaleString();
          else if (val > 0 && val < 1) formatted = (val * 100).toFixed(1) + '%';
          else formatted = val.toFixed(2);
        } else {
          formatted = String(val);
        }
        console.log('  ' + months[col-1] + ': ' + formatted);
      }
    }
    console.log('');
  }
});

// Check the Sales Ratio row specifically (row 122)
console.log('\n=== ROW 122 (Sales & Marketing Ratio) - RAW VALUES ===\n');
const salesRatioRow = data[121]; // 0-indexed
if (salesRatioRow) {
  console.log('Label: ' + salesRatioRow[0]);
  for (let col = 1; col <= 12; col++) {
    const val = salesRatioRow[col];
    console.log('Col ' + col + ': ' + val + ' (type: ' + typeof val + ')');
  }
}

// Check what License NR row 56 actually contains
console.log('\n=== ROW 56 (License NR) - RAW VALUES ===\n');
const licenseRow = data[55]; // 0-indexed
if (licenseRow) {
  console.log('Label: ' + licenseRow[0]);
  for (let col = 1; col <= 12; col++) {
    const val = licenseRow[col];
    console.log('Col ' + col + ': ' + val + ' (type: ' + typeof val + ')');
  }
}

// Check rows around 56 for context
console.log('\n=== ROWS 50-65 LABELS ===\n');
for (let i = 49; i < 65; i++) {
  const row = data[i];
  if (row && row[0]) {
    console.log('Row ' + (i + 1) + ': ' + row[0]);
  }
}

// Check if there's a different "Booked License" or similar row
console.log('\n=== SEARCHING FOR "BOOKED" ROWS ===\n');
data.forEach((row, i) => {
  if (!row || !row[0]) return;
  const label = String(row[0]).toLowerCase();

  if (label.includes('booked') && (label.includes('license') || label.includes('licence'))) {
    console.log('Row ' + (i + 1) + ': ' + row[0]);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    for (let col = 1; col <= 12; col++) {
      const val = row[col];
      if (typeof val === 'number' && Math.abs(val) > 100) {
        console.log('  ' + months[col-1] + ': $' + Math.round(val).toLocaleString());
      }
    }
  }
});

// Look for the formula that Excel uses for Sales Ratio
console.log('\n=== CHECKING FORMULA CONTEXT (Rows 118-130) ===\n');
for (let i = 117; i < 130; i++) {
  const row = data[i];
  if (row && row[0]) {
    const dec = row[12];
    let decStr = '-';
    if (typeof dec === 'number') {
      if (dec > 0 && dec < 1) decStr = (dec * 100).toFixed(2) + '%';
      else if (dec >= 1 && dec < 100) decStr = dec.toFixed(2);
      else decStr = dec.toString();
    }
    console.log('Row ' + (i + 1) + ': ' + String(row[0]).substring(0, 45).padEnd(47) + ' | Dec: ' + decStr);
  }
}
