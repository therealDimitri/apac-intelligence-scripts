#!/usr/bin/env node

/**
 * Apply BURC Enhancement Migrations (Batch)
 *
 * Runs all 10 BURC-related migrations from 20260105:
 * 1. push_subscriptions_table
 * 2. health_score_auto_refresh
 * 3. burc_sync_automation
 * 4. churn_predictions
 * 5. enhanced_health_score
 * 6. burc_alert_types
 * 7. regional_benchmarks
 * 8. regional_benchmarks_seed
 * 9. burc_data_lineage
 * 10. burc_insights
 */

import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

dotenv.config({ path: '.env.local' })

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DATABASE_URL = process.env.DATABASE_URL_DIRECT || process.env.SUPABASE_DB_URL || process.env.DATABASE_URL

if (!DATABASE_URL) {
  console.error('❌ Missing DATABASE_URL environment variable')
  console.log('Please add DATABASE_URL to .env.local')
  process.exit(1)
}

// Migration files in order of execution (v2 = fixed versions)
const MIGRATIONS = [
  '20260105_push_subscriptions_table.sql',
  '20260105_health_score_auto_refresh_v2.sql',
  '20260105_burc_sync_automation.sql',
  '20260105_churn_predictions.sql',
  '20260105_enhanced_health_score.sql',
  '20260105_burc_alert_types_v2.sql',
  '20260105_regional_benchmarks.sql',
  '20260105_regional_benchmarks_seed.sql',
  '20260105_burc_data_lineage_v2.sql',
  '20260105_burc_insights_v2.sql',
]

async function runMigration(sql, migrationFile) {
  const migrationPath = path.join(__dirname, '../docs/migrations', migrationFile)

  if (!fs.existsSync(migrationPath)) {
    console.log(`   ⚠️  Skipping ${migrationFile} - file not found`)
    return false
  }

  const migrationSQL = fs.readFileSync(migrationPath, 'utf-8')

  try {
    await sql.unsafe(migrationSQL)
    console.log(`   ✅ ${migrationFile}`)
    return true
  } catch (err) {
    // Check if it's a "already exists" error (safe to ignore)
    if (err.message.includes('already exists') ||
        err.message.includes('duplicate key') ||
        err.message.includes('relation') && err.message.includes('already exists')) {
      console.log(`   ⚠️  ${migrationFile} - already applied (safe to skip)`)
      return true
    }
    console.log(`   ❌ ${migrationFile} - ${err.message}`)
    return false
  }
}

async function main() {
  console.log('\n🚀 BURC Enhancement Migrations Batch Runner\n')
  console.log('━'.repeat(60))
  console.log(`📊 Total migrations to apply: ${MIGRATIONS.length}`)
  console.log('━'.repeat(60))

  try {
    const { default: postgres } = await import('postgres')
    const sql = postgres(DATABASE_URL, {
      ssl: { rejectUnauthorized: false },
      connection: { application_name: 'burc-batch-migration' },
      connect_timeout: 30,
    })

    console.log('\n📋 Connected to database\n')
    console.log('Executing migrations...\n')

    let successCount = 0
    let failCount = 0

    for (const migration of MIGRATIONS) {
      const success = await runMigration(sql, migration)
      if (success) {
        successCount++
      } else {
        failCount++
      }
    }

    console.log('\n' + '━'.repeat(60))
    console.log(`\n📊 Migration Summary:`)
    console.log(`   ✅ Successful: ${successCount}`)
    console.log(`   ❌ Failed: ${failCount}`)
    console.log(`   📁 Total: ${MIGRATIONS.length}`)

    // Verify key tables
    console.log('\n🔍 Verifying key tables...\n')

    const verifications = [
      { name: 'push_subscriptions', query: `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'push_subscriptions') as exists` },
      { name: 'churn_predictions', query: `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'churn_predictions') as exists` },
      { name: 'burc_sync_status', query: `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'burc_sync_status') as exists` },
      { name: 'burc_alert_thresholds', query: `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'burc_alert_thresholds') as exists` },
      { name: 'regional_benchmarks', query: `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'regional_benchmarks') as exists` },
      { name: 'burc_data_lineage', query: `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'burc_data_lineage') as exists` },
      { name: 'burc_generated_insights', query: `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'burc_generated_insights') as exists` },
    ]

    for (const v of verifications) {
      try {
        const result = await sql.unsafe(v.query)
        console.log(`   ${result[0].exists ? '✅' : '❌'} ${v.name}`)
      } catch {
        console.log(`   ❌ ${v.name} - query failed`)
      }
    }

    await sql.end()

    console.log('\n' + '━'.repeat(60))
    if (failCount === 0) {
      console.log('\n✅ All BURC enhancement migrations completed successfully!\n')
    } else {
      console.log(`\n⚠️  ${failCount} migration(s) failed. Review logs above.\n`)
    }

  } catch (err) {
    console.error('\n❌ Migration batch failed:', err.message)

    if (err.message.includes('pg_hba.conf')) {
      console.log('\n📝 Connection rejected. Use the Supabase pooler URL.')
    }

    process.exit(1)
  }
}

main()
