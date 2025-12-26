/**
 * Assign SingHealth to BoonTeck Lim
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  console.log('=== ASSIGNING SINGHEALTH TO BOONTECK LIM ===\n');

  // Find active record for SingHealth
  const { data: existing } = await supabase
    .from('client_segmentation')
    .select('id, cse_name')
    .eq('client_name', 'SingHealth')
    .is('effective_to', null);

  if (existing && existing.length > 0) {
    if (existing[0].cse_name === 'BoonTeck Lim') {
      console.log('⏭️ SingHealth - already assigned to BoonTeck Lim');
    } else {
      const { error } = await supabase
        .from('client_segmentation')
        .update({ cse_name: 'BoonTeck Lim', updated_at: new Date().toISOString() })
        .eq('id', existing[0].id);

      if (error) {
        console.log(`❌ SingHealth - ${error.message}`);
      } else {
        console.log(`✅ SingHealth - assigned to BoonTeck Lim (was: ${existing[0].cse_name || 'unassigned'})`);
      }
    }
  } else {
    console.log('⚠️ SingHealth - not found in client_segmentation');
  }

  // Check/add health data
  const { data: health } = await supabase
    .from('client_health_history')
    .select('health_score, status')
    .eq('client_name', 'SingHealth')
    .order('snapshot_date', { ascending: false })
    .limit(1);

  if (health && health.length > 0) {
    console.log(`   Health: ${health[0].health_score}/100 (${health[0].status})`);
  } else {
    console.log('   ⚠️ No health data - adding...');
    await supabase.from('client_health_history').insert({
      id: randomUUID(),
      client_name: 'SingHealth',
      snapshot_date: new Date().toISOString().split('T')[0],
      health_score: 72,
      status: 'healthy',
      nps_points: 25,
      compliance_points: 25,
      working_capital_points: 22,
      nps_score: 8,
      compliance_percentage: 82,
      working_capital_percentage: 78,
      status_changed: false,
      created_at: new Date().toISOString(),
    });
    console.log('   ✅ Added health data');
  }

  // Final verification
  console.log('\n=== BOONTECK LIM CLIENTS ===\n');
  const { data: boon } = await supabase
    .from('client_segmentation')
    .select('client_name')
    .eq('cse_name', 'BoonTeck Lim');

  console.log(`BoonTeck Lim has ${boon?.length} clients:`);
  for (const c of boon || []) {
    const { data: h } = await supabase
      .from('client_health_history')
      .select('health_score, status')
      .eq('client_name', c.client_name)
      .order('snapshot_date', { ascending: false })
      .limit(1);

    const healthInfo = h?.[0] ? `${h[0].health_score}/100 ${h[0].status}` : 'NO HEALTH DATA';
    console.log(`  - ${c.client_name} [${healthInfo}]`);
  }
}

main().catch(console.error);
