#!/usr/bin/env node

/**
 * Run SQL migration via Supabase API
 * Usage: node scripts/run-migration.mjs <migration-file.sql>
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { readFileSync } from 'fs'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

const migrationFile = process.argv[2]
if (!migrationFile) {
  console.error('Usage: node scripts/run-migration.mjs <migration-file.sql>')
  process.exit(1)
}

async function runMigration() {
  console.log(`Reading migration file: ${migrationFile}`)
  const sql = readFileSync(migrationFile, 'utf8')

  // Split into individual statements (naive split on semicolon)
  const statements = sql
    .split(/;\s*\n/)
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('--'))

  console.log(`Found ${statements.length} SQL statements to execute`)

  let successCount = 0
  let errorCount = 0

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i]
    if (!stmt || stmt.length < 5) continue

    // Skip comment-only statements
    if (stmt.split('\n').every(line => line.trim().startsWith('--') || line.trim() === '')) {
      continue
    }

    try {
      // Use rpc to execute raw SQL
      const { error } = await supabase.rpc('exec_sql', { sql_query: stmt })

      if (error) {
        // If exec_sql doesn't exist, we need another approach
        if (error.message.includes('function') && error.message.includes('does not exist')) {
          console.log('Note: exec_sql function not available, will try direct table creation check')
          break
        }
        console.error(`Statement ${i + 1} error: ${error.message}`)
        errorCount++
      } else {
        successCount++
      }
    } catch (err) {
      console.error(`Statement ${i + 1} exception: ${err.message}`)
      errorCount++
    }
  }

  console.log(`\nMigration complete: ${successCount} successful, ${errorCount} errors`)
}

// Alternative: Check if tables exist
async function checkTables() {
  console.log('\nChecking if tables exist...')

  const tablesToCheck = [
    'business_unit_planning',
    'apac_planning_goals',
    'account_plan_event_requirements',
    'territory_compliance_summary'
  ]

  for (const table of tablesToCheck) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .limit(1)

    if (error) {
      console.log(`  ${table}: NOT FOUND (${error.message})`)
    } else {
      console.log(`  ${table}: EXISTS (${data?.length || 0} rows)`)
    }
  }
}

async function main() {
  await checkTables()
  console.log('\nTo apply this migration, run it in the Supabase SQL Editor:')
  console.log('https://supabase.com/dashboard/project/usoyxsunetvxdjdglkmn/sql')
}

main().catch(console.error)
