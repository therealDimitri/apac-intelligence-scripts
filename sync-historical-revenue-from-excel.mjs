/**
 * Sync Historical Revenue from APAC Revenue 2019 - 2024.xlsx
 *
 * This script imports the authoritative client revenue data from the Excel file
 * into the burc_historical_revenue_detail table.
 *
 * Source: APAC Revenue 2019 - 2024.xlsx (Customer Level Summary sheet)
 *
 * IMPORTANT: This replaces/updates existing data. Run with --dry-run first.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import XLSX from 'xlsx';
import path from 'path';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DRY_RUN = process.argv.includes('--dry-run');

/**
 * Client name mapping: Excel name → Database canonical name
 * These must match the client_health_summary and client_name_aliases tables
 */
const CLIENT_NAME_MAP = {
  'Minister for Health aka South Australia Health': 'SA Health (iPro)', // Main SA Health entity
  'South Australia Health': 'SA Health (iPro)', // Additional SA Health entry
  'Singapore Health Services Pte Ltd': 'SingHealth',
  'Strategic Asia Pacific Partners, Incorporated': 'Guam Regional Medical City (GRMC)',
  'NCS PTE Ltd': 'NCS/MinDef Singapore',
  'St Luke\'s Medical Center Global City Inc': 'Saint Luke\'s Medical Centre (SLMC)',
  'Western Australia Department Of Health': 'WA Health',
  'Waikato District Health Board': 'Te Whatu Ora Waikato',
  'The Royal Victorian Eye and Ear Hospital': 'Royal Victorian Eye and Ear Hospital',
  'Parkway Hospitals Singapore PTE LTD': 'Parkway Hospitals Singapore PTE LTD',
  'Mount Alvernia Hospital': 'Mount Alvernia Hospital',
  'Gippsland Health Alliance': 'Gippsland Health Alliance (GHA)',
  'Epworth HealthCare': 'Epworth Healthcare',
  'Grampians Health': 'Grampians Health',
  'Barwon Health Australia': 'Barwon Health Australia',
  'Albury Wodonga Health': 'Albury Wodonga Health',
  'Western Health': 'Western Health',
  'Department of Health - Victoria': 'Department of Health - Victoria',
};

/**
 * Revenue type mapping: Excel PnL Rollup → Database revenue_type
 */
const REVENUE_TYPE_MAP = {
  'Hardware & Other Revenue': 'Hardware & Other Revenue',
  'License Revenue': 'License Revenue',
  'Maintenance Revenue': 'Maintenance Revenue',
  'Professional Services Revenue': 'Professional Services Revenue',
};

async function syncHistoricalRevenue() {
  console.log('=== Syncing Historical Revenue from APAC Revenue 2019 - 2024.xlsx ===');
  console.log('Mode:', DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE');
  console.log('');

  // Read Excel file
  const excelPath = path.join(
    process.env.HOME,
    'Library/CloudStorage/OneDrive-AlteraDigitalHealth/APAC Leadership Team - General/Performance/Financials/BURC/APAC Revenue 2019 - 2024.xlsx'
  );

  console.log('Reading:', excelPath);
  const wb = XLSX.readFile(excelPath);
  const sheet = wb.Sheets['Customer Level Summary'];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  // Year columns (0-indexed)
  const yearCols = { 2019: 3, 2020: 4, 2021: 5, 2022: 6, 2023: 7, 2024: 8 };

  // Parse data rows
  const records = [];
  let currentCustomer = '';

  for (let i = 2; i < data.length; i++) {
    const row = data[i];

    // Update customer name if present
    if (row?.[1]) {
      currentCustomer = row[1];
    }

    const rollup = row?.[2];

    // Skip non-revenue rows (like Annual Variance)
    if (!rollup || !REVENUE_TYPE_MAP[rollup] || !currentCustomer) {
      continue;
    }

    // Map client name to canonical
    const canonicalClient = CLIENT_NAME_MAP[currentCustomer] || currentCustomer;

    // Create records for each year
    for (const [year, col] of Object.entries(yearCols)) {
      const amount = parseFloat(row[col]) || 0;

      // Skip zero amounts
      if (amount === 0) continue;

      records.push({
        client_name: canonicalClient,
        parent_company: 'ADHI', // All APAC clients are under ADHI
        product: rollup.replace(' Revenue', ''), // e.g., "Maintenance" from "Maintenance Revenue"
        revenue_type: REVENUE_TYPE_MAP[rollup],
        fiscal_year: parseInt(year),
        amount_usd: amount,
        amount_aud: amount, // USD values in this file
        source_file: 'APAC Revenue 2019 - 2024.xlsx',
      });
    }
  }

  console.log(`Parsed ${records.length} revenue records`);

  // Summary by client
  const clientSummary = {};
  for (const rec of records) {
    if (!clientSummary[rec.client_name]) {
      clientSummary[rec.client_name] = { 2019: 0, 2020: 0, 2021: 0, 2022: 0, 2023: 0, 2024: 0, total: 0 };
    }
    clientSummary[rec.client_name][rec.fiscal_year] += rec.amount_usd;
    clientSummary[rec.client_name].total += rec.amount_usd;
  }

  console.log('\n=== Revenue Summary by Client ===');
  console.log('Client'.padEnd(45) + '| 2024         | Total');
  console.log('-'.repeat(75));
  const sorted = Object.entries(clientSummary).sort((a, b) => b[1].total - a[1].total);
  for (const [client, years] of sorted) {
    console.log(`${client.padEnd(45)}| $${(years[2024] / 1e6).toFixed(2).padStart(7)}M | $${(years.total / 1e6).toFixed(2)}M`);
  }

  // Total
  const totals = { 2019: 0, 2020: 0, 2021: 0, 2022: 0, 2023: 0, 2024: 0, total: 0 };
  for (const years of Object.values(clientSummary)) {
    for (const y of [2019, 2020, 2021, 2022, 2023, 2024]) {
      totals[y] += years[y];
    }
    totals.total += years.total;
  }
  console.log('-'.repeat(75));
  console.log(`${'TOTAL'.padEnd(45)}| $${(totals[2024] / 1e6).toFixed(2).padStart(7)}M | $${(totals.total / 1e6).toFixed(2)}M`);

  if (DRY_RUN) {
    console.log('\n[DRY RUN] Would delete existing records with source_file = "APAC Revenue 2019 - 2024.xlsx"');
    console.log(`[DRY RUN] Would insert ${records.length} new records`);
    console.log('\nRun without --dry-run to apply changes.');
    return;
  }

  // Delete existing records from this source
  console.log('\nDeleting existing records from this source...');
  const { error: deleteError, count: deleteCount } = await supabase
    .from('burc_historical_revenue_detail')
    .delete()
    .eq('source_file', 'APAC Revenue 2019 - 2024.xlsx');

  if (deleteError) {
    console.error('Delete error:', deleteError);
    return;
  }
  console.log(`Deleted ${deleteCount || 0} existing records`);

  // Insert in batches
  console.log(`Inserting ${records.length} records...`);
  const BATCH_SIZE = 500;
  let inserted = 0;

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const { error: insertError } = await supabase
      .from('burc_historical_revenue_detail')
      .insert(batch);

    if (insertError) {
      console.error('Insert error at batch', i / BATCH_SIZE, insertError);
      return;
    }
    inserted += batch.length;
    process.stdout.write(`\rInserted ${inserted}/${records.length} records`);
  }

  console.log('\n\n=== Sync Complete ===');
  console.log(`Total records inserted: ${records.length}`);
}

syncHistoricalRevenue().catch(console.error);
