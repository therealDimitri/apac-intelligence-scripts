/**
 * Verify all CSE client assignments
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  // Get all CSEs with client counts
  const { data: allSegs } = await supabase
    .from('client_segmentation')
    .select('cse_name, client_name')
    .not('cse_name', 'is', null)
    .order('cse_name');

  // Group by CSE
  const byCSE = {};
  for (const seg of allSegs || []) {
    if (!byCSE[seg.cse_name]) byCSE[seg.cse_name] = [];
    byCSE[seg.cse_name].push(seg.client_name);
  }

  console.log('=== ALL CSE CLIENT ASSIGNMENTS ===\n');
  for (const [cse, clients] of Object.entries(byCSE).sort()) {
    console.log(`${cse} (${clients.length} clients):`);
    for (const c of clients.sort()) {
      // Check health data
      const { data: h } = await supabase
        .from('client_health_history')
        .select('health_score, status')
        .eq('client_name', c)
        .order('snapshot_date', { ascending: false })
        .limit(1);

      const health = h?.[0] ? `${h[0].health_score}/100 ${h[0].status}` : '❌ NO HEALTH DATA';
      console.log(`  - ${c} [${health}]`);
    }
    console.log();
  }

  // Show unassigned clients
  const { data: unassigned } = await supabase
    .from('client_segmentation')
    .select('client_name')
    .is('cse_name', null);

  if (unassigned && unassigned.length > 0) {
    console.log('=== UNASSIGNED CLIENTS ===\n');
    unassigned.forEach(c => console.log(`  - ${c.client_name}`));
  }
}

main().catch(console.error);
