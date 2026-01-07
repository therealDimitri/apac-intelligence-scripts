/**
 * Fix 2025 client names to match canonical names used in 2019-2024 data
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Mapping from 2025 names to canonical names
const NAME_FIXES = {
  'SA Health': 'SA Health (iPro)',
  'Gippsland Health Alliance': 'Gippsland Health Alliance (GHA)',
  'NCS/MinDef': 'NCS/MinDef Singapore',
  'St Luke\'s Medical Center Global City Inc': 'Saint Luke\'s Medical Centre (SLMC)',
  'Waikato District Health Board': 'Te Whatu Ora Waikato',
  'The Royal Victorian Eye and Ear Hospital': 'Royal Victorian Eye and Ear Hospital',
  'GRMC': 'Guam Regional Medical City (GRMC)',
  'Western Australia Department Of Health': 'WA Health',
};

async function fixNames() {
  console.log('=== Fixing 2025 Client Names ===\n');

  for (const [oldName, newName] of Object.entries(NAME_FIXES)) {
    console.log(`Updating: "${oldName}" → "${newName}"`);

    const { data, error } = await supabase
      .from('burc_historical_revenue_detail')
      .update({ client_name: newName })
      .eq('client_name', oldName)
      .eq('fiscal_year', 2025)
      .select();

    if (error) {
      console.log(`  ERROR: ${error.message}`);
    } else {
      console.log(`  Updated ${data?.length || 0} records`);
    }
  }

  console.log('\n=== Verifying Fix ===\n');

  // Check clients in 2025 now
  const { data: clients2025 } = await supabase
    .from('burc_historical_revenue_detail')
    .select('client_name')
    .eq('fiscal_year', 2025);

  const uniqueClients = [...new Set(clients2025?.map(r => r.client_name))].sort();
  console.log('2025 Clients after fix:');
  for (const c of uniqueClients) {
    console.log(`  - ${c}`);
  }

  // Check overlap with 2024
  const { data: clients2024 } = await supabase
    .from('burc_historical_revenue_detail')
    .select('client_name')
    .eq('fiscal_year', 2024);

  const unique2024 = new Set(clients2024?.map(r => r.client_name));
  const unique2025 = new Set(clients2025?.map(r => r.client_name));

  let overlap = 0;
  for (const c of unique2025) {
    if (unique2024.has(c)) overlap++;
  }

  console.log(`\n2024 clients: ${unique2024.size}`);
  console.log(`2025 clients: ${unique2025.size}`);
  console.log(`Overlap: ${overlap} clients`);
}

fixNames().catch(console.error);
