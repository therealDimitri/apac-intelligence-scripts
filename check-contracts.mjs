import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Check ALL contracts in the table
const { data: allContracts, count } = await supabase
  .from('burc_contracts')
  .select('*', { count: 'exact' });

console.log('=== ALL CONTRACTS IN TABLE ===');
console.log('Total rows:', count || allContracts?.length);

// Check by status
const byStatus = {};
allContracts?.forEach(c => {
  const status = c.contract_status || 'null';
  if (!byStatus[status]) byStatus[status] = [];
  byStatus[status].push(c.client_name);
});

console.log('\nBy contract_status:');
Object.entries(byStatus).forEach(([status, clients]) => {
  console.log('  ' + status + ': ' + clients.length + ' - ' + clients.join(', '));
});

// Check columns
if (allContracts && allContracts[0]) {
  console.log('\nColumns:', Object.keys(allContracts[0]).join(', '));
}
