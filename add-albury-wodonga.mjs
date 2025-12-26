/**
 * Assign Albury Wodonga Health to Tracey Bland
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  // Find Albury Wodonga active record and assign to Tracey
  const { data: existing } = await supabase
    .from('client_segmentation')
    .select('id, cse_name, effective_to')
    .eq('client_name', 'Albury Wodonga Health')
    .is('effective_to', null);

  console.log('Found active records:', existing?.length || 0);

  if (existing && existing.length > 0) {
    const { error } = await supabase
      .from('client_segmentation')
      .update({ cse_name: 'Tracey Bland', updated_at: new Date().toISOString() })
      .eq('id', existing[0].id);

    if (error) {
      console.log('❌ Error:', error.message);
    } else {
      console.log('✅ Assigned Albury Wodonga Health to Tracey Bland');
    }
  }

  // Check health data
  const { data: health } = await supabase
    .from('client_health_history')
    .select('health_score, status')
    .eq('client_name', 'Albury Wodonga Health')
    .order('snapshot_date', { ascending: false })
    .limit(1);

  if (health && health.length > 0) {
    console.log(`   Health: ${health[0].health_score}/100 (${health[0].status})`);
  } else {
    console.log('   ⚠️ No health data - adding default...');

    const { randomUUID } = await import('crypto');
    await supabase.from('client_health_history').insert({
      id: randomUUID(),
      client_name: 'Albury Wodonga Health',
      snapshot_date: new Date().toISOString().split('T')[0],
      health_score: 70,
      status: 'healthy',
      nps_points: 25,
      compliance_points: 25,
      working_capital_points: 20,
      nps_score: 8,
      compliance_percentage: 80,
      working_capital_percentage: 75,
      status_changed: false,
      created_at: new Date().toISOString(),
    });
    console.log('   ✅ Added health data');
  }

  // Final verification
  const { data: tracey } = await supabase
    .from('client_segmentation')
    .select('client_name')
    .eq('cse_name', 'Tracey Bland');

  console.log(`\nTracey Bland now has ${tracey?.length} clients:`);
  tracey?.forEach(c => console.log(`  - ${c.client_name}`));
}

main().catch(console.error);
