#!/usr/bin/env node

/**
 * Apply Unified Actions Source Columns Migration
 *
 * Adds source and source_metadata columns to the actions table
 * for provenance tracking in the unified actions system.
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { readFileSync } from 'fs'

// Load environment variables
const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkColumnExists(columnName) {
  const { data, error } = await supabase
    .from('actions')
    .select(columnName)
    .limit(1)
  return !error
}

async function applyMigration() {
  console.log('🚀 Applying Unified Actions Source Columns Migration')
  console.log('='.repeat(60))

  // Check if columns already exist
  console.log('\n📋 Checking existing schema...')

  const sourceExists = await checkColumnExists('source')
  const metadataExists = await checkColumnExists('source_metadata')
  const createdByExists = await checkColumnExists('created_by')

  console.log(`   source column: ${sourceExists ? '✓ exists' : '✗ missing'}`)
  console.log(`   source_metadata column: ${metadataExists ? '✓ exists' : '✗ missing'}`)
  console.log(`   created_by column: ${createdByExists ? '✓ exists' : '✗ missing'}`)

  if (sourceExists && metadataExists && createdByExists) {
    console.log('\n✅ All columns already exist. Migration not needed.')
    return
  }

  console.log('\n📝 Please run the migration SQL in Supabase Dashboard:')
  console.log('   File: docs/migrations/20251230_unified_actions_source_columns.sql')
  console.log('   Dashboard: https://supabase.com/dashboard/project/usoyxsunetvxdjdglkmn/sql/new')
}

applyMigration().catch(console.error)
