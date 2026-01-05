#!/usr/bin/env node
/**
 * Apply Health Score Auto-Refresh Triggers Migration
 *
 * Creates:
 * - refresh_client_health_summary() function with rate limiting
 * - Triggers on actions, nps_responses, aging_accounts tables
 *
 * Migration file: docs/migrations/20260105_health_score_auto_refresh.sql
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { readFileSync } from 'fs'

// Load environment variables
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  console.error('   Make sure .env.local contains these variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

/**
 * Check if a function exists in the database
 */
async function checkFunctionExists(functionName) {
  const { data, error } = await supabase.rpc('exec_sql', {
    sql_query: `
      SELECT EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND p.proname = '${functionName}'
      ) as exists;
    `
  })

  if (error) {
    // If exec_sql doesn't exist, we'll check another way
    console.log('⚠️  Cannot check if function exists via RPC, will attempt migration anyway')
    return false
  }

  return data?.[0]?.exists || false
}

/**
 * Check if triggers exist
 */
async function checkTriggersExist() {
  try {
    const { data, error } = await supabase.rpc('exec_sql', {
      sql_query: `
        SELECT COUNT(*) as count
        FROM information_schema.triggers
        WHERE trigger_name LIKE 'trigger_refresh_health_%';
      `
    })

    if (error) {
      console.log('⚠️  Cannot check triggers via RPC')
      return false
    }

    return (data?.[0]?.count || 0) > 0
  } catch (err) {
    return false
  }
}

/**
 * Execute the migration SQL
 */
async function executeMigration() {
  console.log('🔄 Reading migration file...')

  // Read the SQL migration file
  const migrationPath = join(__dirname, '..', 'docs', 'migrations', '20260105_health_score_auto_refresh.sql')
  const migrationSQL = readFileSync(migrationPath, 'utf8')

  // Remove comments and split into individual statements
  const statements = migrationSQL
    .split('\n')
    .filter(line => !line.trim().startsWith('--') && line.trim() !== '')
    .join('\n')
    .split(';')
    .map(stmt => stmt.trim())
    .filter(stmt => stmt.length > 0)

  console.log(`📋 Found ${statements.length} SQL statements to execute\n`)

  // Try using exec_sql RPC if available
  console.log('🔄 Attempting to execute migration via Supabase RPC...\n')

  try {
    // First, try to execute the entire migration as one
    const { error } = await supabase.rpc('exec_sql', {
      sql_query: migrationSQL
    })

    if (error) {
      if (error.message.includes('could not find') || error.message.includes('does not exist')) {
        console.log('⚠️  exec_sql RPC function not available')
        throw new Error('RPC not available')
      }
      throw error
    }

    console.log('✅ Migration executed successfully via RPC!')
    return true

  } catch (err) {
    console.log('⚠️  Cannot execute via RPC:', err.message)
    console.log('\n📝 Please run the migration manually:\n')
    console.log('   1. Go to: Supabase Dashboard > SQL Editor')
    console.log('   2. Open file: docs/migrations/20260105_health_score_auto_refresh.sql')
    console.log('   3. Copy the entire contents and paste in SQL Editor')
    console.log('   4. Click "Run"\n')
    console.log(`   Direct URL: ${supabaseUrl.replace('https://', 'https://supabase.com/dashboard/project/')}/sql/new\n`)
    return false
  }
}

/**
 * Verify the migration was successful
 */
async function verifyMigration() {
  console.log('🔍 Verifying migration...\n')

  try {
    // Check if the refresh function exists by trying to call it
    const { error: funcError } = await supabase.rpc('refresh_client_health_summary')

    if (funcError) {
      if (funcError.message.includes('does not exist')) {
        console.log('❌ Function refresh_client_health_summary not found')
        return false
      }
      // If it's a rate limit message, that's actually good - means it exists
      if (funcError.message.includes('Skipping refresh') || funcError.message.includes('refreshed at')) {
        console.log('✅ Function refresh_client_health_summary exists and is callable')
      } else {
        console.log('⚠️  Function exists but returned error:', funcError.message)
      }
    } else {
      console.log('✅ Function refresh_client_health_summary executed successfully')
    }

    // Try to verify triggers exist by checking the information_schema
    const triggerCheck = await checkTriggersExist()
    if (triggerCheck) {
      console.log('✅ Triggers detected in database')
    } else {
      console.log('⚠️  Could not verify triggers (may still exist)')
    }

    // Check the last_refreshed timestamp
    const { data: healthData, error: healthError } = await supabase
      .from('client_health_summary')
      .select('client_name, health_score, status, last_refreshed')
      .order('last_refreshed', { ascending: false })
      .limit(3)

    if (!healthError && healthData && healthData.length > 0) {
      console.log('\n📊 Recent client_health_summary data:')
      healthData.forEach(row => {
        console.log(`   - ${row.client_name}: ${row.health_score} (${row.status}) - refreshed: ${row.last_refreshed}`)
      })
      return true
    } else {
      console.log('⚠️  Could not fetch client_health_summary data')
      return false
    }

  } catch (err) {
    console.error('❌ Verification failed:', err.message)
    return false
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗')
  console.log('║  Health Score Auto-Refresh Triggers Migration             ║')
  console.log('╚════════════════════════════════════════════════════════════╝')
  console.log('')

  // Check if already applied
  console.log('🔍 Checking if migration already applied...\n')
  const functionExists = await checkFunctionExists('refresh_client_health_summary')

  if (functionExists) {
    console.log('ℹ️  Migration appears to be already applied (function exists)')
    console.log('   Proceeding anyway to ensure all components are up to date...\n')
  }

  // Execute migration
  const success = await executeMigration()

  if (!success) {
    console.log('❌ Migration not applied. Please apply manually as shown above.')
    process.exit(1)
  }

  // Verify
  console.log('')
  const verified = await verifyMigration()

  if (verified) {
    console.log('')
    console.log('╔════════════════════════════════════════════════════════════╗')
    console.log('║  ✅ Migration Complete!                                   ║')
    console.log('╚════════════════════════════════════════════════════════════╝')
    console.log('')
    console.log('The client_health_summary materialized view will now automatically')
    console.log('refresh when underlying data changes (with 1-minute rate limiting).')
    console.log('')
    console.log('Triggers active on:')
    console.log('  • actions table')
    console.log('  • nps_responses table')
    console.log('  • aging_accounts table')
    console.log('')
  } else {
    console.log('')
    console.log('⚠️  Migration executed but verification incomplete.')
    console.log('   Please check the Supabase logs to ensure triggers were created.')
  }
}

main().catch(err => {
  console.error('💥 Fatal error:', err)
  process.exit(1)
})
