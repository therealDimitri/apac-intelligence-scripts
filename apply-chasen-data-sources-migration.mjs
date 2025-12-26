#!/usr/bin/env node
/**
 * Apply ChaSen Data Sources Migration
 *
 * Creates the chasen_data_sources table and populates it with current configurations.
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function main() {
  console.log('🚀 Applying ChaSen Data Sources Migration\n')

  // Check if table already exists
  const { data: existing, error: checkError } = await supabase
    .from('chasen_data_sources')
    .select('id')
    .limit(1)

  if (!checkError && existing) {
    console.log('✅ Table chasen_data_sources already exists')
    console.log(`   Found ${existing.length > 0 ? 'data' : 'no data'} in table\n`)

    // Show current status
    const { data: sources } = await supabase
      .from('chasen_data_sources')
      .select('table_name, display_name, is_enabled, priority')
      .order('priority', { ascending: false })

    if (sources && sources.length > 0) {
      console.log('Current data sources:')
      for (const source of sources) {
        const status = source.is_enabled ? '✅' : '❌'
        console.log(`  ${status} [P${source.priority}] ${source.display_name}`)
      }
    }

    return
  }

  console.log('📋 Creating chasen_data_sources table...\n')
  console.log('⚠️  Please run the migration SQL manually in Supabase Dashboard:')
  console.log('   docs/migrations/20251227_chasen_data_sources_config.sql\n')
  console.log('   Or use the Supabase CLI:\n')
  console.log('   supabase db push\n')

  // Try to create the table via REST API (limited - no CREATE TABLE support)
  // The migration needs to be run via SQL editor or Supabase CLI

  console.log('After running the migration, use:')
  console.log('  node scripts/chasen-auto-discover.mjs --status')
  console.log('  node scripts/chasen-auto-discover.mjs --add')
}

main().catch(console.error)
