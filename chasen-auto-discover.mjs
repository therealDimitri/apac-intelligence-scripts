#!/usr/bin/env node
/**
 * ChaSen Auto-Discovery Script
 *
 * Automatically discovers new database tables and adds them to ChaSen's knowledge.
 *
 * Usage:
 *   node scripts/chasen-auto-discover.mjs           # Discover and list new tables
 *   node scripts/chasen-auto-discover.mjs --add     # Add all discovered tables
 *   node scripts/chasen-auto-discover.mjs --sync    # Sync row counts for existing sources
 *   node scripts/chasen-auto-discover.mjs --status  # Show current data source status
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

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

// Emoji map for categories
const EMOJI_MAP = {
  client: '👥',
  operations: '⚙️',
  analytics: '📊',
  system: '🔧',
  general: '📋',
}

// Tables to always exclude from discovery
const EXCLUDED_TABLES = [
  'schema_migrations',
  'spatial_ref_sys',
  'geography_columns',
  'geometry_columns',
  'raster_columns',
  'raster_overviews',
]

/**
 * Get all tables in the public schema
 */
async function getAllTables() {
  const { data, error } = await supabase.rpc('discover_new_tables')

  if (error) {
    // Fallback to direct query if RPC not available
    const { data: tables, error: queryError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')

    if (queryError) {
      console.error('❌ Failed to discover tables:', queryError)
      return []
    }
    return tables?.map((t) => ({ table_name: t.table_name })) || []
  }

  return data || []
}

/**
 * Get current configured data sources
 */
async function getCurrentSources() {
  const { data, error } = await supabase
    .from('chasen_data_sources')
    .select('*')
    .order('priority', { ascending: false })

  if (error) {
    console.error('❌ Failed to fetch data sources:', error)
    return []
  }

  return data || []
}

/**
 * Get columns for a table
 */
async function getTableColumns(tableName) {
  const { data, error } = await supabase
    .from('information_schema.columns')
    .select('column_name, data_type, is_nullable')
    .eq('table_name', tableName)
    .eq('table_schema', 'public')

  if (error) {
    console.warn(`⚠️ Failed to get columns for ${tableName}`)
    return []
  }

  return data || []
}

/**
 * Get row count for a table
 */
async function getRowCount(tableName) {
  try {
    const { count, error } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true })

    if (error) return 0
    return count || 0
  } catch {
    return 0
  }
}

/**
 * Suggest category based on table name
 */
function suggestCategory(tableName) {
  if (
    tableName.includes('client') ||
    tableName.includes('nps') ||
    tableName.includes('health')
  ) {
    return 'client'
  }
  if (
    tableName.includes('action') ||
    tableName.includes('meeting') ||
    tableName.includes('comment') ||
    tableName.includes('initiative')
  ) {
    return 'operations'
  }
  if (
    tableName.includes('aging') ||
    tableName.includes('history') ||
    tableName.includes('analytics') ||
    tableName.includes('topic')
  ) {
    return 'analytics'
  }
  return 'system'
}

/**
 * Generate suggested configuration for a table
 */
async function generateConfig(tableName) {
  const columns = await getTableColumns(tableName)
  const rowCount = await getRowCount(tableName)

  // Select first 6-8 relevant columns (exclude large text/json)
  const selectColumns = columns
    .filter(
      (c) =>
        !c.column_name.includes('password') &&
        !c.column_name.includes('secret') &&
        !c.column_name.includes('token') &&
        c.data_type !== 'jsonb' &&
        c.data_type !== 'json' &&
        c.data_type !== 'bytea'
    )
    .slice(0, 8)
    .map((c) => c.column_name)

  // Find date column for time filtering
  const dateColumn = columns.find(
    (c) =>
      c.column_name.includes('created_at') ||
      c.column_name.includes('updated_at') ||
      c.column_name.includes('date')
  )

  const category = suggestCategory(tableName)

  return {
    table_name: tableName,
    display_name: tableName.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    description: `Auto-discovered table with ${rowCount} rows`,
    category,
    priority: 40,
    is_enabled: true,
    select_columns: selectColumns.length > 0 ? selectColumns : ['*'],
    order_by: dateColumn ? `${dateColumn.column_name} DESC` : null,
    limit_rows: 10,
    filter_condition: null,
    time_filter_column: dateColumn?.column_name || null,
    time_filter_days: dateColumn ? 30 : null,
    section_emoji: EMOJI_MAP[category] || '📋',
    section_title: null,
    include_link: null,
    row_count: rowCount,
  }
}

/**
 * Add a new data source
 */
async function addDataSource(config) {
  const { error } = await supabase.from('chasen_data_sources').insert(config)

  if (error) {
    console.error(`❌ Failed to add ${config.table_name}:`, error.message)
    return false
  }

  console.log(`✅ Added: ${config.table_name} (${config.category})`)
  return true
}

/**
 * Sync row counts for all sources
 */
async function syncRowCounts() {
  const sources = await getCurrentSources()

  console.log('\n📊 Syncing row counts...\n')

  for (const source of sources) {
    const count = await getRowCount(source.table_name)
    const { error } = await supabase
      .from('chasen_data_sources')
      .update({ row_count: count, last_synced_at: new Date().toISOString() })
      .eq('id', source.id)

    if (error) {
      console.log(`❌ ${source.table_name}: Failed to sync`)
    } else {
      console.log(`✅ ${source.table_name}: ${count} rows`)
    }
  }
}

/**
 * Show current data source status
 */
async function showStatus() {
  const sources = await getCurrentSources()

  console.log('\n📋 ChaSen Data Sources Status\n')
  console.log('=' .repeat(80))

  const byCategory = {}
  for (const source of sources) {
    if (!byCategory[source.category]) {
      byCategory[source.category] = []
    }
    byCategory[source.category].push(source)
  }

  for (const [category, items] of Object.entries(byCategory)) {
    console.log(`\n${EMOJI_MAP[category] || '📋'} ${category.toUpperCase()}`)
    console.log('-'.repeat(40))

    for (const item of items) {
      const status = item.is_enabled ? '✅' : '❌'
      const rows = item.row_count !== null ? `(${item.row_count} rows)` : ''
      console.log(`  ${status} [P${item.priority}] ${item.display_name} ${rows}`)
      console.log(`     → ${item.table_name}`)
    }
  }

  console.log('\n' + '='.repeat(80))
  console.log(`Total: ${sources.length} data sources configured`)
}

/**
 * Discover new tables
 */
async function discoverNewTables() {
  console.log('\n🔍 Discovering new database tables...\n')

  const sources = await getCurrentSources()
  const configuredTables = new Set(sources.map((s) => s.table_name))

  // Get all tables from database
  const { data: allTables, error } = await supabase.rpc('discover_new_tables')

  let newTables = []

  if (error || !allTables) {
    // Fallback: manually discover tables
    console.log('⚠️ Using fallback discovery method...\n')

    const { data: pgTables } = await supabase
      .from('pg_catalog.pg_tables')
      .select('tablename')
      .eq('schemaname', 'public')

    if (pgTables) {
      for (const table of pgTables) {
        if (
          !configuredTables.has(table.tablename) &&
          !EXCLUDED_TABLES.includes(table.tablename) &&
          !table.tablename.startsWith('_')
        ) {
          const config = await generateConfig(table.tablename)
          if (config.row_count > 0) {
            newTables.push(config)
          }
        }
      }
    }
  } else {
    newTables = allTables.filter(
      (t) =>
        !configuredTables.has(t.table_name) &&
        !EXCLUDED_TABLES.includes(t.table_name) &&
        t.row_count > 0
    )

    // Generate full configs
    const configs = []
    for (const table of newTables) {
      const config = await generateConfig(table.table_name)
      configs.push(config)
    }
    newTables = configs
  }

  return newTables
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2)

  console.log('🧠 ChaSen Auto-Discovery')
  console.log('========================\n')

  // Check if chasen_data_sources table exists
  const { error: tableCheck } = await supabase
    .from('chasen_data_sources')
    .select('id')
    .limit(1)

  if (tableCheck) {
    console.log('⚠️ chasen_data_sources table not found.')
    console.log('   Run the migration first:')
    console.log('   docs/migrations/20251227_chasen_data_sources_config.sql\n')
    process.exit(1)
  }

  if (args.includes('--status')) {
    await showStatus()
    return
  }

  if (args.includes('--sync')) {
    await syncRowCounts()
    return
  }

  // Discover new tables
  const newTables = await discoverNewTables()

  if (newTables.length === 0) {
    console.log('✅ No new tables to add. ChaSen is fully connected!')
    await showStatus()
    return
  }

  console.log(`Found ${newTables.length} new table(s):\n`)

  for (const table of newTables) {
    console.log(
      `  ${EMOJI_MAP[table.category]} ${table.display_name} (${table.row_count} rows)`
    )
    console.log(`     Table: ${table.table_name}`)
    console.log(`     Columns: ${table.select_columns.join(', ')}`)
    console.log('')
  }

  if (args.includes('--add')) {
    console.log('\n📥 Adding new data sources...\n')

    let added = 0
    for (const config of newTables) {
      if (await addDataSource(config)) {
        added++
      }
    }

    console.log(`\n✅ Added ${added}/${newTables.length} new data sources`)
  } else {
    console.log('\n💡 To add these tables, run:')
    console.log('   node scripts/chasen-auto-discover.mjs --add\n')
  }
}

main().catch(console.error)
