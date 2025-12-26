import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runMigration() {
  console.log('=== Running Updated Compliance Formula Fix ===\n');

  const sql = fs.readFileSync('docs/migrations/20251219_fix_health_score_with_aliases.sql', 'utf8');

  const { error } = await supabase.rpc('exec_sql', { sql_query: sql });

  if (error) {
    console.error('Migration error:', error);
    return;
  }

  console.log('✓ Migration completed successfully\n');

  // Verify SLMC
  console.log('=== Verifying SLMC ===');
  const { data: slmc } = await supabase
    .from('client_health_summary')
    .select('compliance_percentage')
    .eq('client_name', "Saint Luke's Medical Centre (SLMC)")
    .single();

  const { data: ecsSLMC } = await supabase
    .from('event_compliance_summary')
    .select('overall_compliance_score')
    .eq('client_name', "Saint Luke's Medical Centre (SLMC)")
    .eq('year', 2025)
    .single();

  console.log('client_health_summary:', slmc?.compliance_percentage + '%');
  console.log('event_compliance_summary:', ecsSLMC?.overall_compliance_score + '%');

  if (slmc?.compliance_percentage === ecsSLMC?.overall_compliance_score) {
    console.log('✓ MATCH!');
  } else {
    console.log('✗ Still mismatched');
  }

  // Verify all clients
  console.log('\n=== Verifying All Clients ===');
  const { data: allHealth } = await supabase
    .from('client_health_summary')
    .select('client_name, compliance_percentage, health_score')
    .order('client_name');

  const { data: allEcs } = await supabase
    .from('event_compliance_summary')
    .select('client_name, overall_compliance_score')
    .eq('year', 2025);

  const ecsMap = new Map((allEcs || []).map(e => [e.client_name, e.overall_compliance_score]));

  let matches = 0;
  let mismatches = 0;

  console.log('\n%-45s | Health | ECS  | Match', 'Client');
  console.log('-'.repeat(75));

  for (const client of allHealth || []) {
    const ecsScore = ecsMap.get(client.client_name);
    const healthScore = client.compliance_percentage;

    if (ecsScore !== undefined) {
      const isMatch = healthScore === ecsScore;
      if (isMatch) matches++;
      else mismatches++;

      console.log(`${client.client_name.padEnd(45)} | ${String(healthScore + '%').padStart(5)} | ${String(ecsScore + '%').padStart(4)} | ${isMatch ? '✓' : '✗'}`);
    } else {
      // No ECS data - using default 50%
      console.log(`${client.client_name.padEnd(45)} | ${String(healthScore + '%').padStart(5)} | N/A  | (default)`);
    }
  }

  console.log('\n=== Summary ===');
  console.log('Matches:', matches);
  console.log('Mismatches:', mismatches);
}

runMigration().catch(console.error);
