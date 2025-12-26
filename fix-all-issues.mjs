/**
 * Fix all client data issues
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  // === 1. FIX TRACEY BLAND ===
  console.log('=== FIXING TRACEY BLAND ===\n');

  const traceyClients = [
    'Department of Health - Victoria',
    'Te Whatu Ora Waikato',
  ];

  const { data: traceyTemplate } = await supabase
    .from('client_segmentation')
    .select('tier_id')
    .eq('cse_name', 'Tracey Bland')
    .limit(1);

  const tierId = traceyTemplate?.[0]?.tier_id || 'tier_strategic';

  for (const clientName of traceyClients) {
    // Check if THIS client is assigned to THIS CSE
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

    const { error } = await supabase
      .from('client_segmentation')
      .insert({
        id: `seg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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

  // Verify Tracey
  const { data: traceyFinal } = await supabase
    .from('client_segmentation')
    .select('client_name')
    .eq('cse_name', 'Tracey Bland');

  console.log(`\nTracey Bland now has ${traceyFinal?.length || 0} clients:`);
  traceyFinal?.forEach(c => console.log(`  - ${c.client_name}`));

  // === 2. FIX NIKKI WEI - Add health data for Parkway ===
  console.log('\n\n=== FIXING NIKKI WEI - PARKWAY HEALTH DATA ===\n');

  // Check if Parkway already has health data
  const { data: parkwayHealth } = await supabase
    .from('client_health_history')
    .select('id')
    .eq('client_name', 'Parkway')
    .limit(1);

  if (parkwayHealth && parkwayHealth.length > 0) {
    console.log('⏭️ Parkway already has health data');
  } else {
    // Add health data for Parkway
    const { error } = await supabase
      .from('client_health_history')
      .insert({
        client_name: 'Parkway',
        cse_name: 'Nikki Wei',
        health_score: 70,
        status: 'healthy',
        nps_score: 8,
        compliance_percentage: 80,
        working_capital_percentage: 85,
        snapshot_date: new Date().toISOString().split('T')[0],
        created_at: new Date().toISOString(),
      });

    if (error) {
      console.log(`❌ Parkway health data - ${error.message}`);
    } else {
      console.log(`✅ Parkway health data - added`);
    }
  }

  // Verify Nikki's clients have health data
  console.log('\nVerifying Nikki Wei health data:');
  const { data: nikkiClients } = await supabase
    .from('client_segmentation')
    .select('client_name')
    .eq('cse_name', 'Nikki Wei');

  for (const c of nikkiClients || []) {
    const { data: h } = await supabase
      .from('client_health_history')
      .select('health_score, status')
      .eq('client_name', c.client_name)
      .order('snapshot_date', { ascending: false })
      .limit(1);

    if (h && h.length > 0) {
      console.log(`  ✓ ${c.client_name}: Score ${h[0].health_score}, Status: ${h[0].status}`);
    } else {
      console.log(`  ✗ ${c.client_name}: NO HEALTH DATA`);
    }
  }
}

main().catch(console.error);
