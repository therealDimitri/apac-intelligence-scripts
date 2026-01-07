/**
 * Check client name mismatches between years
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  const { data } = await supabase
    .from('burc_historical_revenue_detail')
    .select('client_name, fiscal_year, amount_usd, source_file');

  // Get clients and revenue by year
  const clientsByYear = {};
  const revenueByClientYear = {};

  for (const row of data || []) {
    const year = row.fiscal_year;
    const client = row.client_name;
    const amount = parseFloat(row.amount_usd) || 0;

    if (!clientsByYear[year]) clientsByYear[year] = new Set();
    clientsByYear[year].add(client);

    if (!revenueByClientYear[client]) revenueByClientYear[client] = {};
    if (!revenueByClientYear[client][year]) revenueByClientYear[client][year] = 0;
    revenueByClientYear[client][year] += amount;
  }

  console.log('=== Clients by Year ===');
  for (const [year, clients] of Object.entries(clientsByYear).sort()) {
    console.log(`FY${year}: ${clients.size} clients`);
  }

  // Find clients in 2024 but not in 2025
  const clients2024 = clientsByYear[2024] || new Set();
  const clients2025 = clientsByYear[2025] || new Set();

  console.log('');
  console.log('=== Clients in 2024 but NOT in 2025 (Apparent Churn) ===');
  let churnTotal = 0;
  for (const c of clients2024) {
    if (!clients2025.has(c)) {
      const rev = revenueByClientYear[c]?.[2024] || 0;
      churnTotal += rev;
      console.log(`  - ${c}: $${(rev/1e6).toFixed(2)}M`);
    }
  }
  console.log(`  TOTAL: $${(churnTotal/1e6).toFixed(2)}M`);

  console.log('');
  console.log('=== Clients in 2025 but NOT in 2024 (Apparent New) ===');
  let newTotal = 0;
  for (const c of clients2025) {
    if (!clients2024.has(c)) {
      const rev = revenueByClientYear[c]?.[2025] || 0;
      newTotal += rev;
      console.log(`  - ${c}: $${(rev/1e6).toFixed(2)}M`);
    }
  }
  console.log(`  TOTAL: $${(newTotal/1e6).toFixed(2)}M`);

  // Check source files
  console.log('');
  console.log('=== Source Files by Year ===');
  const sourcesByYear = {};
  for (const row of data || []) {
    const year = row.fiscal_year;
    const src = row.source_file || 'null';
    if (!sourcesByYear[year]) sourcesByYear[year] = {};
    sourcesByYear[year][src] = (sourcesByYear[year][src] || 0) + 1;
  }
  for (const [year, sources] of Object.entries(sourcesByYear).sort()) {
    console.log(`FY${year}: ${JSON.stringify(sources)}`);
  }
}

check().catch(console.error);
