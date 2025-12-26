#!/usr/bin/env node
/**
 * Apply Aged Accounts Enhancements Migration
 * Creates tables for webhook integration, historical tracking,
 * CSE suggestions, and email alerts
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

async function checkTableExists(tableName) {
  const { error } = await supabase.from(tableName).select('id').limit(1)
  return !error
}

async function runMigration() {
  console.log('📋 Reading migration SQL file...')

  const sqlPath = join(__dirname, '..', 'docs', 'migrations', '20251220_aged_accounts_enhancements.sql')
  const sql = fs.readFileSync(sqlPath, 'utf8')

  console.log('🔄 Executing migration...')

  // Split SQL by statement and execute
  // Note: For complex migrations, you may need to run in Supabase SQL Editor
  const { error } = await supabase.rpc('exec_sql', { sql_string: sql })

  if (error) {
    console.error('❌ Migration failed:', error.message)
    console.log('')
    console.log('⚠️  Please run the SQL manually in Supabase SQL Editor:')
    console.log('   1. Go to: https://supabase.com/dashboard/project/YOUR_PROJECT/sql')
    console.log('   2. Open file: docs/migrations/20251220_aged_accounts_enhancements.sql')
    console.log('   3. Copy the entire contents and paste in SQL Editor')
    console.log('   4. Click "Run"')
    return false
  }

  return true
}

async function checkTables() {
  console.log('🔍 Checking if tables exist...')

  const tables = [
    'aged_accounts_history',
    'webhook_subscriptions',
    'aging_alert_config',
    'aging_alerts_log',
    'cse_assignment_suggestions'
  ]

  const results = {}
  for (const table of tables) {
    results[table] = await checkTableExists(table)
    console.log(`   ${results[table] ? '✅' : '❌'} ${table}`)
  }

  return Object.values(results).every(Boolean)
}

async function captureInitialSnapshot() {
  console.log('📸 Capturing initial aged accounts snapshot...')

  try {
    const { data, error } = await supabase.rpc('capture_aged_accounts_snapshot')

    if (error) {
      if (error.message.includes('does not exist')) {
        console.log('⚠️  Function capture_aged_accounts_snapshot does not exist yet.')
        return false
      }
      throw error
    }

    console.log(`✅ Initial snapshot captured: ${data} records`)
    return true
  } catch (err) {
    console.error('❌ Error capturing snapshot:', err.message)
    return false
  }
}

async function main() {
  console.log('📊 Aged Accounts Enhancements Migration')
  console.log('=======================================')
  console.log('')

  // First check if tables already exist
  const allTablesExist = await checkTables()

  if (allTablesExist) {
    console.log('')
    console.log('✅ All tables already exist!')

    // Try to capture initial snapshot
    await captureInitialSnapshot()

    console.log('')
    console.log('🎉 Migration verified! Aged accounts enhancements are ready.')
    return
  }

  console.log('')
  console.log('📝 Some tables need to be created.')
  console.log('')
  console.log('⚠️  Please run the migration SQL in Supabase SQL Editor:')
  console.log('')
  console.log('   1. Go to your Supabase project SQL Editor')
  console.log('   2. Open: docs/migrations/20251220_aged_accounts_enhancements.sql')
  console.log('   3. Copy the entire contents and paste in SQL Editor')
  console.log('   4. Click "Run"')
  console.log('   5. Re-run this script to verify')
  console.log('')
}

main().catch(console.error)
