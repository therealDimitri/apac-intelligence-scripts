/**
 * Check Tracey Bland's clients in the database
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  // Check client_segmentation
  console.log('=== CLIENT_SEGMENTATION TABLE ===');
  const { data: segClients } = await supabase
    .from('client_segmentation')
    .select('client_name, cse_name')
    .eq('cse_name', 'Tracey Bland');

  console.log('Tracey Bland clients:', segClients?.length || 0);
  for (const c of segClients || []) {
    console.log(`  - ${c.client_name}`);
  }

  // Check aging_compliance_history (used by getAllCSENames)
  console.log('\n=== AGING_COMPLIANCE_HISTORY TABLE ===');
  const { data: agingData } = await supabase
    .from('aging_compliance_history')
    .select('cse_name, client_name')
    .eq('cse_name', 'Tracey Bland')
    .order('snapshot_date', { ascending: false })
    .limit(10);

  console.log('Recent records:', agingData?.length || 0);
  const uniqueClients = [...new Set(agingData?.map(d => d.client_name))];
  console.log('Unique clients:', uniqueClients.length);
  for (const c of uniqueClients) {
    console.log(`  - ${c}`);
  }

  // Check client_health_history
  console.log('\n=== CLIENT_HEALTH_HISTORY TABLE ===');
  const clientNames = (segClients || []).map(c => c.client_name);
  const { data: healthData } = await supabase
    .from('client_health_history')
    .select('client_name')
    .in('client_name', clientNames);

  const healthClients = [...new Set(healthData?.map(d => d.client_name))];
  console.log('Clients with health data:', healthClients.length);
  for (const c of healthClients) {
    console.log(`  - ${c}`);
  }
}

main().catch(console.error);
