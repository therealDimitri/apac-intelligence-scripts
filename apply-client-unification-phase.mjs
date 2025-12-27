/**
 * Apply Client Unification Migration Phase
 *
 * Uses the Supabase Management API to execute DDL statements.
 * Run with: node scripts/apply-client-unification-phase.mjs [phase]
 *
 * Phases:
 *   1 - Create master clients table and aliases
 *   2 - Populate clients from existing data
 *   3 - Backfill client_id foreign keys
 *   4 - Add constraints and cleanup
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env.local') });

const SUPABASE_PROJECT_ID = 'usoyxsunetvxdjdglkmn';
const MIGRATIONS_DIR = join(__dirname, '..', 'docs', 'migrations', 'client-unification');

const PHASES = {
  1: '01_create_master_clients_table.sql',
  2: '02_populate_clients_data.sql',
  3: '03_backfill_client_ids.sql',
  4: '04_add_constraints_and_cleanup.sql'
};

async function executeSqlViaApi(sql) {
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

  if (!accessToken) {
    throw new Error('SUPABASE_ACCESS_TOKEN not set in .env.local');
  }

  const response = await fetch(
    `https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_ID}/database/query`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error: ${response.status} - ${error}`);
  }

  return response.json();
}

async function executeSqlViaRest(sql) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Use the REST API's RPC endpoint
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec`, {
    method: 'POST',
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({ sql })
  });

  if (!response.ok) {
    const error = await response.text();
    // If exec function doesn't exist, fall back to direct execution
    if (error.includes('function') && error.includes('does not exist')) {
      return { fallback: true };
    }
    throw new Error(`REST error: ${response.status} - ${error}`);
  }

  return response.json();
}

async function main() {
  const args = process.argv.slice(2);
  const phaseArg = args[0];

  if (!phaseArg || !PHASES[phaseArg]) {
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║           CLIENT UNIFICATION MIGRATION                         ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log('\nUsage: node scripts/apply-client-unification-phase.mjs [phase]\n');
    console.log('Phases:');
    console.log('  1 - Create master clients table and aliases');
    console.log('  2 - Populate clients from existing data');
    console.log('  3 - Backfill client_id foreign keys');
    console.log('  4 - Add constraints and cleanup\n');
    console.log('Recommended order: Run phases 1, 2, 3 first, then 4 after verification.\n');
    console.log('Alternative: Open the SQL files in Supabase SQL Editor for manual execution.');
    console.log(`Files location: ${MIGRATIONS_DIR}`);
    process.exit(0);
  }

  const phase = parseInt(phaseArg, 10);
  const sqlFile = PHASES[phase];
  const sqlPath = join(MIGRATIONS_DIR, sqlFile);

  console.log(`\n📄 Loading Phase ${phase}: ${sqlFile}`);

  let sql;
  try {
    sql = readFileSync(sqlPath, 'utf8');
  } catch (err) {
    console.error(`❌ Could not read file: ${sqlPath}`);
    process.exit(1);
  }

  console.log(`   File size: ${sql.length} bytes`);
  console.log(`\n🚀 Executing migration...`);

  try {
    // Try Management API first
    const result = await executeSqlViaApi(sql);
    console.log('\n✅ Phase completed successfully via Management API');
    console.log('Result:', JSON.stringify(result, null, 2).substring(0, 500));
  } catch (apiErr) {
    console.log(`\n⚠️  Management API failed: ${apiErr.message}`);
    console.log('   Trying REST API...');

    try {
      const result = await executeSqlViaRest(sql);
      if (result.fallback) {
        console.log('\n⚠️  RPC function not available.');
        console.log('\n📋 Manual execution required:');
        console.log(`   1. Open Supabase Dashboard: https://supabase.com/dashboard/project/${SUPABASE_PROJECT_ID}/sql`);
        console.log(`   2. Copy contents of: ${sqlPath}`);
        console.log('   3. Paste and execute in SQL Editor');
      } else {
        console.log('\n✅ Phase completed successfully via REST API');
      }
    } catch (restErr) {
      console.log(`\n❌ REST API also failed: ${restErr.message}`);
      console.log('\n📋 Manual execution required:');
      console.log(`   1. Open Supabase Dashboard: https://supabase.com/dashboard/project/${SUPABASE_PROJECT_ID}/sql`);
      console.log(`   2. Copy contents of: ${sqlPath}`);
      console.log('   3. Paste and execute in SQL Editor');
    }
  }
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
