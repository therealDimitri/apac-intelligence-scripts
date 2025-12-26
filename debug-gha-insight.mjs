#!/usr/bin/env node
/**
 * Debug GHA Insight Touch Point values in Excel
 */

import XLSX from 'xlsx';
import fs from 'fs';

const EXCEL_PATH = '/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth(2)/APAC Clients - Client Success/Client Segmentation/APAC Client Segmentation Activity Register 2025.xlsx';

const buffer = fs.readFileSync(EXCEL_PATH);
const workbook = XLSX.read(buffer, { type: 'buffer' });

// Get GHA sheet
const sheet = workbook.Sheets['GHA'];
const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

// Find row 3 to understand column structure
console.log("Row 3 (headers):");
const row3 = data[2] || [];
row3.forEach((v, i) => {
  if (v) console.log(`  Col ${i}: "${v}"`);
});

// Find Insight Touch Point row
console.log("\n--- Looking for 'Insight Touch Point' row ---");
for (let rowIdx = 4; rowIdx < data.length; rowIdx++) {
  const row = data[rowIdx];
  if (!row) continue;

  const eventName = row[1];
  if (eventName && eventName.toString().includes('Insight Touch Point')) {
    console.log(`\nFound at row ${rowIdx + 1}: "${eventName}"`);
    console.log("\nAll columns for this row:");
    row.forEach((v, i) => {
      if (v !== null && v !== undefined && v !== '') {
        console.log(`  Col ${i}: ${JSON.stringify(v)} (type: ${typeof v})`);
      }
    });

    // Check specifically the completion columns
    console.log("\n--- Month-by-month breakdown ---");
    const months = [
      { name: 'January', compCol: 5, dateCol: 6 },
      { name: 'February', compCol: 7, dateCol: 8 },
      { name: 'March', compCol: 9, dateCol: 10 },
      { name: 'April', compCol: 11, dateCol: 12 },
      { name: 'May', compCol: 13, dateCol: 14 },
      { name: 'June', compCol: 15, dateCol: 16 },
      { name: 'July', compCol: 17, dateCol: 18 },
      { name: 'August', compCol: 19, dateCol: 20 },
      // Sep-Dec may vary
      { name: 'Sep (col 21)', compCol: 21, dateCol: 22 },
      { name: 'Sep (col 22)', compCol: 22, dateCol: 23 },
      { name: 'Oct (col 23)', compCol: 23, dateCol: 24 },
      { name: 'Oct (col 24)', compCol: 24, dateCol: 25 },
      { name: 'Nov (col 25)', compCol: 25, dateCol: 26 },
      { name: 'Nov (col 26)', compCol: 26, dateCol: 27 },
      { name: 'Dec (col 27)', compCol: 27, dateCol: 28 },
      { name: 'Dec (col 28)', compCol: 28, dateCol: 29 },
    ];

    months.forEach(m => {
      const compVal = row[m.compCol];
      const dateVal = row[m.dateCol];
      if (compVal !== null && compVal !== undefined) {
        console.log(`  ${m.name}: completed=${JSON.stringify(compVal)} (${typeof compVal}), date=${JSON.stringify(dateVal)}`);
      }
    });
  }
}
