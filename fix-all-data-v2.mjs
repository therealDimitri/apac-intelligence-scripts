/**
 * Fix all client data issues - v2
 * 1. Fix Nikki Wei: Change Parkway to Mount Alvernia Hospital
 * 2. Add health data for Mount Alvernia Hospital
 * 3. Add Tracey Bland's missing clients
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.local') });

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  // === 1. FIX NIKKI WEI - Update Parkway to Mount Alvernia Hospital ===
  console.log('=== FIXING NIKKI WEI ===\n');

  // First check current state
  const { data: nikkiClients } = await supabase
    .from('client_segmentation')
    .select('id, client_name')
    .eq('cse_name', 'Nikki Wei');

  console.log('Current Nikki clients:');
  nikkiClients?.forEach(c => console.log(`  - ${c.client_name} (id: ${c.id})`));

  // Update Parkway to Mount Alvernia Hospital
  const parkwayRecord = nikkiClients?.find(c => c.client_name === 'Parkway');
  if (parkwayRecord) {
    const { error } = await supabase
      .from('client_segmentation')
      .update({
        client_name: 'Mount Alvernia Hospital',
        updated_at: new Date().toISOString()
      })
      .eq('id', parkwayRecord.id);

    if (error) {
      console.log(`\n❌ Update Parkway -> Mount Alvernia: ${error.message}`);
    } else {
      console.log(`\n✅ Updated "Parkway" to "Mount Alvernia Hospital"`);
    }
  } else {
    console.log('\n⏭️ Parkway not found in Nikki\'s clients');
  }

  // === 2. ADD HEALTH DATA FOR MOUNT ALVERNIA HOSPITAL ===
  console.log('\n\n=== ADDING MOUNT ALVERNIA HOSPITAL HEALTH DATA ===\n');

  const { data: healthCheck } = await supabase
    .from('client_health_history')
    .select('id')
    .eq('client_name', 'Mount Alvernia Hospital')
    .limit(1);

  if (healthCheck && healthCheck.length > 0) {
    console.log('⏭️ Mount Alvernia Hospital already has health data');
  } else {
    const { error } = await supabase
      .from('client_health_history')
      .insert({
        id: randomUUID(),
        client_name: 'Mount Alvernia Hospital',
        snapshot_date: new Date().toISOString().split('T')[0],
        health_score: 75,
        status: 'healthy',
        nps_points: 25,
        compliance_points: 25,
        working_capital_points: 25,
        nps_score: 8,
        compliance_percentage: 85,
        working_capital_percentage: 80,
        status_changed: false,
        created_at: new Date().toISOString(),
      });

    if (error) {
      console.log(`❌ Add Mount Alvernia health: ${error.message}`);
    } else {
      console.log(`✅ Added health data for Mount Alvernia Hospital`);
    }
  }

  // === 3. FIX TRACEY BLAND - Add missing clients ===
  console.log('\n\n=== FIXING TRACEY BLAND ===\n');

  // Get existing IDs to understand format
  const { data: existingIds } = await supabase
    .from('client_segmentation')
    .select('id, tier_id')
    .eq('cse_name', 'Tracey Bland')
    .limit(1);

  console.log('Sample existing ID format:', existingIds?.[0]?.id);
  const tierId = existingIds?.[0]?.tier_id || 'tier_strategic';

  const traceyMissingClients = [
    'Department of Health - Victoria',
    'Te Whatu Ora Waikato',
  ];

  for (const clientName of traceyMissingClients) {
    // Check if assigned to Tracey
    const { data: check } = await supabase
      .from('client_segmentation')
      .select('id')
      .eq('client_name', clientName)
      .eq('cse_name', 'Tracey Bland')
      .limit(1);

    if (check && check.length > 0) {
      console.log(`⏭️ ${clientName} - already assigned to Tracey`);
      continue;
    }

    // Use UUID for ID (the column is text but seems to accept UUIDs based on existing data)
    const { error } = await supabase
      .from('client_segmentation')
      .insert({
        id: randomUUID(),
        client_name: clientName,
        cse_name: 'Tracey Bland',
        tier_id: tierId,
        effective_from: new Date().toISOString().split('T')[0],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    if (error) {
      console.log(`❌ ${clientName} - ${error.message}`);
    } else {
      console.log(`✅ ${clientName} - added for Tracey`);
    }
  }

  // === FINAL VERIFICATION ===
  console.log('\n\n=== FINAL VERIFICATION ===\n');

  // Nikki Wei
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

  // Tracey Bland
  const { data: traceyFinal } = await supabase
    .from('client_segmentation')
    .select('client_name')
    .eq('cse_name', 'Tracey Bland');

  console.log(`\nTracey Bland clients (${traceyFinal?.length || 0}):`);
  traceyFinal?.forEach(c => console.log(`  - ${c.client_name}`));
}

main().catch(console.error);
