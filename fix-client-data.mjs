/**
 * Fix client data issues:
 * 1. Add missing clients for Tracey Bland
 * 2. Check Nikki Wei's data
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  // === TRACEY BLAND: Add missing clients ===
  console.log('=== FIXING TRACEY BLAND CLIENTS ===\n');

  const traceyClients = [
    'Department of Health - Victoria',
    'Te Whatu Ora Waikato',
  ];

  // Get an existing record to use as template for tier_id
  const { data: traceyTemplate } = await supabase
    .from('client_segmentation')
    .select('tier_id')
    .eq('cse_name', 'Tracey Bland')
    .limit(1);

  const tierId = traceyTemplate?.[0]?.tier_id || 'tier_strategic';

  for (const clientName of traceyClients) {
    // Check if already exists
    const { data: check } = await supabase
      .from('client_segmentation')
      .select('id')
      .eq('client_name', clientName)
      .limit(1);

    if (check && check.length > 0) {
      console.log(`⏭️ ${clientName} - already exists`);
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
      console.log(`✅ ${clientName} - added`);
    }
  }

  // Verify Tracey
  const { data: traceyFinal } = await supabase
    .from('client_segmentation')
    .select('client_name')
    .eq('cse_name', 'Tracey Bland');

  console.log(`\nTracey Bland now has ${traceyFinal?.length || 0} clients:`);
  traceyFinal?.forEach(c => console.log(`  - ${c.client_name}`));

  // === NIKKI WEI: Check data ===
  console.log('\n\n=== CHECKING NIKKI WEI DATA ===\n');

  // Clients in segmentation
  const { data: nikkiClients } = await supabase
    .from('client_segmentation')
    .select('client_name')
    .eq('cse_name', 'Nikki Wei');

  console.log(`Nikki Wei clients in segmentation: ${nikkiClients?.length || 0}`);
  nikkiClients?.forEach(c => console.log(`  - ${c.client_name}`));

  // Check health data for each
  const nikkiClientNames = nikkiClients?.map(c => c.client_name) || [];

  console.log('\nHealth data for each client:');
  for (const clientName of nikkiClientNames) {
    const { data: healthData } = await supabase
      .from('client_health_history')
      .select('client_name, health_score, status, snapshot_date')
      .eq('client_name', clientName)
      .order('snapshot_date', { ascending: false })
      .limit(1);

    if (healthData && healthData.length > 0) {
      const h = healthData[0];
      console.log(`  ✓ ${clientName}: Score ${h.health_score}, Status: ${h.status}`);
    } else {
      console.log(`  ✗ ${clientName}: NO HEALTH DATA`);
    }
  }
}

main().catch(console.error);
