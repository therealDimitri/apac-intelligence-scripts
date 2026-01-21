import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  // Get ALL FY2025 detail data
  const { data } = await supabase
    .from('burc_historical_revenue_detail')
    .select('revenue_type, amount_usd, client_name')
    .eq('fiscal_year', 2025)
    .order('amount_usd', { ascending: false });

  console.log('=== All FY2025 Records (sorted by amount) ===\n');
  console.log('Amount'.padStart(12) + ' | ' + 'Client'.padEnd(40) + ' | Revenue Type');
  console.log('-'.repeat(90));

  data.forEach(r => {
    const amt = '$' + (r.amount_usd/1000000).toFixed(2) + 'M';
    const client = (r.client_name || '(blank)').substring(0, 40).padEnd(40);
    const type = r.revenue_type || 'Unknown';
    console.log(amt.padStart(12) + ' | ' + client + ' | ' + type);
  });

  console.log('\n=== Summary by revenue_type ===');
  const byType = {};
  data.forEach(r => {
    const type = r.revenue_type || 'Unknown';
    if (!byType[type]) byType[type] = { count: 0, total: 0 };
    byType[type].count++;
    byType[type].total += r.amount_usd || 0;
  });

  Object.entries(byType).sort((a, b) => b[1].total - a[1].total).forEach(([type, stats]) => {
    console.log(type.padEnd(30) + ': ' + stats.count + ' records, $' + (stats.total/1000000).toFixed(2) + 'M');
  });

  // Check unique client names
  console.log('\n=== Unique client names in FY2025 ===');
  const uniqueClients = [...new Set(data.map(r => r.client_name))];
  uniqueClients.forEach(c => console.log('  - ' + c));
}

check();
