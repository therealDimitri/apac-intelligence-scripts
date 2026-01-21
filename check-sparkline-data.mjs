import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  // Get unique client names from health history
  const { data: healthHistory, error: hhError } = await supabase
    .from('client_health_history')
    .select('client_name')
    .order('client_name');

  if (hhError) {
    console.log('Error fetching health history:', hhError.message);
    return;
  }

  // Get unique names
  const uniqueNames = [...new Set(healthHistory.map(r => r.client_name))];

  console.log('=== Client names in client_health_history ===');
  console.log('Total unique clients:', uniqueNames.length);
  uniqueNames.forEach(n => console.log('  - ' + n));

  // Check specific clients
  console.log('\n=== Checking specific clients ===');

  const checkClients = [
    'SA Health',
    'The Royal Victorian Eye and Ear Hospital',
    'RVEEH',
    'SA Health (iPro)',
    'SA Health (Sunrise)',
    'SA Health (iQemo)'
  ];

  for (const clientName of checkClients) {
    const { data, count } = await supabase
      .from('client_health_history')
      .select('*', { count: 'exact' })
      .ilike('client_name', `%${clientName}%`)
      .limit(5);

    console.log(`\n"${clientName}": ${count || 0} records`);
    if (data && data.length > 0) {
      data.slice(0, 3).forEach(r => console.log(`  - ${r.snapshot_date}: score=${r.health_score}`));
    }
  }

  // Check what names the clients table uses
  console.log('\n=== Checking clients table for SA Health variants ===');
  const { data: clients } = await supabase
    .from('clients')
    .select('id, canonical_name')
    .or('canonical_name.ilike.%SA Health%,canonical_name.ilike.%Royal Victorian%,canonical_name.ilike.%RVEEH%');

  if (clients) {
    clients.forEach(c => console.log(`  - ${c.id}: ${c.canonical_name}`));
  }
}

check();
