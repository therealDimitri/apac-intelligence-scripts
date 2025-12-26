/**
 * Debug CSE portfolio data - direct Supabase queries
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const cseName = 'Gilbert So';

async function main() {
  console.log(`\n🔍 Debugging portfolio data for ${cseName}...\n`);

  // 1. Check client_segmentation
  console.log('=== CLIENT SEGMENTATION ===');
  const { data: clients, error: clientErr } = await supabase
    .from('client_segmentation')
    .select('*')
    .eq('cse_name', cseName);

  if (clientErr) console.log('Error:', clientErr.message);
  console.log(`Found ${clients?.length || 0} clients in client_segmentation`);
  if (clients?.length > 0) {
    clients.forEach(c => console.log(`  - ${c.client_name} (health: ${c.health_score || 'N/A'})`));
  }

  // 2. Check client_health_history
  console.log('\n=== CLIENT HEALTH HISTORY ===');
  const clientNames = (clients || []).map(c => c.client_name);
  if (clientNames.length > 0) {
    const { data: health, error: healthErr } = await supabase
      .from('client_health_history')
      .select('*')
      .in('client_name', clientNames)
      .order('snapshot_date', { ascending: false })
      .limit(10);

    if (healthErr) console.log('Error:', healthErr.message);
    console.log(`Found ${health?.length || 0} health records`);
    if (health?.length > 0) {
      health.forEach(h => console.log(`  - ${h.client_name}: score=${h.health_score}, status=${h.status}`));
    }
  } else {
    console.log('No clients to check health for');
  }

  // 3. Check cse_client_assignments
  console.log('\n=== CSE_CLIENT_ASSIGNMENTS ===');
  const { data: assignments, error: assignErr } = await supabase
    .from('cse_client_assignments')
    .select('*')
    .eq('cse_name', cseName);

  if (assignErr) console.log('Error:', assignErr.message);
  console.log(`Found ${assignments?.length || 0} assignments`);
  if (assignments?.length > 0) {
    assignments.slice(0, 5).forEach(a => console.log(`  - ${a.client_name}`));
    if (assignments.length > 5) console.log(`  ... and ${assignments.length - 5} more`);
  }

  // 4. Check what CSE names exist in client_segmentation
  console.log('\n=== ALL CSE NAMES IN CLIENT_SEGMENTATION ===');
  const { data: allCSEs } = await supabase
    .from('client_segmentation')
    .select('cse_name');

  const uniqueCSEs = [...new Set((allCSEs || []).map(c => c.cse_name))];
  console.log(`CSE names found: ${uniqueCSEs.join(', ')}`);

  // 5. Check aging_compliance_history for CSE names
  console.log('\n=== ALL CSE NAMES IN AGING_COMPLIANCE_HISTORY ===');
  const { data: agingCSEs } = await supabase
    .from('aging_compliance_history')
    .select('cse_name')
    .limit(100);

  const uniqueAgingCSEs = [...new Set((agingCSEs || []).map(c => c.cse_name))];
  console.log(`CSE names found: ${uniqueAgingCSEs.join(', ')}`);
}

main().catch(console.error);
