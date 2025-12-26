/**
 * Find all possible Tracey Bland clients across tables
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const allClients = new Set();

  // Check unified_meetings
  console.log('=== UNIFIED_MEETINGS ===');
  const { data: meetings } = await supabase
    .from('unified_meetings')
    .select('client_name, organizer_name')
    .eq('organizer_name', 'Tracey Bland');

  const meetingClients = [...new Set(meetings?.map(m => m.client_name).filter(Boolean))];
  console.log('Clients from meetings:', meetingClients.length);
  meetingClients.forEach(c => { allClients.add(c); console.log(`  - ${c}`); });

  // Check aged_accounts_history
  console.log('\n=== AGED_ACCOUNTS_HISTORY ===');
  const { data: aging } = await supabase
    .from('aged_accounts_history')
    .select('client_name, cse_name')
    .eq('cse_name', 'Tracey Bland');

  const agingClients = [...new Set(aging?.map(a => a.client_name).filter(Boolean))];
  console.log('Clients from aging:', agingClients.length);
  agingClients.forEach(c => { allClients.add(c); console.log(`  - ${c}`); });

  // Check nps_responses
  console.log('\n=== NPS_RESPONSES ===');
  const { data: nps } = await supabase
    .from('nps_responses')
    .select('client_name, cse_name')
    .eq('cse_name', 'Tracey Bland');

  const npsClients = [...new Set(nps?.map(n => n.client_name).filter(Boolean))];
  console.log('Clients from NPS:', npsClients.length);
  npsClients.forEach(c => { allClients.add(c); console.log(`  - ${c}`); });

  // Check actions
  console.log('\n=== ACTIONS ===');
  const { data: actions } = await supabase
    .from('actions')
    .select('client, Owners')
    .eq('Owners', 'Tracey Bland');

  const actionClients = [...new Set(actions?.map(a => a.client).filter(Boolean))];
  console.log('Clients from actions:', actionClients.length);
  actionClients.forEach(c => { allClients.add(c); console.log(`  - ${c}`); });

  // Summary
  console.log('\n=== ALL UNIQUE CLIENTS ===');
  console.log('Total unique clients found:', allClients.size);
  [...allClients].sort().forEach(c => console.log(`  - ${c}`));

  // Current in client_segmentation
  console.log('\n=== CURRENTLY IN CLIENT_SEGMENTATION ===');
  const { data: seg } = await supabase
    .from('client_segmentation')
    .select('client_name')
    .eq('cse_name', 'Tracey Bland');

  const segClients = new Set(seg?.map(s => s.client_name));
  console.log('Currently assigned:', segClients.size);

  // Missing
  console.log('\n=== MISSING FROM CLIENT_SEGMENTATION ===');
  const missing = [...allClients].filter(c => !segClients.has(c));
  console.log('Missing clients:', missing.length);
  missing.forEach(c => console.log(`  - ${c}`));
}

main().catch(console.error);
