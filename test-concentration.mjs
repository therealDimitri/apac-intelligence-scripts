import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Copy of the CLIENT_PARENT_MAP from the API
const CLIENT_PARENT_MAP = {
  // SA Health family
  'sa health (ipro)': 'SA Health',
  'sa health (sunrise)': 'SA Health',
  'sa health (iqemo)': 'SA Health',
  'minister for health aka south australia health': 'SA Health',
  'south australia health': 'SA Health',

  // SingHealth family
  'singapore health services': 'SingHealth',
  'singapore health services pte ltd': 'SingHealth',
  'singapore general hospital pte ltd': 'SingHealth',
  'changi general hospital': 'SingHealth',
  'sengkang general hospital pte. ltd.': 'SingHealth',
  'sengkang health pte ltd': 'SingHealth',
  'national cancer centre of singapore pte ltd': 'SingHealth',
  'national heart centre of singapore pte ltd.': 'SingHealth',

  // WA Health family
  'western australia doh': 'WA Health',
  'western australia department of health': 'WA Health',

  // GHA family
  'gippsland health alliance': 'GHA',
  'gippsland health alliance (gha)': 'GHA',

  // GHA Regional (separate from GHA)
  'gha regional': 'GHA Regional',

  // GRMC family
  'grmc (guam regional medical centre)': 'GRMC',
  'guam regional medical city (grmc)': 'GRMC',
  'guam regional medical city': 'GRMC',

  // SLMC family
  "st luke's medical center global city inc": 'SLMC',
  "saint luke's medical centre (slmc)": 'SLMC',
  "st. luke's medical center": 'SLMC',

  // NCS/MinDef family
  'ministry of defence, singapore': 'NCS/MinDef Singapore',
  'ncs pte ltd': 'NCS/MinDef Singapore',

  // Vic Health
  'department of health - victoria': 'Vic Health',

  // Exclude aggregation rows - these should be filtered out
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

async function testConcentration() {
  // Fetch all data
  const { data, error } = await supabase
    .from('burc_historical_revenue_detail')
    .select('client_name, fiscal_year, amount_usd')
    .gte('fiscal_year', 2019);

  if (error) {
    console.log('Error:', error.message);
    return;
  }

  console.log(`Fetched ${data.length} records`);

  // Test the filtering
  const yearlyClientRevenue = {};
  let excludedCount = 0;
  const excludedNames = new Set();
  const includedNames = new Set();

  data.forEach(row => {
    const year = row.fiscal_year;
    const rawClient = row.client_name;
    if (!rawClient) return;

    const client = getConsolidatedClientName(rawClient);
    if (!client) {
      excludedCount++;
      excludedNames.add(rawClient);
      return;
    }

    includedNames.add(rawClient + ' -> ' + client);

    if (!yearlyClientRevenue[year]) {
      yearlyClientRevenue[year] = {};
    }
    yearlyClientRevenue[year][client] =
      (yearlyClientRevenue[year][client] || 0) + (row.amount_usd || 0);
  });

  console.log(`\nExcluded ${excludedCount} rows with names:`, Array.from(excludedNames));

  console.log('\n=== Clients per year (after filtering) ===');
  Object.entries(yearlyClientRevenue).sort(([a], [b]) => a - b).forEach(([year, clients]) => {
    const sortedClients = Object.entries(clients).sort(([,a], [,b]) => b - a);
    const totalRevenue = sortedClients.reduce((sum, [, amount]) => sum + amount, 0);

    console.log(`\nFY${year}: ${sortedClients.length} clients, Total: $${(totalRevenue/1000000).toFixed(2)}M`);

    // Show top 5 clients
    console.log('Top 5:');
    sortedClients.slice(0, 5).forEach(([name, amount], i) => {
      const pct = ((amount / totalRevenue) * 100).toFixed(1);
      console.log(`  ${i+1}. ${name}: $${(amount/1000000).toFixed(2)}M (${pct}%)`);
    });

    // Calculate concentration
    const top5Revenue = sortedClients.slice(0, 5).reduce((sum, [, amount]) => sum + amount, 0);
    const top5Pct = (top5Revenue / totalRevenue * 100).toFixed(1);
    const hhi = sortedClients.reduce((sum, [, amount]) => {
      const share = amount / totalRevenue;
      return sum + share * share;
    }, 0) * 10000;

    console.log(`Top 5 concentration: ${top5Pct}%, HHI: ${hhi.toFixed(0)}`);
  });
}

testConcentration();
