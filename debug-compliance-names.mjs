import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  // Get unique client names from segmentation_events
  const { data: seClients } = await supabase
    .from('segmentation_events')
    .select('client_name')
    .eq('event_year', 2025);

  const seNames = [...new Set(seClients?.map(c => c.client_name) || [])].sort();

  console.log('=== segmentation_events client names (2025) ===');
  seNames.forEach(n => console.log('  "' + n + '"'));

  // Get unique client names from segmentation_event_compliance
  const { data: secClients } = await supabase
    .from('segmentation_event_compliance')
    .select('client_name')
    .eq('year', 2025);

  const secNames = [...new Set(secClients?.map(c => c.client_name) || [])].sort();

  console.log('\n=== segmentation_event_compliance client names (2025) ===');
  secNames.forEach(n => console.log('  "' + n + '"'));

  // Get nps_clients names
  const { data: npsClients } = await supabase
    .from('nps_clients')
    .select('client_name')
    .order('client_name');

  const npsNames = npsClients?.map(c => c.client_name) || [];

  console.log('\n=== nps_clients names ===');
  npsNames.forEach(n => console.log('  "' + n + '"'));

  // Check if segmentation_events uses nps_clients names or different names
  console.log('\n=== Do segmentation_events names match nps_clients? ===');
  const seMatchesNps = seNames.filter(n => npsNames.includes(n));
  const seNotInNps = seNames.filter(n => !npsNames.includes(n));

  console.log('Matching:', seMatchesNps.length + '/' + seNames.length);
  console.log('Not in nps_clients:');
  seNotInNps.forEach(n => console.log('  "' + n + '"'));
}

check().catch(console.error);
