import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function showDistribution() {
  const { data: clients } = await supabase
    .from('clients')
    .select('canonical_name, display_name, country, cse_name')
    .order('country');

  if (!clients) {
    console.log('No clients found');
    return;
  }

  // Anu's region (ANZ)
  const anzClients = clients.filter(c => ['Australia', 'New Zealand'].includes(c.country));
  // Nikki's region (Asia + Guam)
  const asiaClients = clients.filter(c => ['Singapore', 'Guam', 'Philippines', 'Malaysia', 'Hong Kong', 'Thailand'].includes(c.country));

  console.log('=== Anu (ANZ) - ' + anzClients.length + ' clients ===');
  anzClients.forEach(c => console.log('  ' + (c.display_name || c.canonical_name)));

  console.log('\n=== Nikki (Asia/Guam) - ' + asiaClients.length + ' clients ===');
  asiaClients.forEach(c => console.log('  ' + (c.display_name || c.canonical_name)));

  // Unassigned
  const other = clients.filter(c =>
    !['Australia', 'New Zealand', 'Singapore', 'Guam', 'Philippines', 'Malaysia', 'Hong Kong', 'Thailand'].includes(c.country)
  );
  if (other.length > 0) {
    console.log('\n=== Other/Unassigned - ' + other.length + ' clients ===');
    other.forEach(c => console.log('  ' + (c.display_name || c.canonical_name) + ' (' + (c.country || 'no country') + ')'));
  }

  console.log('\n=== Summary ===');
  console.log('Anu (ANZ):', anzClients.length, 'clients');
  console.log('Nikki (Asia/Guam):', asiaClients.length, 'clients');
  console.log('Total:', clients.length, 'clients');
}

showDistribution().catch(console.error);
