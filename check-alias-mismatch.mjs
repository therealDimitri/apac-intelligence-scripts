import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkMismatch() {
  console.log('=== Checking Alias vs nps_clients Mismatch ===\n');

  // Get all nps_clients
  const { data: clients } = await supabase
    .from('nps_clients')
    .select('client_name')
    .order('client_name');

  // Get all aliases
  const { data: aliases } = await supabase
    .from('client_name_aliases')
    .select('display_name, canonical_name')
    .eq('is_active', true)
    .order('canonical_name');

  console.log('=== nps_clients names ===');
  const clientNames = clients?.map(c => c.client_name) || [];
  console.log(clientNames.join('\n'));

  console.log('\n=== Unique canonical_names in aliases ===');
  const canonicalNames = [...new Set(aliases?.map(a => a.canonical_name) || [])];
  console.log(canonicalNames.join('\n'));

  console.log('\n=== nps_clients NOT in alias canonical_names ===');
  for (const cn of clientNames) {
    if (!canonicalNames.includes(cn)) {
      // Check if it exists as display_name
      const asDisplay = aliases?.find(a => a.display_name === cn);
      if (asDisplay) {
        console.log(`"${cn}" → exists as DISPLAY_NAME (maps to "${asDisplay.canonical_name}")`);
      } else {
        console.log(`"${cn}" → NOT FOUND in aliases at all`);
      }
    }
  }

  console.log('\n=== Compliance client_names ===');
  const { data: compClients } = await supabase
    .from('segmentation_event_compliance')
    .select('client_name')
    .eq('year', 2025);

  const uniqueCompNames = [...new Set(compClients?.map(c => c.client_name) || [])];
  console.log(uniqueCompNames.sort().join('\n'));
}

checkMismatch().catch(console.error);
