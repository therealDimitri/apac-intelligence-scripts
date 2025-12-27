#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const internalId = '7978c4d3-5417-4170-bb95-33551f738859'

const internalAliases = [
  'Internal Meeting',
  'Steering Committee Altera Opal CoP (Meeting #6)',
  'NPS Action Plan  to Client Success Action Tracker',
  'Client Segmentation Reminder: Goal Metrics Update for Q4 (DUE Nov 3)',
  'NPS Client Success',
  'Create CS Connect agenda',
  'Action Requested: Client Leadership Council (name TBD)',
  'Team Management',
  'Test Client',
  'Todd/Dimitri',
  '2026 APAC Marcom Planning',
  'Sunrise CarePath Webinar',
  'Declined: APAC : Quick Meet-up with APAC Client Teams and Sunrise Squad 6',
]

async function run() {
  console.log('Adding aliases for Internal client...\n')

  // Check existing aliases first
  const { data: existing } = await supabase
    .from('client_aliases_unified')
    .select('alias')
    .eq('client_id', internalId)

  const existingAliases = new Set((existing || []).map(a => a.alias))

  let added = 0
  for (const alias of internalAliases) {
    if (existingAliases.has(alias)) {
      console.log(`  ➖ ${alias} (already exists)`)
      continue
    }

    const { error } = await supabase.from('client_aliases_unified').insert({
      client_id: internalId,
      alias: alias,
      alias_type: 'import',
    })

    if (!error) {
      console.log(`  ✅ ${alias}`)
      added++
    } else {
      console.log(`  ⚠️ ${alias}: ${error.message}`)
    }
  }

  console.log(`\nAdded ${added} new aliases`)

  // Backfill again
  console.log('\nBackfilling tables...')

  const { data: result1 } = await supabase.rpc('exec_sql', {
    sql_query: `
      UPDATE client_meetings t
      SET client_uuid = resolve_client_id(t.client_name)
      WHERE t.client_uuid IS NULL AND t.client_name IS NOT NULL AND t.client_name != ''
    `,
  })
  console.log('client_meetings:', result1?.success ? '✅' : result1?.error)

  const { data: result2 } = await supabase.rpc('exec_sql', {
    sql_query: `
      UPDATE comments t
      SET client_uuid = resolve_client_id(t.client_name)
      WHERE t.client_uuid IS NULL AND t.client_name IS NOT NULL AND t.client_name != ''
    `,
  })
  console.log('comments:', result2?.success ? '✅' : result2?.error)

  // Check final coverage
  console.log('\nFinal coverage:')

  const tables = ['client_meetings', 'comments', 'cse_client_assignments', 'client_event_exclusions']
  for (const table of tables) {
    const { count: total } = await supabase.from(table).select('*', { count: 'exact', head: true })
    const { count: withUuid } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
      .not('client_uuid', 'is', null)

    const pct = total > 0 ? Math.round((withUuid / total) * 100) : 100
    const status = pct >= 90 ? '✅' : pct >= 70 ? '⚠️' : '❌'
    console.log(`  ${status} ${table}: ${withUuid}/${total} (${pct}%)`)
  }
}

run().catch(console.error)
