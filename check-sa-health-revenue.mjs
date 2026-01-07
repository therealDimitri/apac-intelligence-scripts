import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  // Sample rows with SA Health
  const { data: saRows } = await supabase
    .from('burc_historical_revenue_detail')
    .select('*')
    .ilike('client_name', '%SA Health%')
    .limit(10);

  console.log('=== SA Health Sample (first 10 rows) ===');
  if (saRows && saRows.length > 0) {
    console.log('Columns:', Object.keys(saRows[0]).join(', '));
    console.log('\n');
    for (const row of saRows.slice(0, 3)) {
      console.log(JSON.stringify(row, null, 2));
    }
  }

  // Get SA Health totals by year
  const { data: allSa } = await supabase
    .from('burc_historical_revenue_detail')
    .select('fiscal_year, amount_usd, amount_aud, revenue_type')
    .ilike('client_name', '%SA Health%');

  console.log('\n=== SA Health Totals by Year ===');
  const yearTotals = {};
  for (const row of allSa || []) {
    const year = row.fiscal_year;
    if (!yearTotals[year]) yearTotals[year] = { usd: 0, aud: 0, count: 0 };
    yearTotals[year].usd += parseFloat(row.amount_usd) || 0;
    yearTotals[year].aud += parseFloat(row.amount_aud) || 0;
    yearTotals[year].count++;
  }

  for (const [year, data] of Object.entries(yearTotals).sort()) {
    console.log(`${year}: USD=$${(data.usd / 1e6).toFixed(2)}M, AUD=$${(data.aud / 1e6).toFixed(2)}M, rows=${data.count}`);
  }

  // Compare with Excel expected
  console.log('\nExpected from Excel (Minister for Health aka South Australia Health 2024): $10.66M');

  // Now check SingHealth
  const { data: singRows } = await supabase
    .from('burc_historical_revenue_detail')
    .select('fiscal_year, amount_usd, amount_aud')
    .ilike('client_name', '%SingHealth%');

  console.log('\n=== SingHealth Totals by Year ===');
  const singTotals = {};
  for (const row of singRows || []) {
    const year = row.fiscal_year;
    if (!singTotals[year]) singTotals[year] = { usd: 0, count: 0 };
    singTotals[year].usd += parseFloat(row.amount_usd) || 0;
    singTotals[year].count++;
  }

  for (const [year, data] of Object.entries(singTotals).sort()) {
    console.log(`${year}: USD=$${(data.usd / 1e6).toFixed(2)}M, rows=${data.count}`);
  }

  console.log('\nExpected from Excel (Singapore Health Services Pte Ltd 2024): $7.86M');
}

run();
