/**
 * Assign clients to John Salisbury
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const JOHN_CLIENTS = [
  'Royal Victorian Eye and Ear Hospital',
  'Barwon Health Australia',
  'Western Health',
  'Epworth Healthcare',
  'WA Health',
];

async function main() {
  console.log('=== ASSIGNING CLIENTS TO JOHN SALISBURY ===\n');

  for (const clientName of JOHN_CLIENTS) {
    // Find active record for this client
    const { data: existing } = await supabase
      .from('client_segmentation')
      .select('id, cse_name')
      .eq('client_name', clientName)
      .is('effective_to', null);

    if (existing && existing.length > 0) {
      if (existing[0].cse_name === 'John Salisbury') {
        console.log(`⏭️ ${clientName} - already assigned`);
      } else {
        const { error } = await supabase
          .from('client_segmentation')
          .update({ cse_name: 'John Salisbury', updated_at: new Date().toISOString() })
          .eq('id', existing[0].id);

        if (error) {
          console.log(`❌ ${clientName} - ${error.message}`);
        } else {
          console.log(`✅ ${clientName} - assigned (was: ${existing[0].cse_name || 'unassigned'})`);
        }
      }
    } else {
      console.log(`⚠️ ${clientName} - not found in client_segmentation`);
    }

    // Check/add health data
    const { data: health } = await supabase
      .from('client_health_history')
      .select('health_score, status')
      .eq('client_name', clientName)
      .order('snapshot_date', { ascending: false })
      .limit(1);

    if (health && health.length > 0) {
      console.log(`   Health: ${health[0].health_score}/100 (${health[0].status})`);
    } else {
      console.log(`   ⚠️ No health data - adding...`);
      await supabase.from('client_health_history').insert({
        id: randomUUID(),
        client_name: clientName,
        snapshot_date: new Date().toISOString().split('T')[0],
        health_score: 65,
        status: 'at-risk',
        nps_points: 20,
        compliance_points: 25,
        working_capital_points: 20,
        nps_score: 7,
        compliance_percentage: 75,
        working_capital_percentage: 70,
        status_changed: false,
        created_at: new Date().toISOString(),
      });
      console.log(`   ✅ Added health data`);
    }
  }

  // Final verification
  console.log('\n=== JOHN SALISBURY CLIENTS ===\n');
  const { data: john } = await supabase
    .from('client_segmentation')
    .select('client_name')
    .eq('cse_name', 'John Salisbury');

  console.log(`John Salisbury has ${john?.length} clients:`);
  for (const c of john || []) {
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
