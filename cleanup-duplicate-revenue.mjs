/**
 * Cleanup duplicate revenue records from burc_historical_revenue_detail
 *
 * Removes null-source records for years 2019-2024 that duplicate the
 * Excel-synced data from "APAC Revenue 2019 - 2024.xlsx"
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function cleanup() {
  console.log('=== Cleaning up duplicate revenue records ===\n');

  // First, check what we're about to delete
  const { data: toDelete, error: checkError } = await supabase
    .from('burc_historical_revenue_detail')
    .select('fiscal_year, amount_usd, source_file')
    .is('source_file', null)
    .gte('fiscal_year', 2019)
    .lte('fiscal_year', 2024);

  if (checkError) {
    console.error('Check error:', checkError);
    process.exit(1);
  }

  // Summarize what will be deleted
  const summary = {};
  for (const row of toDelete || []) {
    const year = row.fiscal_year;
    if (!summary[year]) summary[year] = { count: 0, total: 0 };
    summary[year].count++;
    summary[year].total += parseFloat(row.amount_usd) || 0;
  }

  console.log('Records to DELETE (null source, 2019-2024):');
  console.log('-'.repeat(50));
  for (const [year, data] of Object.entries(summary).sort()) {
    console.log(`FY${year}: ${data.count} records, $${(data.total/1e6).toFixed(2)}M`);
  }
  console.log('-'.repeat(50));
  console.log(`Total: ${toDelete?.length || 0} records\n`);

  // Now delete the null-source records for 2019-2024
  console.log('Deleting...');

  const { error: deleteError } = await supabase
    .from('burc_historical_revenue_detail')
    .delete()
    .is('source_file', null)
    .gte('fiscal_year', 2019)
    .lte('fiscal_year', 2024);

  if (deleteError) {
    console.error('Delete error:', deleteError);
    process.exit(1);
  }

  console.log(`✓ Deleted ${toDelete?.length || 0} records\n`);

  // Verify remaining data for 2019-2024
  const { data: remaining } = await supabase
    .from('burc_historical_revenue_detail')
    .select('fiscal_year, amount_usd, source_file')
    .gte('fiscal_year', 2019)
    .lte('fiscal_year', 2024);

  const remainingSummary = {};
  for (const row of remaining || []) {
    const year = row.fiscal_year;
    if (!remainingSummary[year]) remainingSummary[year] = { count: 0, total: 0 };
    remainingSummary[year].count++;
    remainingSummary[year].total += parseFloat(row.amount_usd) || 0;
  }

  console.log('Remaining records (2019-2024, from Excel source):');
  console.log('-'.repeat(50));
  for (const [year, data] of Object.entries(remainingSummary).sort()) {
    console.log(`FY${year}: ${data.count} records, $${(data.total/1e6).toFixed(2)}M`);
  }

  // Also check total record count
  const { count: totalCount } = await supabase
    .from('burc_historical_revenue_detail')
    .select('*', { count: 'exact', head: true });

  console.log('-'.repeat(50));
  console.log(`\nTotal records in table: ${totalCount}`);
  console.log('\n✓ Cleanup complete!');
}

cleanup().catch(console.error);
