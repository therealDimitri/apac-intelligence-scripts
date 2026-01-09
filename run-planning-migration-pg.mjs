#!/usr/bin/env node
/**
 * Run Planning Hub Migration via PostgreSQL
 * Uses direct database connection to execute migration
 */

import pg from 'pg'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load .env.local
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const DATABASE_URL = process.env.DATABASE_URL || process.env.DATABASE_URL_DIRECT

if (!DATABASE_URL) {
  console.error('❌ Missing DATABASE_URL or DATABASE_URL_DIRECT in environment')
  process.exit(1)
}

console.log('🚀 Starting Planning Hub Migration via PostgreSQL...\n')

const client = new pg.Client({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
})

async function runMigration() {
  try {
    await client.connect()
    console.log('✅ Connected to database\n')

    // Read the migration file
    const migrationPath = join(__dirname, '..', 'supabase', 'migrations', '20260109_planning_hub_enhancements.sql')
    const migrationSql = readFileSync(migrationPath, 'utf-8')

    console.log('📦 Running migration...')

    // Execute the entire migration
    await client.query(migrationSql)

    console.log('✅ Migration executed successfully!\n')

    // Verify tables exist
    const tables = [
      'account_plan_ai_insights',
      'next_best_actions',
      'stakeholder_relationships',
      'stakeholder_influences',
      'predictive_health_scores',
      'meddpicc_scores',
      'engagement_timeline',
      'account_plan_event_requirements',
      'territory_compliance_summary',
      'account_plan_financials',
      'territory_strategy_financials',
      'business_unit_planning',
      'apac_planning_goals'
    ]

    console.log('📋 Verifying tables...')
    for (const table of tables) {
      const result = await client.query(`SELECT COUNT(*) FROM ${table}`)
      console.log(`  ✅ ${table}: ${result.rows[0].count} rows`)
    }

    // Check seed data
    console.log('\n🌱 Verifying seed data...')

    const apacGoals = await client.query('SELECT * FROM apac_planning_goals WHERE fiscal_year = 2026')
    if (apacGoals.rows.length > 0) {
      console.log(`  ✅ APAC Goals FY26: Target $${(apacGoals.rows[0].target_revenue / 1000000).toFixed(1)}M`)
    }

    const buPlanning = await client.query('SELECT bu_name, target_arr FROM business_unit_planning WHERE fiscal_year = 2026')
    for (const bu of buPlanning.rows) {
      console.log(`  ✅ ${bu.bu_name} FY26: Target $${(bu.target_arr / 1000000).toFixed(1)}M`)
    }

    console.log('\n✨ Migration complete!')

  } catch (error) {
    console.error('❌ Migration error:', error.message)

    // Check if it's a "already exists" error which is OK
    if (error.message.includes('already exists')) {
      console.log('\n⚠️  Some objects already exist - this is OK for re-runs')
    }
  } finally {
    await client.end()
  }
}

runMigration()
