import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function refreshView() {
  console.log('=== Refreshing client_health_summary materialized view ===\n');

  // Read the latest migration SQL
  const migrationPath = path.join(process.cwd(), 'docs/migrations/20251219_fix_aging_client_name_matching.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');

  console.log('Running migration from:', migrationPath);
  console.log('SQL length:', migrationSql.length, 'characters\n');

  // Execute the migration
  const { error } = await supabase.rpc('exec_sql', { sql: migrationSql });

  if (error) {
    console.error('Migration error:', error);

    // Try alternative: Just refresh the view
    console.log('\nTrying to just refresh the view...');
    const { error: refreshError } = await supabase.rpc('exec_sql', {
      sql: 'REFRESH MATERIALIZED VIEW client_health_summary;'
    });

    if (refreshError) {
      console.error('Refresh error:', refreshError);
      console.log('\nThe RPC function may not exist. You may need to run the migration manually via Supabase SQL editor.');
    } else {
      console.log('View refreshed successfully!');
    }
  } else {
    console.log('Migration executed successfully!');
  }

  // Check the results
  console.log('\n=== Verifying results ===');
  const { data: waikato } = await supabase
    .from('client_health_summary')
    .select('client_name, health_score, nps_score, compliance_percentage, working_capital_percentage, last_refreshed')
    .eq('client_name', 'Te Whatu Ora Waikato')
    .single();

  console.log('Waikato after refresh:', JSON.stringify(waikato, null, 2));

  // Recalculate expected score
  const nps = waikato?.nps_score ?? 0;
  const compliance = waikato?.compliance_percentage ?? 50;
  const wc = waikato?.working_capital_percentage ?? 100;

  const expected = Math.round(
    ((nps + 100) / 200) * 40 +
    (Math.min(100, compliance) / 100) * 50 +
    (Math.min(100, wc) / 100) * 10
  );

  console.log(`\nExpected score: ${expected}`);
  console.log(`Actual score: ${waikato?.health_score}`);
  console.log(`Match: ${expected === waikato?.health_score ? '✓ YES' : '✗ NO'}`);
}

refreshView().catch(console.error);
