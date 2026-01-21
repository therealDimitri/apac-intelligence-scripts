import { config } from 'dotenv';
config({ path: '/Users/jimmy.leimonitis/Documents/GitHub/apac-intelligence-v2/.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function compare() {
  // Get annual financials from burc_annual_financials
  const { data: annual } = await supabase
    .from('burc_annual_financials')
    .select('fiscal_year, gross_revenue, sw_revenue, ps_revenue, maint_revenue, hw_revenue')
    .gte('fiscal_year', 2024)
    .order('fiscal_year');

  console.log('=== App Database: burc_annual_financials ===');
  annual.forEach(r => {
    console.log('FY' + r.fiscal_year + ':');
    console.log('  Total: $' + (r.gross_revenue/1000000).toFixed(2) + 'M');
    console.log('  SW: $' + ((r.sw_revenue || 0)/1000000).toFixed(2) + 'M');
    console.log('  PS: $' + ((r.ps_revenue || 0)/1000000).toFixed(2) + 'M');
    console.log('  Maint: $' + ((r.maint_revenue || 0)/1000000).toFixed(2) + 'M');
    console.log('  HW: $' + ((r.hw_revenue || 0)/1000000).toFixed(2) + 'M');
  });

  // Get detail data grouped by year
  const { data: detail } = await supabase
    .from('burc_historical_revenue_detail')
    .select('fiscal_year, revenue_type, amount_usd, client_name')
    .gte('fiscal_year', 2024);

  // Aggregate by year and type, excluding aggregates
  const excludeNames = ['apac total', 'total', 'baseline', '(blank)', 'dbm to apac profit share', 'hosting to apac profit share', 'ms to apac profit share'];

  const byYear = {};
  detail.forEach(r => {
    const clientLower = (r.client_name || '').toLowerCase().trim();
    if (excludeNames.some(e => clientLower.includes(e) || clientLower === e)) return;

    const y = r.fiscal_year;
    if (!byYear[y]) byYear[y] = { total: 0, sw: 0, ps: 0, maint: 0, hw: 0 };
    byYear[y].total += r.amount_usd || 0;

    const type = (r.revenue_type || '').toLowerCase();
    if (type.includes('software') || type.includes('license')) byYear[y].sw += r.amount_usd || 0;
    else if (type.includes('professional') || type.includes('ps')) byYear[y].ps += r.amount_usd || 0;
    else if (type.includes('maint')) byYear[y].maint += r.amount_usd || 0;
    else if (type.includes('hardware') || type.includes('hw')) byYear[y].hw += r.amount_usd || 0;
  });

  console.log('\n=== App Database: burc_historical_revenue_detail (filtered) ===');
  Object.entries(byYear).sort().forEach(([y, d]) => {
    console.log('FY' + y + ':');
    console.log('  Total: $' + (d.total/1000000).toFixed(2) + 'M');
    console.log('  SW: $' + (d.sw/1000000).toFixed(2) + 'M');
    console.log('  PS: $' + (d.ps/1000000).toFixed(2) + 'M');
    console.log('  Maint: $' + (d.maint/1000000).toFixed(2) + 'M');
    console.log('  HW: $' + (d.hw/1000000).toFixed(2) + 'M');
  });
}

compare();
