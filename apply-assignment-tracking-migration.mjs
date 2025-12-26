#!/usr/bin/env node
/**
 * Apply assignment tracking columns migration to actions table
 *
 * Adds: assigned_at, assigned_by, assigned_by_email, source
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
  console.error('❌ Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function applyMigration() {
  console.log('🔄 Applying assignment tracking migration...\n')

  // Check if columns already exist by trying to query them
  const { data: testData, error: testError } = await supabase
    .from('actions')
    .select('assigned_at, assigned_by, assigned_by_email, source')
    .limit(1)

  if (!testError) {
    console.log('✅ Columns already exist - migration already applied')
    return
  }

  // Columns don't exist, need to add them via raw SQL
  // Since we can't run raw ALTER TABLE via the JS client, we'll use the REST API

  const migrations = [
    {
      name: 'assigned_at',
      sql: `ALTER TABLE actions ADD COLUMN IF NOT EXISTS assigned_at timestamptz`
    },
    {
      name: 'assigned_by',
      sql: `ALTER TABLE actions ADD COLUMN IF NOT EXISTS assigned_by text`
    },
    {
      name: 'assigned_by_email',
      sql: `ALTER TABLE actions ADD COLUMN IF NOT EXISTS assigned_by_email text`
    },
    {
      name: 'source',
      sql: `ALTER TABLE actions ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual'`
    }
  ]

  console.log('📋 Migration SQL (apply manually in Supabase SQL Editor):')
  console.log('=' .repeat(60))

  for (const migration of migrations) {
    console.log(`\n-- Add ${migration.name} column`)
    console.log(migration.sql + ';')
  }

  console.log('\n-- Create indexes')
  console.log('CREATE INDEX IF NOT EXISTS idx_actions_assigned_at ON actions(assigned_at);')
  console.log('CREATE INDEX IF NOT EXISTS idx_actions_source ON actions(source);')

  console.log('\n' + '=' .repeat(60))
  console.log('\n⚠️  Please run the above SQL in the Supabase SQL Editor')
  console.log('   Dashboard: https://supabase.com/dashboard/project/usoyxsunetvxdjdglkmn/sql')

  // Open the migration file path
  console.log('\n📄 Full migration file:')
  console.log('   docs/migrations/20251215_add_assignment_tracking_columns.sql')
}

applyMigration().catch(console.error)
