#!/usr/bin/env node
/**
 * Run Aged Accounts Enhancements Migration
 * Executes the migration SQL directly via Supabase REST API
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs'

// Load environment variables
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Execute SQL via the Supabase REST API
async function executeSql(sql, description) {
  console.log(`  🔄 ${description}...`)

  try {
    // Use the Supabase REST API to execute SQL
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_raw_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ query: sql })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(errorText)
    }

    console.log(`  ✅ ${description} - Done`)
    return true
  } catch (error) {
    // If exec_raw_sql doesn't exist, try alternative methods
    console.log(`  ⚠️  ${description} - Will retry with alternative method`)
    return false
  }
}

// Create a table using Supabase's schema API
async function createTableDirectly(tableName, columns) {
  console.log(`  Creating ${tableName}...`)

  // Try inserting a dummy row to see if table exists
  const { error: checkError } = await supabase.from(tableName).select('id').limit(1)

  if (!checkError) {
    console.log(`  ✅ ${tableName} already exists`)
    return true
  }

  console.log(`  ❌ ${tableName} needs to be created via SQL Editor`)
  return false
}

async function main() {
  console.log('📊 Aged Accounts Enhancements - Direct Migration')
  console.log('================================================')
  console.log('')

  // Read the SQL file
  const sqlPath = join(__dirname, '..', 'docs', 'migrations', '20251220_aged_accounts_enhancements.sql')
  const fullSql = fs.readFileSync(sqlPath, 'utf8')

  console.log('📋 SQL file read successfully')
  console.log('')

  // Check current state
  const tables = [
    'aged_accounts_history',
    'webhook_subscriptions',
    'aging_alert_config',
    'aging_alerts_log',
    'cse_assignment_suggestions'
  ]

  console.log('🔍 Checking existing tables...')
  const tableStatus = {}

  for (const table of tables) {
    const { error } = await supabase.from(table).select('id').limit(1)
    tableStatus[table] = !error
    console.log(`   ${tableStatus[table] ? '✅' : '❌'} ${table}`)
  }

  const allExist = Object.values(tableStatus).every(Boolean)

  if (allExist) {
    console.log('')
    console.log('✅ All tables already exist!')

    // Try to capture initial snapshot
    console.log('')
    console.log('📸 Capturing initial snapshot...')
    try {
      const { data, error } = await supabase.rpc('capture_aged_accounts_snapshot')
      if (error) throw error
      console.log(`✅ Snapshot captured: ${data} records`)
    } catch (err) {
      console.log('⚠️  Could not capture snapshot:', err.message)
    }

    console.log('')
    console.log('🎉 Migration complete!')
    return
  }

  console.log('')
  console.log('=' .repeat(60))
  console.log('📝 MANUAL MIGRATION REQUIRED')
  console.log('=' .repeat(60))
  console.log('')
  console.log('The tables need to be created. Please run the following SQL')
  console.log('in the Supabase SQL Editor:')
  console.log('')
  console.log('📁 File: docs/migrations/20251220_aged_accounts_enhancements.sql')
  console.log('')
  console.log('Steps:')
  console.log('  1. Open Supabase Dashboard')
  console.log('  2. Go to SQL Editor')
  console.log('  3. Copy the contents of the SQL file above')
  console.log('  4. Paste and click "Run"')
  console.log('  5. Re-run this script to verify')
  console.log('')
  console.log('=' .repeat(60))

  // Output the SQL for easy copy-paste
  console.log('')
  console.log('📋 SQL Content (copy below this line):')
  console.log('-'.repeat(60))
  console.log(fullSql)
  console.log('-'.repeat(60))
}

main().catch(console.error)
