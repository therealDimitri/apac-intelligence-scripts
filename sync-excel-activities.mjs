#!/usr/bin/env node

/**
 * Manual Excel Activity Sync Script
 *
 * Run this locally to sync activities from the Excel file to the database.
 * The Excel file is read from OneDrive and synced via the API.
 *
 * Usage:
 *   node scripts/sync-excel-activities.mjs
 *   node scripts/sync-excel-activities.mjs --year 2026
 *   node scripts/sync-excel-activities.mjs --dry-run
 *
 * Environment:
 *   Requires .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import XLSX from 'xlsx'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { ACTIVITY_REGISTER_CURRENT, requireOneDrive } from './lib/onedrive-paths.mjs'
import { createClientNameResolver } from './lib/resolve-client-names.mjs'
import { createSyncLogger } from './lib/sync-logger.mjs'

requireOneDrive()

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Parse command line arguments
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const yearArg = args.find(a => a.startsWith('--year='))
const year = yearArg ? parseInt(yearArg.split('=')[1], 10) : new Date().getFullYear()

// Load environment variables
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8')
  for (const line of envContent.split('\n')) {
    if (line && !line.startsWith('#')) {
      const [key, ...valueParts] = line.split('=')
      if (key && valueParts.length > 0) {
        process.env[key.trim()] = valueParts.join('=').trim()
      }
    }
  }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Activity name to event code mapping
const ACTIVITY_NAME_TO_EVENT_CODE = {
  'President/Group Leader Engagement (in person)': 'PGL_ENGAGE',
  'EVP Engagement': 'EVP_ENGAGE',
  'Strategic Ops Plan (Partnership) Meeting': 'STRAT_OPS',
  'Satisfaction Action Plan': 'SAT_PLAN',
  'SLA/Service Review Meeting': 'SLA_REVIEW',
  'CE On-Site Attendance': 'CE_ONSITE',
  'Insight Touch Point': 'INSIGHT_TP',
  'Health Check (Opal)': 'HEALTH_CHECK',
  'Upcoming Release Planning': 'RELEASE_PLAN',
  'Whitespace Demos (Sunrise)': 'WHITESPACE',
  'APAC Client Forum / User Group': 'CLIENT_FORUM',
  'Updating Client 360': 'UPDATE_360',
}

// Legacy sheet name to client name mapping — used as fallback when DB aliases unavailable
const SHEET_NAME_TO_CLIENT_FALLBACK = {
  'Albury-Wodonga (AWH)': 'Albury Wodonga Health',
  'GHA': 'Gippsland Health Alliance (GHA)',
  'Grampians': 'Grampians Health',
  'GRMC': 'Gosford Regional Medical Centre',
  'MINDEF-NCS': 'MINDEF Singapore',
  'Mount Alvernia': 'Mount Alvernia Hospital',
  'RVEEH': 'Royal Victorian Eye and Ear Hospital',
  'SA Health iPro': 'SA Health',
  'SA Health iQemo': 'SA Health',
  'SA Health Sunrise': 'SA Health',
  'SLMC': "St Luke's Medical Center",
  'Vic Health': 'Department of Health Victoria',
  'WA Health': 'WA Health',
  'Waikato': 'Waikato District Health Board',
  'Western Health': 'Western Health',
  'Barwon Health': 'Barwon Health',
  'Epworth': 'Epworth HealthCare',
  'SingHealth': 'SingHealth',
}

function excelDateToJS(excelDate) {
  const excelEpoch = new Date(1899, 11, 30)
  const msPerDay = 24 * 60 * 60 * 1000
  return new Date(excelEpoch.getTime() + excelDate * msPerDay)
}

async function main() {
  console.log(`\n📊 Excel Activity Sync`)
  console.log(`   Year: ${year}`)
  console.log(`   Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}\n`)

  // Initialise client name resolver from DB (falls back to hardcoded map)
  const resolveSheetName = await createClientNameResolver(supabase, SHEET_NAME_TO_CLIENT_FALLBACK)

  // Initialise sync logger
  const syncLog = await createSyncLogger(supabase, 'activity_sync', dryRun ? 'manual_dry_run' : 'manual')

  // Excel file path
  const excelPath = ACTIVITY_REGISTER_CURRENT

  if (!fs.existsSync(excelPath)) {
    console.error(`❌ Excel file not found: ${excelPath}`)
    process.exit(1)
  }

  console.log(`📁 Reading: ${excelPath}\n`)

  // Parse Excel
  const workbook = XLSX.readFile(excelPath)
  const activities = []
  const skipSheets = ['Client Segments', 'Activities', 'Summary']

  for (const sheetName of workbook.SheetNames) {
    if (skipSheets.includes(sheetName)) continue

    const sheet = workbook.Sheets[sheetName]
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 })
    const clientName = resolveSheetName(sheetName)

    for (let rowIdx = 4; rowIdx < data.length; rowIdx++) {
      const row = data[rowIdx]
      if (!row || !row[1]) continue

      const activityName = String(row[1]).trim()
      const eventCode = ACTIVITY_NAME_TO_EVENT_CODE[activityName]
      if (!eventCode) continue

      for (let month = 1; month <= 12; month++) {
        const completedColIdx = 5 + (month - 1) * 2
        const dateColIdx = completedColIdx + 1

        const completedValue = row[completedColIdx]
        const dateValue = row[dateColIdx]

        const completed =
          completedValue === true ||
          completedValue === 1 ||
          String(completedValue).toLowerCase() === 'true' ||
          String(completedValue).toLowerCase() === 'yes'

        if (completed) {
          let completedDate = null
          if (typeof dateValue === 'number') {
            completedDate = excelDateToJS(dateValue)
          } else if (dateValue instanceof Date) {
            completedDate = dateValue
          } else if (typeof dateValue === 'string' && dateValue) {
            const parsed = new Date(dateValue)
            if (!isNaN(parsed.getTime())) completedDate = parsed
          }
          if (!completedDate) {
            completedDate = new Date(year, month - 1, 15)
          }

          activities.push({
            clientName,
            activityName,
            eventCode,
            month,
            completedDate,
          })
        }
      }
    }
  }

  console.log(`✅ Found ${activities.length} completed activities\n`)

  if (activities.length === 0) {
    console.log('No activities to sync.')
    return
  }

  // Fetch event type mappings
  const { data: eventTypes } = await supabase
    .from('segmentation_event_types')
    .select('id, event_code')

  const eventTypeMap = new Map()
  for (const et of eventTypes) {
    eventTypeMap.set(et.event_code, et.id)
  }

  // Build hash set of existing events for app-level dedup
  // This avoids unnecessary RPC calls for events already in the DB
  const existingHashes = new Set()
  const { data: existingEvents } = await supabase
    .from('segmentation_events')
    .select('client_name, event_type_id, event_date, source')

  if (existingEvents) {
    for (const ev of existingEvents) {
      const hash = createHash('sha256')
        .update(`${ev.client_name}|${ev.event_type_id}|${ev.event_date}`)
        .digest('hex')
      // Only skip if existing source is 'excel' — dashboard entries may need updating
      if (ev.source === 'excel') {
        existingHashes.add(hash)
      }
    }
    console.log(`📋 Loaded ${existingHashes.size} existing excel event hashes for dedup\n`)
  }

  // Process activities
  let synced = 0
  let skipped = 0
  let dupSkipped = 0
  let errors = 0

  for (const activity of activities) {
    const eventTypeId = eventTypeMap.get(activity.eventCode)
    if (!eventTypeId) {
      console.log(`  ⚠️ Unknown event code: ${activity.eventCode}`)
      skipped++
      continue
    }

    const resolvedClientName = activity.clientName
    const eventDate = activity.completedDate.toISOString().split('T')[0]

    // App-level dedup: skip if identical event already exists from excel
    const hash = createHash('sha256')
      .update(`${resolvedClientName}|${eventTypeId}|${eventDate}`)
      .digest('hex')

    if (existingHashes.has(hash)) {
      dupSkipped++
      continue
    }

    if (dryRun) {
      console.log(`  [DRY] ${resolvedClientName} | ${activity.eventCode} | ${eventDate}`)
      synced++
      continue
    }

    const { error } = await supabase.rpc('upsert_segmentation_event', {
      p_client_name: resolvedClientName,
      p_event_type_id: eventTypeId,
      p_event_date: eventDate,
      p_completed: true,
      p_source: 'excel',
      p_notes: `Synced from Excel: ${activity.activityName}`,
    })

    if (error) {
      console.log(`  ❌ ${resolvedClientName} | ${activity.eventCode}: ${error.message}`)
      errors++
      syncLog.addFailed()
    } else {
      existingHashes.add(hash) // Track newly inserted events for this run
      synced++
      syncLog.addCreated()
    }
    syncLog.addProcessed()
  }

  console.log(`\n📈 Summary:`)
  console.log(`   Synced: ${synced}`)
  console.log(`   Duplicates skipped: ${dupSkipped}`)
  console.log(`   Unknown codes skipped: ${skipped}`)
  console.log(`   Errors: ${errors}`)

  if (dryRun) {
    console.log(`\n💡 Run without --dry-run to apply changes.`)
  }

  // Log sync completion
  await syncLog.complete({ year, dryRun, dupSkipped })
}

main().catch(async err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
