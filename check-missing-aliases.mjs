import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  // Get all unique client_names from segmentation_events
  const { data: events, error: eventsError } = await supabase
    .from('segmentation_events')
    .select('client_name')
    .is('client_uuid', null);

  if (eventsError) {
    console.error('Error fetching events:', eventsError);
    return;
  }

  if (!events || events.length === 0) {
    console.log('No events with NULL client_uuid found');
    return;
  }

  const uniqueNames = [...new Set(events.map(e => e.client_name))];
  console.log('Clients in segmentation_events with NULL client_uuid:', uniqueNames.length);

  // Check which ones have aliases
  console.log('\nClients MISSING aliases (need to add):');
  const missing = [];

  for (const name of uniqueNames) {
    const { data: alias } = await supabase
      .from('client_aliases')
      .select('client_uuid')
      .eq('alias', name)
      .single();

    if (!alias) {
      console.log('  -', name);
      missing.push(name);
    }
  }

  // For missing aliases, check if they exist in nps_clients
  console.log('\n\nLooking up nps_clients IDs for missing aliases:');
  for (const name of missing) {
    const { data: client } = await supabase
      .from('nps_clients')
      .select('id, client_name')
      .eq('client_name', name)
      .single();

    if (client) {
      console.log(`  ${name} -> nps_clients.id = ${client.id}`);
    } else {
      console.log(`  ${name} -> NOT FOUND in nps_clients`);
    }
  }
}

run();
