/**
 * Execute Client Unification Migration
 *
 * Runs all migration phases using direct PostgreSQL connection.
 */

import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env.local') });

const MIGRATIONS_DIR = join(__dirname, '..', 'docs', 'migrations', 'client-unification');

const PHASES = [
  { num: 1, file: '01_create_master_clients_table.sql', name: 'Create Master Tables' },
  { num: 2, file: '02_populate_clients_data.sql', name: 'Populate Client Data' },
  { num: 3, file: '03_backfill_client_ids.sql', name: 'Backfill Client IDs' },
  { num: 4, file: '04_add_constraints_and_cleanup.sql', name: 'Add Constraints & Cleanup' },
];

async function main() {
  const args = process.argv.slice(2);
  const targetPhase = args[0] ? parseInt(args[0], 10) : null;

  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║       CLIENT UNIFICATION MIGRATION - AUTOMATED                 ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Use direct database URL
  const databaseUrl = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL not found in .env.local');
    process.exit(1);
  }

  console.log('🔌 Connecting to database...');

  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to Supabase PostgreSQL\n');

    // Determine which phases to run
    const phasesToRun = targetPhase
      ? PHASES.filter(p => p.num === targetPhase)
      : PHASES;

    if (phasesToRun.length === 0) {
      console.error(`❌ Invalid phase: ${targetPhase}`);
      process.exit(1);
    }

    for (const phase of phasesToRun) {
      console.log(`${'='.repeat(60)}`);
      console.log(`Phase ${phase.num}: ${phase.name}`);
      console.log(`${'='.repeat(60)}\n`);

      const sqlPath = join(MIGRATIONS_DIR, phase.file);
      let sql;

      try {
        sql = readFileSync(sqlPath, 'utf8');
      } catch (err) {
        console.error(`❌ Could not read: ${sqlPath}`);
        continue;
      }

      console.log(`📄 Executing: ${phase.file}`);
      console.log(`   Size: ${sql.length} bytes\n`);

      try {
        await client.query(sql);
        console.log(`✅ Phase ${phase.num} completed successfully\n`);
      } catch (err) {
        console.error(`❌ Phase ${phase.num} error: ${err.message}\n`);

        // Check if it's a "already exists" type error - that's OK
        if (err.message.includes('already exists') ||
            err.message.includes('duplicate key')) {
          console.log('   (This may be OK if migration was partially applied before)\n');
        } else {
          // For other errors, stop
          throw err;
        }
      }
    }

    // Show final status
    console.log(`\n${'='.repeat(60)}`);
    console.log('FINAL STATUS');
    console.log(`${'='.repeat(60)}\n`);

    // Check clients table
    const { rows: clientRows } = await client.query(
      'SELECT COUNT(*) as count FROM clients'
    );
    console.log(`✅ Clients table: ${clientRows[0].count} clients`);

    // Check aliases table
    try {
      const { rows: aliasRows } = await client.query(
        'SELECT COUNT(*) as count FROM client_aliases_unified'
      );
      console.log(`✅ Aliases table: ${aliasRows[0].count} aliases`);
    } catch (e) {
      console.log('⚠️  Aliases table not yet created');
    }

    // Check backfill status
    console.log('\n📊 Backfill Status:');

    const tables = [
      { name: 'unified_meetings', col: 'client_uuid' },
      { name: 'actions', col: 'client_uuid' },
      { name: 'client_segmentation', col: 'client_uuid' },
      { name: 'aging_accounts', col: 'client_uuid' },
      { name: 'nps_responses', col: 'client_uuid' },
      { name: 'portfolio_initiatives', col: 'client_id' },
      { name: 'client_health_history', col: 'client_id' },
    ];

    for (const t of tables) {
      try {
        const { rows } = await client.query(`
          SELECT
            COUNT(*) as total,
            COUNT(${t.col}) as with_id
          FROM ${t.name}
        `);
        const total = parseInt(rows[0].total);
        const withId = parseInt(rows[0].with_id);
        const pct = total > 0 ? Math.round((withId / total) * 100) : 100;
        const icon = pct === 100 ? '✅' : pct > 50 ? '⚠️' : '❌';
        console.log(`   ${icon} ${t.name}: ${withId}/${total} (${pct}%)`);
      } catch (e) {
        console.log(`   ❓ ${t.name}: ${e.message.substring(0, 50)}`);
      }
    }

    // Check for unresolved names
    try {
      const { rows } = await client.query(
        'SELECT COUNT(*) as count FROM client_unresolved_names WHERE NOT resolved'
      );
      if (parseInt(rows[0].count) > 0) {
        console.log(`\n⚠️  Unresolved names: ${rows[0].count}`);

        const { rows: unresolvedRows } = await client.query(
          'SELECT source_table, original_name, record_count FROM client_unresolved_names WHERE NOT resolved ORDER BY record_count DESC LIMIT 10'
        );
        unresolvedRows.forEach(r => {
          console.log(`   - "${r.original_name}" (${r.source_table}, ${r.record_count} records)`);
        });
      }
    } catch (e) {
      // Table may not exist
    }

    console.log('\n✅ Migration complete!');

  } catch (err) {
    console.error('\n❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
