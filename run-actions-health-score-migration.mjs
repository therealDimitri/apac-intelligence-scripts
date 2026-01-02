import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runMigration() {
  console.log('=== Running Health Score v4.0 Migration (with Actions) ===\n');

  // Read the migration SQL
  const migrationPath = path.join(process.cwd(), 'docs/migrations/20260102_add_actions_to_health_score.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');

  console.log('Migration file:', migrationPath);
  console.log('SQL length:', migrationSql.length, 'characters\n');

  // Execute the migration
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: migrationSql });

  if (error) {
    console.error('Migration error:', error);
    return;
  }

  console.log('Migration executed successfully!');
  console.log('Result:', data);

  // Wait a moment for the view to be ready
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Verify the results
  console.log('\n=== Verifying Results ===\n');

  const { data: clients } = await supabase
    .from('client_health_summary')
    .select('client_name, health_score, nps_score, compliance_percentage, working_capital_percentage, completion_rate')
    .order('client_name');

  console.log('Client Health Scores (v4.0 - includes Actions):');
  console.log('-'.repeat(120));

  let allMatch = true;

  for (const c of clients || []) {
    const nps = c.nps_score ?? 0;
    const compliance = c.compliance_percentage ?? 50;
    const wc = c.working_capital_percentage ?? 100;
    const actions = c.completion_rate ?? 100;

    // v4.0 formula: NPS 20% + Compliance 60% + WC 10% + Actions 10%
    const npsPoints = ((nps + 100) / 200) * 20;  // 20 pts max
    const compliancePoints = (Math.min(100, compliance) / 100) * 60;  // 60 pts max
    const wcPoints = (Math.min(100, wc) / 100) * 10;  // 10 pts max
    const actionsPoints = (Math.min(100, actions) / 100) * 10;  // 10 pts max
    const expected = Math.round(npsPoints + compliancePoints + wcPoints + actionsPoints);

    const match = expected === c.health_score;
    if (!match) allMatch = false;

    const status = match ? '✓' : '✗';
    console.log(`${status} ${c.client_name.padEnd(35)} | Score: ${String(c.health_score).padStart(3)} | NPS: ${String(nps).padStart(4)} | Comp: ${String(compliance).padStart(3)}% | WC: ${wc !== null ? String(wc).padStart(3) + '%' : 'N/A '} | Actions: ${String(actions).padStart(3)}% | Expected: ${expected}`);
  }

  console.log('-'.repeat(120));
  console.log(allMatch ? '\n✓ All health scores match v4.0 formula!' : '\n✗ Some health scores still mismatch');

  console.log('\n=== Formula Summary ===');
  console.log('v4.0: NPS (20%) + Compliance (60%) + Working Capital (10%) + Actions (10%) = 100%');
}

runMigration().catch(console.error);
