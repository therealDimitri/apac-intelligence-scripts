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

async function run() {
  console.log('📊 Final client_uuid Coverage Report')
  console.log('='.repeat(60))

  const tables = [
    // Priority 2 tables
    { name: 'aged_accounts_history', col: 'client_uuid' },
    { name: 'client_event_exclusions', col: 'client_uuid' },
    { name: 'client_logos', col: 'client_uuid' },
    { name: 'client_meetings', col: 'client_uuid' },
    { name: 'comments', col: 'client_uuid' },
    { name: 'cse_client_assignments', col: 'client_uuid' },
    { name: 'nps_client_priority', col: 'client_uuid' },
    { name: 'nps_client_trends', col: 'client_uuid' },
    // Pre-existing tables
    { name: 'unified_meetings', col: 'client_uuid' },
    { name: 'actions', col: 'client_uuid' },
    { name: 'nps_responses', col: 'client_uuid' },
    { name: 'client_segmentation', col: 'client_uuid' },
    { name: 'aging_accounts', col: 'client_uuid' },
  ]

  let totalRows = 0
  let totalWithUuid = 0

  for (const table of tables) {
    try {
      const { count: total } = await supabase
        .from(table.name)
        .select('*', { count: 'exact', head: true })
      const { count: withUuid } = await supabase
        .from(table.name)
        .select('*', { count: 'exact', head: true })
        .not(table.col, 'is', null)

      const pct = total > 0 ? Math.round((withUuid / total) * 100) : 100
      const status = pct >= 90 ? '✅' : pct >= 70 ? '⚠️' : '❌'

      console.log(
        `${status} ${table.name.padEnd(30)} ${String(withUuid).padStart(4)}/${String(total).padStart(4)} (${String(pct).padStart(3)}%)`
      )

      totalRows += total
      totalWithUuid += withUuid
    } catch (err) {
      console.log(`❓ ${table.name.padEnd(30)} Error: ${err.message}`)
    }
  }

  console.log('='.repeat(60))
  const overallPct = totalRows > 0 ? Math.round((totalWithUuid / totalRows) * 100) : 0
  console.log(
    `   ${'TOTAL'.padEnd(30)} ${String(totalWithUuid).padStart(4)}/${String(totalRows).padStart(4)} (${overallPct}%)`
  )
}

run().catch(console.error)
