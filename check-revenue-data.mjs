import { config } from 'dotenv';
config({ path: '/Users/jimmy.leimonitis/Documents/GitHub/apac-intelligence-v2/.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  // Check burc_annual_financials
  const { data: annual, error: err1 } = await supabase
    .from('burc_annual_financials')
    .select('fiscal_year, gross_revenue')
    .order('fiscal_year');

  console.log('=== burc_annual_financials ===');
  if (err1) {
    console.log('Error:', err1.message);
  } else {
    console.log('Records:', annual.length);
    annual.forEach(r => console.log('FY' + r.fiscal_year + ': $' + (r.gross_revenue/1000000).toFixed(2) + 'M'));
  }

  // Check burc_historical_revenue_detail counts by year
  const { data: detail, error: err2 } = await supabase
    .from('burc_historical_revenue_detail')
    .select('fiscal_year, amount_usd')
    .order('fiscal_year');

  console.log('\n=== burc_historical_revenue_detail ===');
  if (err2) {
    console.log('Error:', err2.message);
  } else {
    // Group by year
    const byYear = {};
    detail.forEach(r => {
      if (!byYear[r.fiscal_year]) byYear[r.fiscal_year] = { count: 0, total: 0 };
      byYear[r.fiscal_year].count++;
      byYear[r.fiscal_year].total += r.amount_usd || 0;
    });
    console.log('Total records:', detail.length);
    Object.keys(byYear).sort().forEach(y => {
      console.log('FY' + y + ': ' + byYear[y].count + ' records, $' + (byYear[y].total/1000000).toFixed(2) + 'M');
    });
  }
}

check();
