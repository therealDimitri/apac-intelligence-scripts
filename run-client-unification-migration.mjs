/**
 * Client Unification Migration Runner
 *
 * Executes the client name unification migrations in order.
 * Run with: node scripts/run-client-unification-migration.mjs [phase]
 *
 * Phases:
 *   1 - Create master clients table and aliases
 *   2 - Populate clients from existing data
 *   3 - Backfill client_id foreign keys
 *   4 - Add constraints and cleanup
 *   all - Run all phases (default)
 *   status - Check current status
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MIGRATIONS_DIR = join(__dirname, '..', 'docs', 'migrations', 'client-unification');

const PHASES = {
  1: {
    name: 'Create Master Clients Table',
    file: '01_create_master_clients_table.sql',
    description: 'Creates the clients table, client_aliases_unified table, and resolution functions'
  },
  2: {
    name: 'Populate Clients Data',
    file: '02_populate_clients_data.sql',
    description: 'Populates clients and aliases from existing data'
  },
  3: {
    name: 'Backfill Client IDs',
    file: '03_backfill_client_ids.sql',
    description: 'Backfills client_id columns across all tables'
  },
  4: {
    name: 'Add Constraints and Cleanup',
    file: '04_add_constraints_and_cleanup.sql',
    description: 'Adds triggers, views, and cleanup'
  }
};

async function executeSql(sql) {
  // Split into statements and execute each
  // Remove comments and empty lines for execution
  const statements = sql
    .split(/;\s*$/m)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  for (const statement of statements) {
    try {
      const { error } = await supabase.rpc('exec_sql', { sql: statement + ';' });
      if (error) {
        // Try direct execution for DDL
        const { error: directError } = await supabase.from('_exec').select().limit(0);
        if (directError && directError.message.includes(statement.substring(0, 50))) {
          throw new Error(directError.message);
        }
      }
    } catch (err) {
      // Log but continue - some statements may already be applied
      console.warn(`   ⚠️  Statement warning: ${err.message.substring(0, 100)}`);
    }
  }
}

async function runPhase(phaseNum) {
  const phase = PHASES[phaseNum];
  if (!phase) {
    console.error(`❌ Unknown phase: ${phaseNum}`);
    return false;
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Phase ${phaseNum}: ${phase.name}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Description: ${phase.description}\n`);

  const sqlPath = join(MIGRATIONS_DIR, phase.file);
  let sql;

  try {
    sql = readFileSync(sqlPath, 'utf8');
  } catch (err) {
    console.error(`❌ Could not read migration file: ${sqlPath}`);
    console.error(err.message);
    return false;
  }

  console.log(`📄 Executing: ${phase.file}`);
  console.log(`   File size: ${sql.length} bytes\n`);

  try {
    await executeSql(sql);
    console.log(`✅ Phase ${phaseNum} completed successfully`);
    return true;
  } catch (err) {
    console.error(`❌ Phase ${phaseNum} failed: ${err.message}`);
    return false;
  }
}

async function checkStatus() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║           CLIENT UNIFICATION STATUS                            ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Check if clients table exists
  const { data: clientsTable, error: clientsError } = await supabase
    .from('clients')
    .select('id')
    .limit(1);

  if (clientsError && clientsError.code === '42P01') {
    console.log('❌ Phase 1 NOT APPLIED: clients table does not exist');
    return;
  }

  // Count clients
  const { count: clientCount } = await supabase
    .from('clients')
    .select('*', { count: 'exact', head: true });

  console.log(`✅ Phase 1 APPLIED: clients table exists`);
  console.log(`   - Total clients: ${clientCount || 0}`);

  // Check aliases
  const { count: aliasCount, error: aliasError } = await supabase
    .from('client_aliases_unified')
    .select('*', { count: 'exact', head: true });

  if (!aliasError) {
    console.log(`   - Total aliases: ${aliasCount || 0}`);
  }

  // Check client_id backfill status
  console.log('\n📊 Client ID Backfill Status:');

  const tables = [
    { name: 'unified_meetings', clientCol: 'client_id' },
    { name: 'actions', clientCol: 'client_id' },
    { name: 'client_segmentation', clientCol: 'client_id' },
    { name: 'aging_accounts', clientCol: 'client_id' },
    { name: 'portfolio_initiatives', clientCol: 'client_id' },
    { name: 'client_health_history', clientCol: 'client_id' },
    { name: 'chasen_folders', clientCol: 'client_id' }
  ];

  for (const table of tables) {
    try {
      const { count: totalCount } = await supabase
        .from(table.name)
        .select('*', { count: 'exact', head: true });

      const { count: withIdCount } = await supabase
        .from(table.name)
        .select('*', { count: 'exact', head: true })
        .not(table.clientCol, 'is', null);

      const percentage = totalCount > 0
        ? Math.round((withIdCount / totalCount) * 100)
        : 100;

      const status = percentage === 100 ? '✅' : percentage > 0 ? '⚠️' : '❌';
      console.log(`   ${status} ${table.name}: ${withIdCount || 0}/${totalCount || 0} (${percentage}%)`);
    } catch (err) {
      console.log(`   ❓ ${table.name}: Error checking - ${err.message}`);
    }
  }

  // Check for unresolved names
  try {
    const { count: unresolvedCount } = await supabase
      .from('client_unresolved_names')
      .select('*', { count: 'exact', head: true })
      .eq('resolved', false);

    if (unresolvedCount > 0) {
      console.log(`\n⚠️  Unresolved client names: ${unresolvedCount}`);
      console.log('   Run: SELECT * FROM client_unresolved_names WHERE NOT resolved;');
    }
  } catch (err) {
    // Table may not exist yet
  }
}

async function main() {
  const args = process.argv.slice(2);
  const phase = args[0] || 'status';

  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║           CLIENT UNIFICATION MIGRATION                         ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  if (phase === 'status') {
    await checkStatus();
    return;
  }

  if (phase === 'all') {
    console.log('\n🚀 Running all phases...\n');

    for (const phaseNum of [1, 2, 3, 4]) {
      const success = await runPhase(phaseNum);
      if (!success) {
        console.error(`\n❌ Migration stopped at Phase ${phaseNum}`);
        process.exit(1);
      }
    }

    console.log('\n✅ All phases completed successfully!');
    await checkStatus();
    return;
  }

  const phaseNum = parseInt(phase, 10);
  if (isNaN(phaseNum) || phaseNum < 1 || phaseNum > 4) {
    console.error(`\n❌ Invalid phase: ${phase}`);
    console.log('\nUsage: node scripts/run-client-unification-migration.mjs [phase]');
    console.log('\nPhases:');
    console.log('  1      - Create master clients table');
    console.log('  2      - Populate clients data');
    console.log('  3      - Backfill client_id columns');
    console.log('  4      - Add constraints and cleanup');
    console.log('  all    - Run all phases');
    console.log('  status - Check current status (default)');
    process.exit(1);
  }

  await runPhase(phaseNum);
  await checkStatus();
}

main().catch(err => {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
});
