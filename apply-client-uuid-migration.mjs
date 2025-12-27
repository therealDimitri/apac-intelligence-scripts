#!/usr/bin/env node

/**
 * Apply client_uuid migration to remaining tables
 *
 * This script adds client_uuid columns to:
 * - nps_clients
 * - client_arr
 * - chasen_documents
 * - segmentation_compliance_scores
 *
 * Usage: node scripts/apply-client-uuid-migration.mjs
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

// Load environment variables
config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing required environment variables')
  console.error('   NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✓' : '✗')
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', supabaseKey ? '✓' : '✗')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// Tables to migrate
const TABLES = ['nps_clients', 'client_arr', 'chasen_documents', 'segmentation_compliance_scores']

async function checkColumnExists(tableName) {
  const { data, error } = await supabase.from(tableName).select('*').limit(1)

  if (error) {
    console.error(`  ❌ Error checking ${tableName}:`, error.message)
    return false
  }

  if (data && data.length > 0) {
    return 'client_uuid' in data[0]
  }

  // Table exists but is empty - assume column doesn't exist
  return false
}

async function getClientMapping() {
  console.log('\n📋 Loading client mapping...')

  // Get all clients
  const { data: clients, error: clientsError } = await supabase
    .from('clients')
    .select('id, canonical_name')

  if (clientsError) {
    console.error('❌ Failed to load clients:', clientsError.message)
    return new Map()
  }

  // Build canonical name → UUID mapping
  const canonicalToUuid = new Map()
  for (const client of clients || []) {
    canonicalToUuid.set(client.canonical_name.toLowerCase(), client.id)
  }

  // Get all aliases (from client_name_aliases table)
  // This table maps display_name → canonical_name
  const { data: aliases, error: aliasesError } = await supabase
    .from('client_name_aliases')
    .select('display_name, canonical_name')

  if (aliasesError) {
    console.error('⚠️  Failed to load aliases:', aliasesError.message)
    // Continue without aliases
  }

  // Build name → UUID mapping (case-insensitive)
  const mapping = new Map()

  // Add canonical names
  for (const client of clients || []) {
    mapping.set(client.canonical_name.toLowerCase(), client.id)
  }

  // Add aliases by resolving to canonical name then UUID
  for (const alias of aliases || []) {
    const canonicalLower = alias.canonical_name?.toLowerCase()
    const uuid = canonicalToUuid.get(canonicalLower)
    if (uuid && alias.display_name) {
      mapping.set(alias.display_name.toLowerCase(), uuid)
    }
  }

  console.log(`  ✓ Loaded ${clients?.length || 0} clients`)
  console.log(`  ✓ Loaded ${aliases?.length || 0} aliases`)
  console.log(`  ✓ Total ${mapping.size} name mappings`)
  return mapping
}

async function backfillTable(tableName, clientMapping) {
  console.log(`\n🔄 Processing ${tableName}...`)

  // Check if column exists
  const hasColumn = await checkColumnExists(tableName)
  if (hasColumn) {
    console.log(`  ℹ️  client_uuid column already exists in ${tableName}`)
  } else {
    console.log(`  ⚠️  client_uuid column does NOT exist - need SQL migration`)
    console.log(`     Run: docs/migrations/20251227_add_client_uuid_to_remaining_tables.sql`)
    return { total: 0, updated: 0, skipped: 0 }
  }

  // Get rows without client_uuid
  const { data: rows, error: fetchError } = await supabase
    .from(tableName)
    .select('id, client_name, client_uuid')
    .is('client_uuid', null)
    .not('client_name', 'is', null)

  if (fetchError) {
    console.error(`  ❌ Error fetching rows:`, fetchError.message)
    return { total: 0, updated: 0, skipped: 0 }
  }

  if (!rows || rows.length === 0) {
    console.log(`  ✓ All rows already have client_uuid`)
    return { total: 0, updated: 0, skipped: 0 }
  }

  console.log(`  📊 Found ${rows.length} rows without client_uuid`)

  let updated = 0
  let skipped = 0

  for (const row of rows) {
    const clientName = row.client_name?.toLowerCase()
    const clientUuid = clientMapping.get(clientName)

    if (clientUuid) {
      const { error: updateError } = await supabase
        .from(tableName)
        .update({ client_uuid: clientUuid })
        .eq('id', row.id)

      if (updateError) {
        console.error(`  ❌ Failed to update row ${row.id}:`, updateError.message)
        skipped++
      } else {
        updated++
      }
    } else {
      skipped++
      if (skipped <= 5) {
        console.log(`  ⚠️  No mapping for: "${row.client_name}"`)
      }
    }
  }

  console.log(`  ✓ Updated ${updated} rows, skipped ${skipped}`)
  return { total: rows.length, updated, skipped }
}

async function showCoverage() {
  console.log('\n📊 Coverage Statistics:')
  console.log('─'.repeat(60))

  for (const tableName of TABLES) {
    const { data, error } = await supabase.from(tableName).select('client_uuid', { count: 'exact' })

    if (error) {
      console.log(`  ${tableName}: Error - ${error.message}`)
      continue
    }

    const { count: totalCount } = await supabase.from(tableName).select('*', { count: 'exact', head: true })

    const { count: uuidCount } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true })
      .not('client_uuid', 'is', null)

    const coverage = totalCount > 0 ? ((uuidCount / totalCount) * 100).toFixed(1) : 0
    const status = coverage >= 90 ? '✅' : coverage >= 50 ? '⚠️' : '❌'

    console.log(`  ${status} ${tableName}: ${uuidCount}/${totalCount} rows (${coverage}%)`)
  }

  console.log('─'.repeat(60))
}

async function main() {
  console.log('═'.repeat(60))
  console.log('  Client UUID Migration - Remaining Tables')
  console.log('═'.repeat(60))

  // Load client mapping
  const clientMapping = await getClientMapping()

  if (clientMapping.size === 0) {
    console.error('❌ No client mappings loaded. Aborting.')
    process.exit(1)
  }

  // Process each table
  const results = {}
  for (const tableName of TABLES) {
    results[tableName] = await backfillTable(tableName, clientMapping)
  }

  // Show coverage
  await showCoverage()

  console.log('\n✅ Migration complete!')
  console.log('\nNext steps:')
  console.log('1. If any tables showed "column does NOT exist", run the SQL migration:')
  console.log('   docs/migrations/20251227_add_client_uuid_to_remaining_tables.sql')
  console.log('2. Re-run this script to backfill the data')
}

main().catch(console.error)
