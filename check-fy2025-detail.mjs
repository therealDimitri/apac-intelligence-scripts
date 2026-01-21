import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  // Get FY2025 records grouped by client
  const { data, error } = await supabase
    .from('burc_historical_revenue_detail')
    .select('client_name, revenue_type, amount_usd')
    .eq('fiscal_year', 2025)
    .order('amount_usd', { ascending: false });

  if (error) {
    console.log('Error:', error.message);
    return;
  }

  console.log('=== FY2025 Records Analysis ===\n');

  // Group by client
  const byClient = {};
  let totalWithAggregates = 0;
  let totalWithoutAggregates = 0;

  data.forEach(r => {
    const client = r.client_name || '(blank)';
    if (!byClient[client]) byClient[client] = { total: 0, types: {} };
    byClient[client].total += r.amount_usd || 0;

    const type = r.revenue_type || 'Unknown';
    if (!byClient[client].types[type]) byClient[client].types[type] = 0;
    byClient[client].types[type] += r.amount_usd || 0;

    totalWithAggregates += r.amount_usd || 0;

    // Check if this is an aggregate row (APAC Total, Total, etc.)
    const clientLower = client.toLowerCase();
    if (!clientLower.includes('apac total') &&
        !clientLower.includes('total') &&
        !clientLower.includes('baseline') &&
        !clientLower.includes('profit share') &&
        client !== '(blank)') {
      totalWithoutAggregates += r.amount_usd || 0;
    }
  });

  // Sort by total descending
  const sorted = Object.entries(byClient)
    .sort((a, b) => b[1].total - a[1].total);

  console.log('Top 15 clients by revenue:');
  sorted.slice(0, 15).forEach(([client, data], i) => {
    const isAggregate = client.toLowerCase().includes('total') ||
                        client.toLowerCase().includes('baseline') ||
                        client.toLowerCase().includes('profit share') ||
                        client === '(blank)';
    const marker = isAggregate ? ' [AGGREGATE]' : '';
    console.log(`${(i+1).toString().padStart(2)}. ${client.padEnd(50)} $${(data.total/1000000).toFixed(2)}M${marker}`);
  });

  console.log('\n=== Summary ===');
  console.log('Total with aggregates:   $' + (totalWithAggregates/1000000).toFixed(2) + 'M');
  console.log('Total without aggregates: $' + (totalWithoutAggregates/1000000).toFixed(2) + 'M');
  console.log('Expected (annual):        $26.34M');

  // Show aggregate rows
  console.log('\n=== Aggregate/Exclusion Rows ===');
  sorted.filter(([client]) => {
    const clientLower = client.toLowerCase();
    return clientLower.includes('total') ||
           clientLower.includes('baseline') ||
           clientLower.includes('profit share') ||
           client === '(blank)';
  }).forEach(([client, data]) => {
    console.log(`${client.padEnd(50)} $${(data.total/1000000).toFixed(2)}M`);
  });
}

check();
