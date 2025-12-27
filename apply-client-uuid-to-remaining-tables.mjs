#!/usr/bin/env node

/**
 * Priority 2: Add client_uuid to Remaining Tables
 *
 * Tables needing client_uuid:
 * 1. aged_accounts_history
 * 2. client_event_exclusions
 * 3. client_logos
 * 4. client_meetings
 * 5. comments
 * 6. cse_client_assignments
 * 7. nps_client_priority
 * 8. nps_client_trends
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function executeSQL(sql, description) {
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql })
  if (error) {
    console.log(`   ⚠️ ${description}: ${error.message}`)
    return { success: false, error: error.message }
  }
  if (data && !data.success) {
    console.log(`   ⚠️ ${description}: ${data.error}`)
    return { success: false, error: data.error }
  }
  return { success: true, data }
}

// Tables that need client_uuid added
const tablesToMigrate = [
  { name: 'aged_accounts_history', clientCol: 'client_name' },
  { name: 'client_event_exclusions', clientCol: 'client_name' },
  { name: 'client_logos', clientCol: 'client_name' },
  { name: 'client_meetings', clientCol: 'client_name' },
  { name: 'comments', clientCol: 'client_name' },
  { name: 'cse_client_assignments', clientCol: 'client_name' },
  { name: 'nps_client_priority', clientCol: 'client_name' },
  { name: 'nps_client_trends', clientCol: 'client_name' },
]

async function migrateTable(table) {
  console.log(`\n📦 Migrating ${table.name}...`)

  // 1. Add client_uuid column
  const addCol = await executeSQL(
    `ALTER TABLE ${table.name} ADD COLUMN IF NOT EXISTS client_uuid UUID`,
    'Add client_uuid column'
  )
  if (!addCol.success) return false
  console.log(`   ✅ Added client_uuid column`)

  // 2. Create index
  const addIdx = await executeSQL(
    `CREATE INDEX IF NOT EXISTS idx_${table.name}_client_uuid ON ${table.name}(client_uuid)`,
    'Create index'
  )
  if (addIdx.success) {
    console.log(`   ✅ Created index`)
  }

  // 3. Backfill using resolve_client_id function
  const backfill = await executeSQL(
    `UPDATE ${table.name} t
     SET client_uuid = resolve_client_id(t.${table.clientCol})
     WHERE t.client_uuid IS NULL
       AND t.${table.clientCol} IS NOT NULL
       AND t.${table.clientCol} != ''`,
    'Backfill client_uuid'
  )
  if (backfill.success) {
    console.log(`   ✅ Backfilled existing records`)
  }

  // 4. Add trigger for auto-population
  const triggerFn = await executeSQL(
    `CREATE OR REPLACE FUNCTION auto_resolve_${table.name}_client_uuid()
     RETURNS TRIGGER AS $
     BEGIN
       IF NEW.client_uuid IS NULL AND NEW.${table.clientCol} IS NOT NULL AND NEW.${table.clientCol} != '' THEN
         NEW.client_uuid := resolve_client_id(NEW.${table.clientCol});
       END IF;
       RETURN NEW;
     END;
     $ LANGUAGE plpgsql`,
    'Create trigger function'
  )

  if (triggerFn.success) {
    const trigger = await executeSQL(
      `DROP TRIGGER IF EXISTS trg_auto_resolve_${table.name}_client_uuid ON ${table.name};
       CREATE TRIGGER trg_auto_resolve_${table.name}_client_uuid
         BEFORE INSERT OR UPDATE ON ${table.name}
         FOR EACH ROW
         EXECUTE FUNCTION auto_resolve_${table.name}_client_uuid()`,
      'Create trigger'
    )
    if (trigger.success) {
      console.log(`   ✅ Created auto-resolve trigger`)
    }
  }

  // 5. Verify coverage
  const { data: stats, error: statsErr } = await supabase
    .from(table.name)
    .select('client_uuid', { count: 'exact' })

  if (!statsErr) {
    const { count: total } = await supabase
      .from(table.name)
      .select('*', { count: 'exact', head: true })

    const { count: withUuid } = await supabase
      .from(table.name)
      .select('*', { count: 'exact', head: true })
      .not('client_uuid', 'is', null)

    const coverage = total > 0 ? Math.round((withUuid / total) * 100) : 100
    console.log(`   📊 Coverage: ${withUuid}/${total} (${coverage}%)`)
  }

  return true
}

async function run() {
  console.log('🔧 Priority 2: Adding client_uuid to Remaining Tables')
  console.log('=' .repeat(60))

  let success = 0
  let failed = 0

  for (const table of tablesToMigrate) {
    const result = await migrateTable(table)
    if (result) success++
    else failed++
  }

  console.log('\n' + '=' .repeat(60))
  console.log(`\n✅ Migration complete: ${success} tables migrated, ${failed} failed`)

  // Summary
  console.log('\n📊 Final Coverage Report:')
  for (const table of tablesToMigrate) {
    const { count: total } = await supabase
      .from(table.name)
      .select('*', { count: 'exact', head: true })

    const { count: withUuid } = await supabase
      .from(table.name)
      .select('*', { count: 'exact', head: true })
      .not('client_uuid', 'is', null)

    const coverage = total > 0 ? Math.round((withUuid / total) * 100) : 100
    const status = coverage >= 90 ? '✅' : coverage >= 50 ? '⚠️' : '❌'
    console.log(`   ${status} ${table.name}: ${withUuid}/${total} (${coverage}%)`)
  }
}

run().catch(console.error)
