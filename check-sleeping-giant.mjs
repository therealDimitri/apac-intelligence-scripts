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
  console.log('=== Sleeping Giant Segment Check ===\n');

  // Get Sleeping Giant clients from nps_clients
  const { data: sgClients } = await supabase
    .from('nps_clients')
    .select('client_name, segment')
    .eq('segment', 'Sleeping Giant');

  console.log('Sleeping Giant clients:', sgClients?.map(c => c.client_name));

  // Get all NPS responses for these clients
  const clientNames = sgClients?.map(c => c.client_name) || [];

  const { data: responses } = await supabase
    .from('nps_responses')
    .select('id, client_name, period, feedback, score')
    .in('client_name', clientNames);

  console.log('\nNPS Responses for Sleeping Giant clients:');
  console.log('Total responses:', responses?.length);

  if (responses?.length > 0) {
    // Group by client
    const byClient = {};
    responses.forEach(r => {
      if (!byClient[r.client_name]) byClient[r.client_name] = [];
      byClient[r.client_name].push(r);
    });

    Object.entries(byClient).forEach(([client, resps]) => {
      console.log(`\n${client}: ${resps.length} responses`);
      resps.slice(0, 3).forEach(r => {
        const feedback = r.feedback ? r.feedback.substring(0, 60) + '...' : '(no feedback)';
        console.log(`  - ID ${r.id} [${r.period}] Score: ${r.score} - ${feedback}`);
      });
    });
  }

  // Check if there are responses with different client names that should match
  console.log('\n=== Checking for Similar Client Names ===');

  const { data: allResponses } = await supabase
    .from('nps_responses')
    .select('client_name')
    .or('client_name.ilike.%singhealth%,client_name.ilike.%wa health%,client_name.ilike.%western australia%');

  const uniqueNames = [...new Set(allResponses?.map(r => r.client_name))];
  console.log('Client names matching SingHealth or WA Health patterns:', uniqueNames);

  // Check client aliases
  console.log('\n=== Client Aliases ===');
  const { data: aliases } = await supabase
    .from('client_aliases')
    .select('display_name, canonical_name')
    .or('display_name.ilike.%singhealth%,display_name.ilike.%wa health%,canonical_name.ilike.%singhealth%,canonical_name.ilike.%wa health%');

  console.log('Aliases for Sleeping Giant clients:', aliases);
}

check().catch(console.error);
