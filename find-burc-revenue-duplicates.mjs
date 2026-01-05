import XLSX from 'xlsx';

const burcPath = '/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth(2)/APAC Leadership Team - General/Performance/Financials/BURC/2025/2025 APAC Performance.xlsx';

const workbook = XLSX.readFile(burcPath);

console.log('=== BURC REVENUE DUPLICATE ANALYSIS ===\n');

// Check APAC BURC main sheet for revenue breakdown
console.log('=== APAC BURC Sheet - Revenue Lines ===\n');
const burcSheet = workbook.Sheets['APAC BURC'];
if (burcSheet) {
  const data = XLSX.utils.sheet_to_json(burcSheet, { header: 1 });

  // Find the FY Total column - look at header row
  let fyTotalCol = -1;
  const headerRow = data[7] || data[6] || data[5];
  if (headerRow) {
    headerRow.forEach((cell, i) => {
      if (cell && String(cell).includes('FY') && String(cell).includes('Total')) {
        fyTotalCol = i;
      }
    });
  }

  // If not found, use last numeric column with large values
  if (fyTotalCol === -1) {
    fyTotalCol = 13; // Typical position
  }

  console.log('Looking at column ' + fyTotalCol + ' for FY Total\n');

  // Print revenue-related rows
  data.slice(0, 35).forEach((row, i) => {
    if (row && row[0]) {
      const label = String(row[0]);
      if (label.toLowerCase().includes('revenue') ||
          label.toLowerCase().includes('gross') ||
          label.toLowerCase().includes('license') ||
          label.toLowerCase().includes('maintenance') ||
          label.toLowerCase().includes('professional') ||
          label.toLowerCase().includes('hardware') ||
          label.toLowerCase().includes('total')) {

        // Get FY Total value
        const fyTotal = row[fyTotalCol] || row[13] || row[12];
        const formatted = typeof fyTotal === 'number' ? '$' + Math.round(fyTotal).toLocaleString() : fyTotal;
        console.log('Row ' + (i+1).toString().padStart(2) + ': ' + label.substring(0, 40).padEnd(42) + ' ' + formatted);
      }
    }
  });
}

// Check Maint sheet for individual client breakdown
console.log('\n\n=== Maint Net Rev 2025 - Client Breakdown ===\n');
const maintSheet = workbook.Sheets['Maint Net Rev 2025'];
if (maintSheet) {
  const data = XLSX.utils.sheet_to_json(maintSheet, { header: 1 });

  // Find 2025 Gross column
  const header = data[1];
  console.log('Header: ' + (header || []).slice(0, 10).join(' | '));
  console.log('');

  const clients = {};
  let total2025Gross = 0;

  data.slice(2).forEach((row, i) => {
    if (row && row[0] && typeof row[0] === 'string' && row[0].trim()) {
      const clientName = row[0].trim();
      const gross2025 = row[7] || 0; // 2025 Gross column

      if (typeof gross2025 === 'number' && gross2025 > 0) {
        if (clients[clientName]) {
          console.log('⚠️  DUPLICATE: ' + clientName);
          console.log('    First entry: $' + clients[clientName].toLocaleString());
          console.log('    This entry: $' + Math.round(gross2025).toLocaleString());
          clients[clientName] += gross2025;
        } else {
          clients[clientName] = gross2025;
        }
        total2025Gross += gross2025;
        console.log(clientName.padEnd(20) + ' $' + Math.round(gross2025).toLocaleString());
      }
    }
  });

  console.log('');
  console.log('Total 2025 Gross from client list: $' + Math.round(total2025Gross).toLocaleString());
  console.log('Number of unique clients: ' + Object.keys(clients).length);
}

// Check for "Total" rows in various sheets
console.log('\n\n=== Checking for Summary/Total Rows ===\n');

const sheetsToCheck = ['Maint', 'SW', 'PS', 'HW'];
sheetsToCheck.forEach(sheetName => {
  const sheet = workbook.Sheets[sheetName];
  if (sheet) {
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    console.log('Sheet: ' + sheetName);

    data.forEach((row, i) => {
      if (row && row[0]) {
        const label = String(row[0]).toLowerCase();
        if (label.includes('total') || label.includes('grand') || label.includes('subtotal')) {
          console.log('  Row ' + (i+1) + ': ' + row[0]);
        }
      }
    });
    console.log('');
  }
});

// Check database for duplicates
console.log('\n=== Checking Database Tables ===\n');

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Check burc_annual_financials
const { data: financials } = await supabase
  .from('burc_annual_financials')
  .select('*')
  .order('fiscal_year');

console.log('burc_annual_financials:');
financials?.forEach(f => {
  console.log('  FY' + f.fiscal_year + ': Gross Revenue $' + (f.gross_revenue || 0).toLocaleString());
});

// Check for any "Total" entries in other tables
const tables = ['burc_pipeline_detail', 'burc_business_cases'];
for (const table of tables) {
  const { data, count } = await supabase
    .from(table)
    .select('*', { count: 'exact' })
    .or('client_name.ilike.%total%,client_name.ilike.%grand%,client_name.ilike.%subtotal%');

  if (data && data.length > 0) {
    console.log('\n' + table + ' - Found ' + data.length + ' potential summary rows:');
    data.forEach(row => {
      console.log('  ' + row.client_name + ': $' + (row.total_value || row.total_revenue || 0).toLocaleString());
    });
  }
}
