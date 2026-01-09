#!/usr/bin/env node
/**
 * Apply Account Planning AI Tables Migration
 * Uses the pg library to connect directly to Supabase PostgreSQL
 */

import pg from 'pg'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { readFileSync } from 'fs'

const { Client } = pg

// Load environment variables
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const databaseUrl = process.env.DATABASE_URL_DIRECT

if (!databaseUrl) {
  console.error('❌ Missing DATABASE_URL_DIRECT in .env.local')
  process.exit(1)
}

async function runMigration() {
  console.log('🚀 Running Account Planning AI Tables Migration...\n')

  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  })

  try {
    console.log('📡 Connecting to database...')
    await client.connect()
    console.log('✅ Connected to Supabase PostgreSQL\n')

    // Read the migration SQL file
    const migrationPath = join(__dirname, '..', 'supabase', 'migrations', '20260109_account_planning_ai_tables.sql')
    const sqlContent = readFileSync(migrationPath, 'utf-8')

    console.log('📦 Executing migration SQL...\n')

    // Execute the entire migration
    await client.query(sqlContent)

    console.log('✅ Migration SQL executed successfully\n')

    // Verify the tables were created
    console.log('📋 Verifying migration...')

    const tables = [
      'account_plan_ai_insights',
      'next_best_actions',
      'stakeholder_relationships',
      'stakeholder_influences',
      'predictive_health_scores',
      'meddpicc_scores',
      'engagement_timeline'
    ]

    for (const tableName of tables) {
      const { rows: tableCheck } = await client.query(`
        SELECT COUNT(*) as count FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = $1
      `, [tableName])

      if (tableCheck[0].count === '1') {
        console.log(`✅ Table ${tableName} exists`)
      } else {
        console.log(`⚠️ Table ${tableName} not found`)
      }
    }

    // Count indexes created
    const { rows: indexCount } = await client.query(`
      SELECT COUNT(*) as count FROM pg_indexes
      WHERE schemaname = 'public'
      AND tablename IN ('account_plan_ai_insights', 'next_best_actions', 'stakeholder_relationships',
                       'stakeholder_influences', 'predictive_health_scores', 'meddpicc_scores', 'engagement_timeline')
    `)
    console.log(`\n📊 Total indexes created: ${indexCount[0].count}`)

    console.log('\n🎉 Migration completed successfully!')
    return true

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message)
    if (error.detail) console.error('   Detail:', error.detail)
    if (error.hint) console.error('   Hint:', error.hint)
    return false
  } finally {
    await client.end()
    console.log('\n📡 Database connection closed')
  }
}

// Run the migration
runMigration()
  .then(success => {
    process.exit(success ? 0 : 1)
  })
  .catch(err => {
    console.error('\n❌ Fatal error:', err)
    process.exit(1)
  })
