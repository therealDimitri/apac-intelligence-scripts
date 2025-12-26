#!/usr/bin/env node
/**
 * Apply Health History Migration
 * Creates the client_health_history and health_status_alerts tables
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

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

async function createTables() {
  console.log('🔄 Checking if tables already exist...')

  // Check if tables exist
  const historyExists = await checkTableExists('client_health_history')
  const alertsExists = await checkTableExists('health_status_alerts')

  if (historyExists && alertsExists) {
    console.log('✅ Tables already exist!')
    return true
  }

  console.log('📝 Tables need to be created.')
  console.log('')
  console.log('⚠️  Please run the following SQL in Supabase SQL Editor:')
  console.log('')
  console.log('   1. Go to: https://supabase.com/dashboard/project/YOUR_PROJECT/sql')
  console.log('   2. Open file: docs/migrations/20251220_create_health_history_tables.sql')
  console.log('   3. Copy the entire contents and paste in SQL Editor')
  console.log('   4. Click "Run"')
  console.log('')

  return false
}

async function seedInitialData() {
  console.log('🌱 Seeding initial health snapshot data...')

  try {
    const { data, error } = await supabase.rpc('capture_health_snapshot')

    if (error) {
      if (error.message.includes('does not exist')) {
        console.log('⚠️  Function capture_health_snapshot does not exist yet.')
        console.log('   Please run the migration SQL first.')
        return false
      }
      throw error
    }

    console.log('✅ Initial snapshot captured:', data)
    return true
  } catch (err) {
    console.error('❌ Error seeding data:', err.message)
    return false
  }
}

async function main() {
  console.log('🏥 Health History Migration Script')
  console.log('===================================')
  console.log('')

  const tablesReady = await createTables()

  if (tablesReady) {
    // Try to seed data
    const seeded = await seedInitialData()
    if (seeded) {
      console.log('')
      console.log('🎉 Migration complete! Health history tracking is now active.')
    }
  }
}

main().catch(console.error)
