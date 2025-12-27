import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  // Get all unique client names from nps_responses
  const { data: responses } = await supabase
    .from('nps_responses')
    .select('client_name');

  const responseClientNames = [...new Set(responses?.map(r => r.client_name))];
  console.log('Unique client names in nps_responses:', responseClientNames.length);
  console.log(responseClientNames);

  // Get all nps_clients entries
  const { data: clients } = await supabase
    .from('nps_clients')
    .select('client_name, segment');

  console.log('\nnps_clients entries:', clients?.length);

  // Check which nps_clients have NO matching responses
  const noMatch = clients?.filter(c => {
    return responseClientNames.indexOf(c.client_name) === -1;
  }) || [];

  console.log('\nnps_clients with NO matching responses:');
  noMatch.forEach(c => console.log(`  ${c.client_name} (${c.segment})`));

  // Check Sleeping Giant specifically
  console.log('\n=== Sleeping Giant Details ===');
  const sgClients = clients?.filter(c => c.segment === 'Sleeping Giant') || [];
  sgClients.forEach(c => {
    const hasMatch = responseClientNames.indexOf(c.client_name) !== -1;
    console.log(`${c.client_name}: ${hasMatch ? 'MATCHES' : 'NO MATCH'}`);
    if (hasMatch === false) {
      // Find similar names
      const firstWord = c.client_name.toLowerCase().split(' ')[0];
      const similar = responseClientNames.filter(n =>
        n.toLowerCase().includes(firstWord)
      );
      if (similar.length) console.log(`  Similar in responses: ${similar.join(', ')}`);
    }
  });

  // Check client aliases for Sleeping Giant
  console.log('\n=== Client Aliases Check ===');
  const sgNames = sgClients.map(c => c.client_name);
  const { data: aliases } = await supabase
    .from('client_aliases')
    .select('display_name, canonical_name');

  const relevantAliases = aliases?.filter(a =>
    sgNames.includes(a.display_name) || sgNames.includes(a.canonical_name)
  );
  console.log('Aliases for Sleeping Giant clients:', relevantAliases);
}

check().catch(console.error);
