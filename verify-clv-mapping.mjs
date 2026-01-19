import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Test the client name mapping logic (same as in route.ts)
const CLIENT_PARENT_MAP = {
  'minister for health aka south australia health': 'SA Health',
  'south australia health': 'SA Health',
  'singapore health services pte ltd': 'SingHealth',
  'singapore general hospital pte ltd': 'SingHealth',
  'changi general hospital': 'SingHealth',
  'sengkang general hospital pte. ltd.': 'SingHealth',
  'sengkang health pte ltd': 'SingHealth',
  'national cancer centre of singapore pte ltd': 'SingHealth',
  'national heart centre of singapore pte ltd.': 'SingHealth',
  'western australia department of health': 'WA Health',
  'ncs pte ltd': 'NCS/MinDef Singapore',
  "st luke's medical center global city inc": 'SLMC',
  'gippsland health alliance': 'GHA',
  'apac total': '__EXCLUDE__',
  'total': '__EXCLUDE__',
  'baseline': '__EXCLUDE__',
  '(blank)': '__EXCLUDE__',
  'dbm to apac profit share': '__EXCLUDE__',
  'hosting to apac profit share': '__EXCLUDE__',
  'ms to apac profit share': '__EXCLUDE__',
};

function getConsolidatedClientName(clientName) {
  const normalised = clientName.toLowerCase().trim();
  const mapped = CLIENT_PARENT_MAP[normalised];
  if (mapped === '__EXCLUDE__') return null;
  return mapped || clientName;
}

async function check() {
  // Get 2025 data grouped by client
  const { data, error } = await supabase
    .from('burc_historical_revenue_detail')
    .select('client_name, amount_usd')
    .eq('fiscal_year', 2025);

  if (error) {
    console.error('Error:', error);
    return;
  }

  // Apply mapping and aggregate
  const aggregated = {};
  for (const row of data) {
    const mapped = getConsolidatedClientName(row.client_name);
    if (!mapped) continue; // Skip excluded
    if (!aggregated[mapped]) aggregated[mapped] = 0;
    aggregated[mapped] += row.amount_usd || 0;
  }

  // Sort by revenue
  const sorted = Object.entries(aggregated)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  console.log('FY2025 Revenue by Client (after mapping):');
  console.log('==========================================');
  sorted.forEach(([client, revenue], i) => {
    const formatted = (revenue / 1000000).toFixed(2) + 'M';
    console.log(`${(i+1).toString().padStart(2)}. ${client.padEnd(45)} $${formatted}`);
  });
  console.log('');
  console.log('Total clients with 2025 data:', Object.keys(aggregated).length);

  // Show SA Health specifically
  console.log('\n--- SA Health mapping test ---');
  const saHealthRevenue = aggregated['SA Health'] || 0;
  console.log(`SA Health 2025 revenue: $${(saHealthRevenue / 1000000).toFixed(2)}M`);

  // Show SingHealth specifically
  const singHealthRevenue = aggregated['SingHealth'] || 0;
  console.log(`SingHealth 2025 revenue: $${(singHealthRevenue / 1000000).toFixed(2)}M`);
}

check();
