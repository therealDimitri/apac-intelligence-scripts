#!/usr/bin/env node
/**
 * Apply Alerts Table Migration
 * Creates alerts table, fingerprints table, and updates actions table
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function checkTableExists(tableName) {
  const { data, error } = await supabase
    .from(tableName)
    .select('*')
    .limit(1)

  return !error
}

async function runMigration() {
  console.log('🚀 Starting Alerts Table Migration...\n')

  // Step 1: Check if alerts table already exists
  console.log('📋 Checking if alerts table exists...')
  const alertsExists = await checkTableExists('alerts')

  if (alertsExists) {
    console.log('✅ Alerts table already exists')

    // Check current count
    const { count } = await supabase
      .from('alerts')
      .select('*', { count: 'exact', head: true })

    console.log(`   Current alerts count: ${count || 0}`)
  } else {
    console.log('❌ Alerts table does not exist')
    console.log('\n⚠️  The alerts table needs to be created via SQL.')
    console.log('   Please run the following SQL in Supabase SQL Editor:\n')
    console.log('   File: docs/migrations/20251231_alerts_table_and_action_linking.sql\n')
    console.log('   Opening Supabase SQL Editor...')

    // Try to open Supabase dashboard
    const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]
    if (projectRef) {
      const dashboardUrl = `https://supabase.com/dashboard/project/${projectRef}/sql/new`
      console.log(`\n   Dashboard URL: ${dashboardUrl}`)

      // Try to open in browser
      const { exec } = await import('child_process')
      exec(`open "${dashboardUrl}"`, (err) => {
        if (err) {
          console.log('   Could not auto-open browser. Please open the URL manually.')
        }
      })
    }

    return false
  }

  // Step 2: Check if alert_fingerprints table exists
  console.log('\n📋 Checking if alert_fingerprints table exists...')
  const fingerprintsExists = await checkTableExists('alert_fingerprints')

  if (fingerprintsExists) {
    console.log('✅ Alert fingerprints table already exists')
  } else {
    console.log('❌ Alert fingerprints table does not exist - needs creation via SQL')
    return false
  }

  // Step 3: Check if actions table has source_alert_id column
  console.log('\n📋 Checking if actions table has source_alert_id column...')
  const { data: actionsSample, error: actionsError } = await supabase
    .from('actions')
    .select('source_alert_id')
    .limit(1)

  if (actionsError && actionsError.message.includes('column')) {
    console.log('❌ Actions table missing source_alert_id column - needs ALTER via SQL')
    return false
  } else {
    console.log('✅ Actions table has source_alert_id column')
  }

  // Step 4: Test creating an alert
  console.log('\n📋 Testing alert creation...')
  const testAlertId = `TEST-${Date.now()}`

  const { data: testAlert, error: insertError } = await supabase
    .from('alerts')
    .insert({
      alert_id: testAlertId,
      category: 'health_decline',
      severity: 'medium',
      title: 'Test Alert',
      description: 'This is a test alert to verify the migration',
      client_name: 'Test Client',
      metadata: { test: true }
    })
    .select()
    .single()

  if (insertError) {
    console.log('❌ Failed to create test alert:', insertError.message)
    return false
  }

  console.log('✅ Test alert created successfully:', testAlert.id)

  // Clean up test alert
  await supabase.from('alerts').delete().eq('id', testAlert.id)
  console.log('✅ Test alert cleaned up')

  console.log('\n✨ Migration verification complete!')
  console.log('\n📊 Summary:')
  console.log('   - alerts table: ✅ Ready')
  console.log('   - alert_fingerprints table: ✅ Ready')
  console.log('   - actions.source_alert_id column: ✅ Ready')

  return true
}

// Run the migration
runMigration()
  .then(success => {
    if (success) {
      console.log('\n🎉 All migration checks passed!')
      process.exit(0)
    } else {
      console.log('\n⚠️  Migration incomplete. Please run the SQL migration manually.')
      process.exit(1)
    }
  })
  .catch(err => {
    console.error('\n❌ Migration failed:', err)
    process.exit(1)
  })
