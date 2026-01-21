import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  // Get FY2025 detail data by revenue type
  const { data } = await supabase
    .from('burc_historical_revenue_detail')
    .select('revenue_type, amount_usd, client_name')
    .eq('fiscal_year', 2025);

  // Exclude aggregate rows
  const excludeNames = ['apac total', 'total', 'baseline', '(blank)', 'dbm to apac profit share', 'hosting to apac profit share', 'ms to apac profit share'];

  const byType = {};
  const byTypeAll = {};
  const excludedByType = {};

  data.forEach(r => {
    const type = r.revenue_type || 'Unknown';
    const clientLower = (r.client_name || '').toLowerCase().trim();
    const isExcluded = excludeNames.some(e => clientLower.includes(e) || clientLower === e);

    // Track all (including aggregates)
    if (!byTypeAll[type]) byTypeAll[type] = 0;
    byTypeAll[type] += r.amount_usd || 0;

    if (isExcluded) {
      // Track excluded
      if (!excludedByType[type]) excludedByType[type] = { total: 0, clients: new Set() };
      excludedByType[type].total += r.amount_usd || 0;
      excludedByType[type].clients.add(r.client_name);
    } else {
      // Track filtered
      if (!byType[type]) byType[type] = 0;
      byType[type] += r.amount_usd || 0;
    }
  });

  console.log('=== FY2025 Revenue by Type (burc_historical_revenue_detail) ===\n');
  console.log('Type                  | All Data    | Filtered    | Excel');
  console.log('-'.repeat(65));

  const excelValues = {
    'Software': 1140000,
    'Professional Services': 7080000,
    'Maintenance': 17900000,
    'Hardware': 230000
  };

  Object.keys(byTypeAll).sort().forEach(type => {
    const all = (byTypeAll[type]/1000000).toFixed(2);
    const filtered = ((byType[type] || 0)/1000000).toFixed(2);
    const excel = excelValues[type] ? (excelValues[type]/1000000).toFixed(2) : 'N/A';
    console.log(type.padEnd(21) + ' | $' + all.padStart(8) + 'M | $' + filtered.padStart(8) + 'M | $' + excel + 'M');
  });

  console.log('-'.repeat(65));
  const totalAll = Object.values(byTypeAll).reduce((a,b) => a+b, 0);
  const totalFiltered = Object.values(byType).reduce((a,b) => a+b, 0);
  console.log('TOTAL'.padEnd(21) + ' | $' + (totalAll/1000000).toFixed(2).padStart(8) + 'M | $' + (totalFiltered/1000000).toFixed(2).padStart(8) + 'M | $26.34M');

  console.log('\n=== Excluded amounts by type ===');
  Object.keys(excludedByType).forEach(type => {
    console.log(type + ': $' + (excludedByType[type].total/1000000).toFixed(2) + 'M');
    console.log('  Clients: ' + Array.from(excludedByType[type].clients).join(', '));
  });

  // Also check what the burc_annual_financials table has for breakdown
  const { data: annual } = await supabase
    .from('burc_annual_financials')
    .select('*')
    .eq('fiscal_year', 2025)
    .single();

  console.log('\n=== burc_annual_financials FY2025 ===');
  if (annual) {
    console.log('SW Revenue: $' + ((annual.sw_revenue || 0)/1000000).toFixed(2) + 'M');
    console.log('PS Revenue: $' + ((annual.ps_revenue || 0)/1000000).toFixed(2) + 'M');
    console.log('Maint Revenue: $' + ((annual.maint_revenue || 0)/1000000).toFixed(2) + 'M');
    console.log('HW Revenue: $' + ((annual.hw_revenue || 0)/1000000).toFixed(2) + 'M');
    console.log('Gross Revenue: $' + ((annual.gross_revenue || 0)/1000000).toFixed(2) + 'M');
  }
}

check();
