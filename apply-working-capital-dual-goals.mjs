#!/usr/bin/env node

/**
 * Apply Working Capital Dual-Goals Migration
 *
 * This script updates the client_health_summary materialized view to include
 * both percent_under_60_days and percent_under_90_days for the new dual-goal
 * Working Capital scoring system.
 *
 * Dual-Goal Logic:
 * - Goal 1: % under 60 days >= 90%
 * - Goal 2: % under 90 days = 100%
 * - If BOTH goals met -> 10 points (full Working Capital score)
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DATABASE_URL = process.env.DATABASE_URL_DIRECT || process.env.SUPABASE_DB_URL || process.env.DATABASE_URL

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing environment variables')
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  db: { schema: 'public' },
  auth: { persistSession: false },
})

async function applyMigration() {
  console.log('🚀 Applying Working Capital Dual-Goals Migration...\n')

  try {
    // Read the migration SQL
    const migrationPath = join(__dirname, '../docs/migrations/20251228_working_capital_dual_goals.sql')
    const migrationSQL = readFileSync(migrationPath, 'utf-8')

    console.log('📄 Migration loaded from:', migrationPath)
    console.log('\n📊 This migration will:')
    console.log('   - Add percent_under_60_days column')
    console.log('   - Add percent_under_90_days column')
    console.log('   - Update health_score calculation to use dual-goal scoring')
    console.log('\n')

    // Get sample data before migration for comparison
    console.log('🔍 Checking current state before migration...')
    const { data: beforeData } = await supabase
      .from('client_health_summary')
      .select('client_name, working_capital_percentage, health_score')
      .not('working_capital_percentage', 'is', null)
      .limit(3)

    if (beforeData && beforeData.length > 0) {
      console.log('   Current Working Capital data:')
      console.table(beforeData)
    }

    // Try direct database connection for DDL execution
    if (DATABASE_URL) {
      console.log('\n📦 Found DATABASE_URL, attempting direct SQL execution...')
      try {
        const { default: postgres } = await import('postgres')
        const sql = postgres(DATABASE_URL, {
          ssl: { rejectUnauthorized: false },
          connection: { application_name: 'working-capital-migration' },
          connect_timeout: 30,
        })

        console.log('   Executing migration...')
        await sql.unsafe(migrationSQL)
        console.log('   ✅ Migration executed successfully!')
        await sql.end()

        // Wait for PostgREST to reload schema
        console.log('   Waiting for schema reload...')
        await new Promise(r => setTimeout(r, 3000))

        // Verify the migration
        await verifyMigration()
        return
      } catch (err) {
        console.log('   ❌ Direct connection failed:', err.message)
      }
    }

    // Fallback: Provide manual instructions
    console.log('\n⚠️  Automatic execution not available.')
    console.log('   Please run the SQL manually in Supabase SQL Editor.')

    const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]
    console.log('\n📝 Instructions:')
    console.log(`   1. Go to: https://supabase.com/dashboard/project/${projectRef}/sql`)
    console.log('   2. Create a new query')
    console.log('   3. Copy and paste the migration SQL from:')
    console.log(`      ${migrationPath}`)
    console.log('   4. Execute the query')
    console.log('')

    // Print the SQL for easy copying
    console.log('='.repeat(80))
    console.log('MIGRATION SQL (copy everything below):')
    console.log('='.repeat(80) + '\n')
    console.log(migrationSQL)
    console.log('\n' + '='.repeat(80))

  } catch (err) {
    console.error('❌ Error:', err)
    process.exit(1)
  }
}

async function verifyMigration() {
  console.log('\n🔍 Verifying migration...')

  // Check that new columns exist
  const { data: sampleData, error: sampleError } = await supabase
    .from('client_health_summary')
    .select('client_name, percent_under_60_days, percent_under_90_days, working_capital_percentage, health_score')
    .limit(5)

  if (sampleError) {
    console.error('❌ Verification failed:', sampleError.message)
    return
  }

  console.log('✅ New columns exist! Sample data:')
  console.table(sampleData)

  // Check dual-goal scoring logic
  console.log('\n📊 Working Capital Goal Status:')
  const { data: healthData } = await supabase
    .from('client_health_summary')
    .select('client_name, percent_under_60_days, percent_under_90_days, health_score')
    .not('percent_under_60_days', 'is', null)
    .limit(5)

  if (healthData && healthData.length > 0) {
    healthData.forEach(client => {
      const goal1Met = (client.percent_under_60_days ?? 0) >= 90
      const goal2Met = (client.percent_under_90_days ?? 0) >= 100
      const bothMet = goal1Met && goal2Met
      console.log(`   ${client.client_name}:`)
      console.log(`     - Under 60d: ${client.percent_under_60_days}% ${goal1Met ? '✓' : '✗'} (goal: ≥90%)`)
      console.log(`     - Under 90d: ${client.percent_under_90_days}% ${goal2Met ? '✓' : '✗'} (goal: 100%)`)
      console.log(`     - Both Goals Met: ${bothMet ? '✓ FULL 10 POINTS' : '✗ Proportional scoring'}`)
      console.log(`     - Health Score: ${client.health_score}`)
    })
  } else {
    console.log('   No clients with aging data found.')
  }

  console.log('\n✅ Migration verification complete!')
}

applyMigration()
