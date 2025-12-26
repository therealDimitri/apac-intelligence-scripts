/**
 * Reassign clients to correct CSEs
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  // Check current assignments for problem clients
  const checkClients = [
    'Mount Alvernia Hospital',
    'Department of Health - Victoria',
    'Te Whatu Ora Waikato',
    'Parkway',
  ];

  console.log('=== CURRENT ASSIGNMENTS ===\n');
  for (const clientName of checkClients) {
    const { data } = await supabase
      .from('client_segmentation')
      .select('id, client_name, cse_name, effective_from, effective_to')
      .eq('client_name', clientName);

    if (data && data.length > 0) {
      console.log(`${clientName}:`);
      data.forEach(d => {
        console.log(`  CSE: ${d.cse_name}, From: ${d.effective_from}, To: ${d.effective_to || 'NULL'}`);
      });
    } else {
      console.log(`${clientName}: NOT FOUND`);
    }
  }

  // === FIX 1: Reassign Parkway to Mount Alvernia Hospital for Nikki Wei ===
  console.log('\n\n=== FIXING NIKKI WEI ===\n');

  // Option: Delete Parkway and ensure Mount Alvernia is assigned to Nikki
  const { data: parkway } = await supabase
    .from('client_segmentation')
    .select('id')
    .eq('client_name', 'Parkway')
    .eq('cse_name', 'Nikki Wei');

  if (parkway && parkway.length > 0) {
    // Delete Parkway (incorrect client name)
    const { error } = await supabase
      .from('client_segmentation')
      .delete()
      .eq('id', parkway[0].id);

    if (error) {
      console.log(`❌ Delete Parkway: ${error.message}`);
    } else {
      console.log(`✅ Deleted "Parkway" from Nikki's assignments`);
    }
  }

  // Check/update Mount Alvernia assignment
  const { data: mountAlvernia } = await supabase
    .from('client_segmentation')
    .select('id, cse_name')
    .eq('client_name', 'Mount Alvernia Hospital');

  if (mountAlvernia && mountAlvernia.length > 0) {
    if (mountAlvernia[0].cse_name !== 'Nikki Wei') {
      // Update to Nikki Wei
      const { error } = await supabase
        .from('client_segmentation')
        .update({ cse_name: 'Nikki Wei', updated_at: new Date().toISOString() })
        .eq('id', mountAlvernia[0].id);

      if (error) {
        console.log(`❌ Reassign Mount Alvernia to Nikki: ${error.message}`);
      } else {
        console.log(`✅ Reassigned "Mount Alvernia Hospital" to Nikki Wei`);
      }
    } else {
      console.log(`⏭️ Mount Alvernia Hospital already assigned to Nikki Wei`);
    }
  }

  // === FIX 2: Reassign Tracey's clients ===
  console.log('\n\n=== FIXING TRACEY BLAND ===\n');

  const traceyClients = ['Department of Health - Victoria', 'Te Whatu Ora Waikato'];

  for (const clientName of traceyClients) {
    const { data: existing } = await supabase
      .from('client_segmentation')
      .select('id, cse_name')
      .eq('client_name', clientName);

    if (existing && existing.length > 0) {
      if (existing[0].cse_name !== 'Tracey Bland') {
        const { error } = await supabase
          .from('client_segmentation')
          .update({ cse_name: 'Tracey Bland', updated_at: new Date().toISOString() })
          .eq('id', existing[0].id);

        if (error) {
          console.log(`❌ ${clientName}: ${error.message}`);
        } else {
          console.log(`✅ Reassigned "${clientName}" from ${existing[0].cse_name} to Tracey Bland`);
        }
      } else {
        console.log(`⏭️ ${clientName} already assigned to Tracey Bland`);
      }
    } else {
      console.log(`⚠️ ${clientName} not found in client_segmentation`);
    }
  }

  // === FINAL VERIFICATION ===
  console.log('\n\n=== FINAL VERIFICATION ===\n');

  const { data: nikkiFinal } = await supabase
    .from('client_segmentation')
    .select('client_name')
    .eq('cse_name', 'Nikki Wei');

  console.log(`Nikki Wei clients (${nikkiFinal?.length || 0}):`);
  for (const c of nikkiFinal || []) {
    const { data: h } = await supabase
      .from('client_health_history')
      .select('health_score, status')
      .eq('client_name', c.client_name)
      .order('snapshot_date', { ascending: false })
      .limit(1);

    const healthInfo = h?.[0] ? `Score: ${h[0].health_score}, Status: ${h[0].status}` : 'NO HEALTH DATA';
    console.log(`  - ${c.client_name}: ${healthInfo}`);
  }

  const { data: traceyFinal } = await supabase
    .from('client_segmentation')
    .select('client_name')
    .eq('cse_name', 'Tracey Bland');

  console.log(`\nTracey Bland clients (${traceyFinal?.length || 0}):`);
  traceyFinal?.forEach(c => console.log(`  - ${c.client_name}`));
}

main().catch(console.error);
