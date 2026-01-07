import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { data, error } = await supabase
    .from('burc_historical_revenue_detail')
    .select('fiscal_year, amount_usd, source_file');

  if (error) {
    console.error('Error:', error);
    return;
  }

  // Totals by year
  const yearTotals = {};
  const yearTotalsBySource = { excel: {}, other: {} };

  for (const row of data || []) {
    const year = row.fiscal_year;
    if (!yearTotals[year]) yearTotals[year] = 0;
    yearTotals[year] += parseFloat(row.amount_usd) || 0;

    // Track by source
    const isExcel = row.source_file === 'APAC Revenue 2019 - 2024.xlsx';
    const bucket = isExcel ? 'excel' : 'other';
    if (!yearTotalsBySource[bucket][year]) yearTotalsBySource[bucket][year] = 0;
    yearTotalsBySource[bucket][year] += parseFloat(row.amount_usd) || 0;
  }

  console.log('=== Database Revenue by Year (Combined) ===');
  for (const [year, total] of Object.entries(yearTotals).sort()) {
    console.log(`${year}: $${(total / 1e6).toFixed(2)}M`);
  }

  console.log('\n=== From Excel Source Only ===');
  for (const [year, total] of Object.entries(yearTotalsBySource.excel).sort()) {
    console.log(`${year}: $${(total / 1e6).toFixed(2)}M`);
  }

  console.log('\n=== From Other Sources ===');
  for (const [year, total] of Object.entries(yearTotalsBySource.other).sort()) {
    console.log(`${year}: $${(total / 1e6).toFixed(2)}M`);
  }

  console.log('\n=== Expected from User Screenshot ===');
  console.log('2019: $23.92M');
  console.log('2020: $24.12M');
  console.log('2021: $28.98M');
  console.log('2022: $28.08M');
  console.log('2023: $28.88M');
  console.log('2024: $33.04M');
}

run();
