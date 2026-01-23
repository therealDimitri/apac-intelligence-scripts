#!/usr/bin/env node
/**
 * SLA Report Import Script
 *
 * Parses client SLA Excel reports and imports data into Supabase support tables.
 *
 * Usage:
 *   node scripts/sync-sla-reports.mjs <path-to-excel-file> [--dry-run]
 *   node scripts/sync-sla-reports.mjs data/sla-reports/*.xlsx
 *
 * Expected Excel sheets:
 *   - SLA Compliance / Response and Comm Compliance
 *   - Resolution Details
 *   - Open Aging Cases
 *   - Case Volume
 *   - Case Survey (CSAT)
 *   - Service Credit
 *   - Problems / Enhancements / Known Problems
 *   - Availability
 */

import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

// Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY not set')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// Command line args
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const files = args.filter(a => !a.startsWith('--'))

if (files.length === 0) {
  console.log(\`
Usage: node scripts/sync-sla-reports.mjs <path-to-excel-file> [--dry-run]

Examples:
  node scripts/sync-sla-reports.mjs data/sla-reports/WAH_Nov2025.xlsx
  node scripts/sync-sla-reports.mjs data/sla-reports/*.xlsx --dry-run

Expected Excel sheets:
  - SLA Compliance / Response and Comm Compliance
  - Resolution Details / Open Cases
  - Open Aging Cases
  - Case Volume
  - Case Survey (CSAT)
  - Service Credit
  - Problems / Enhancements
  - Availability
\`)
  process.exit(0)
}

/**
 * Extract client name from filename
 */
function extractClientFromFilename(filename) {
  const base = path.basename(filename, path.extname(filename))
  let name = base
    .replace(/Support Dashboard[-_\s]*/gi, '')
    .replace(/[-_\s]*Q\d[-_\s]*\d{4}/gi, '')
    .replace(/[-_\s]*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[-_\s]*\d{4}/gi, '')
    .replace(/[-_\s]*\d{4}/g, '')
    .trim()
  name = name.replace(/[-_\s]+$/, '').trim()
  return name
}

/**
 * Find matching sheet by name patterns
 */
function findSheet(workbook, patterns) {
  const sheetNames = workbook.SheetNames
  for (const pattern of patterns) {
    const found = sheetNames.find(name =>
      name.toLowerCase().includes(pattern.toLowerCase())
    )
    if (found) return workbook.Sheets[found]
  }
  return null
}

/**
 * Parse sheet to JSON
 */
function parseSheet(sheet) {
  if (!sheet) return []
  return XLSX.utils.sheet_to_json(sheet, { defval: null })
}

/**
 * Extract period from filename
 */
function extractPeriod(filename) {
  const monthMatch = filename.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[-_\s]*(\d{4})/i)
  if (monthMatch) {
    const months = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 }
    const month = months[monthMatch[1].toLowerCase()]
    const year = parseInt(monthMatch[2])
    const start = new Date(year, month, 1)
    const end = new Date(year, month + 1, 0)
    return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0], type: 'monthly' }
  }

  const quarterMatch = filename.match(/Q(\d)[-_\s]*(\d{4})/i)
  if (quarterMatch) {
    const quarter = parseInt(quarterMatch[1])
    const year = parseInt(quarterMatch[2])
    const startMonth = (quarter - 1) * 3
    const start = new Date(year, startMonth, 1)
    const end = new Date(year, startMonth + 3, 0)
    return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0], type: 'quarterly' }
  }

  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0], type: 'monthly' }
}

/**
 * Parse SLA compliance data
 */
function parseSLACompliance(sheet) {
  const rows = parseSheet(sheet)
  if (rows.length === 0) return null

  let responseSLA = null
  let resolutionSLA = null
  let breachCount = 0

  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      const lowerKey = key.toLowerCase()
      if (lowerKey.includes('response') && (lowerKey.includes('sla') || lowerKey.includes('%'))) {
        responseSLA = parseFloat(value) || responseSLA
      }
      if (lowerKey.includes('resolution') && (lowerKey.includes('sla') || lowerKey.includes('%'))) {
        resolutionSLA = parseFloat(value) || resolutionSLA
      }
      if (lowerKey.includes('breach')) {
        breachCount = parseInt(value) || breachCount
      }
    }
  }
  return { responseSLA, resolutionSLA, breachCount }
}

/**
 * Parse case volume data
 */
function parseCaseVolume(sheet) {
  const rows = parseSheet(sheet)
  if (rows.length === 0) return null

  let totalIncoming = 0, totalClosed = 0, backlog = 0

  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      const lowerKey = key.toLowerCase()
      const val = parseInt(value) || 0
      if (lowerKey.includes('incoming') || lowerKey.includes('opened') || lowerKey.includes('created')) totalIncoming += val
      if (lowerKey.includes('closed') || lowerKey.includes('resolved')) totalClosed += val
      if (lowerKey.includes('backlog') || lowerKey.includes('open')) backlog = val
    }
  }
  return { totalIncoming, totalClosed, backlog }
}

/**
 * Parse priority cases
 */
function parsePriorityCases(sheet) {
  const rows = parseSheet(sheet)
  let critical = 0, high = 0, moderate = 0, low = 0

  for (const row of rows) {
    const priority = (row.Priority || row.priority || '').toLowerCase()
    if (priority.includes('critical') || priority === '1') critical++
    else if (priority.includes('high') || priority === '2') high++
    else if (priority.includes('moderate') || priority.includes('medium') || priority === '3') moderate++
    else if (priority.includes('low') || priority === '4') low++
  }
  return { critical, high, moderate, low }
}

/**
 * Parse aging cases
 */
function parseAgingCases(sheet) {
  const rows = parseSheet(sheet)
  const aging = { '0-7d': 0, '8-30d': 0, '31-60d': 0, '61-90d': 0, '90d+': 0 }

  for (const row of rows) {
    const daysOpen = parseInt(row['Days Open'] || row['days_open'] || row['Age'] || row['age'] || 0)
    if (daysOpen <= 7) aging['0-7d']++
    else if (daysOpen <= 30) aging['8-30d']++
    else if (daysOpen <= 60) aging['31-60d']++
    else if (daysOpen <= 90) aging['61-90d']++
    else aging['90d+']++
  }
  return aging
}

/**
 * Parse CSAT data
 */
function parseCSATData(sheet) {
  const rows = parseSheet(sheet)
  if (rows.length === 0) return null

  let totalScore = 0, count = 0, surveysSent = 0, surveysCompleted = 0

  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      const lowerKey = key.toLowerCase()
      if (lowerKey.includes('score') || lowerKey.includes('rating')) {
        const score = parseFloat(value)
        if (score && score >= 1 && score <= 5) { totalScore += score; count++ }
      }
      if (lowerKey.includes('sent')) surveysSent = parseInt(value) || surveysSent
      if (lowerKey.includes('completed') || lowerKey.includes('response')) surveysCompleted = parseInt(value) || surveysCompleted
    }
  }
  return { satisfactionScore: count > 0 ? totalScore / count : null, surveysSent, surveysCompleted: surveysCompleted || count }
}

/**
 * Parse availability
 */
function parseAvailability(sheet) {
  const rows = parseSheet(sheet)
  if (rows.length === 0) return null

  let availabilityPercent = null, outageCount = 0, outageMinutes = 0

  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      const lowerKey = key.toLowerCase()
      if (lowerKey.includes('availability') || lowerKey.includes('uptime')) availabilityPercent = parseFloat(value) || availabilityPercent
      if (lowerKey.includes('outage') && lowerKey.includes('count')) outageCount = parseInt(value) || outageCount
      if (lowerKey.includes('outage') && (lowerKey.includes('minute') || lowerKey.includes('duration'))) outageMinutes = parseInt(value) || outageMinutes
    }
  }
  return { availabilityPercent, outageCount, outageMinutes }
}

/**
 * Main import function
 */
async function importSLAReport(filePath) {
  console.log(\`\n📊 Processing: \${path.basename(filePath)}\`)

  if (!fs.existsSync(filePath)) {
    console.error(\`   ❌ File not found: \${filePath}\`)
    return
  }

  const workbook = XLSX.readFile(filePath)
  console.log(\`   📑 Found sheets: \${workbook.SheetNames.join(', ')}\`)

  const clientName = extractClientFromFilename(filePath)
  const period = extractPeriod(filePath)

  console.log(\`   👤 Client: \${clientName}\`)
  console.log(\`   📅 Period: \${period.start} to \${period.end} (\${period.type})\`)

  const slaSheet = findSheet(workbook, ['SLA Compliance', 'Response', 'Communication', 'SLA'])
  const caseVolumeSheet = findSheet(workbook, ['Case Volume', 'Volume', 'Cases'])
  const resolutionSheet = findSheet(workbook, ['Resolution', 'Open Cases', 'Cases'])
  const agingSheet = findSheet(workbook, ['Aging', 'Open Aging'])
  const csatSheet = findSheet(workbook, ['Survey', 'CSAT', 'Satisfaction'])
  const availabilitySheet = findSheet(workbook, ['Availability', 'Uptime'])

  const slaData = parseSLACompliance(slaSheet)
  const volumeData = parseCaseVolume(caseVolumeSheet)
  const priorityData = parsePriorityCases(resolutionSheet || agingSheet)
  const agingData = parseAgingCases(agingSheet || resolutionSheet)
  const csatData = parseCSATData(csatSheet)
  const availData = parseAvailability(availabilitySheet)

  console.log(\`   📈 SLA: Response \${slaData?.responseSLA ?? 'N/A'}%, Resolution \${slaData?.resolutionSLA ?? 'N/A'}%\`)
  console.log(\`   📊 Cases: Critical \${priorityData.critical}, High \${priorityData.high}, Moderate \${priorityData.moderate}, Low \${priorityData.low}\`)
  console.log(\`   ⏱️  Aging 30d+: \${agingData['31-60d'] + agingData['61-90d'] + agingData['90d+']}\`)
  console.log(\`   ⭐ CSAT: \${csatData?.satisfactionScore?.toFixed(2) ?? 'N/A'}\`)

  if (dryRun) {
    console.log(\`   🔍 DRY RUN - No changes made\`)
    return
  }

  const metricsRecord = {
    client_name: clientName,
    period_start: period.start,
    period_end: period.end,
    period_type: period.type,
    total_incoming: volumeData?.totalIncoming || 0,
    total_closed: volumeData?.totalClosed || 0,
    backlog: volumeData?.backlog || 0,
    critical_open: priorityData.critical,
    high_open: priorityData.high,
    moderate_open: priorityData.moderate,
    low_open: priorityData.low,
    aging_0_7d: agingData['0-7d'],
    aging_8_30d: agingData['8-30d'],
    aging_31_60d: agingData['31-60d'],
    aging_61_90d: agingData['61-90d'],
    aging_90d_plus: agingData['90d+'],
    response_sla_percent: slaData?.responseSLA || null,
    resolution_sla_percent: slaData?.resolutionSLA || null,
    breach_count: slaData?.breachCount || 0,
    availability_percent: availData?.availabilityPercent || null,
    outage_count: availData?.outageCount || 0,
    outage_minutes: availData?.outageMinutes || 0,
    surveys_sent: csatData?.surveysSent || 0,
    surveys_completed: csatData?.surveysCompleted || 0,
    satisfaction_score: csatData?.satisfactionScore || null,
    source_file: path.basename(filePath),
    imported_at: new Date().toISOString()
  }

  const { error: metricsError } = await supabase
    .from('support_sla_metrics')
    .upsert(metricsRecord, { onConflict: 'client_name,period_start,period_end' })

  if (metricsError) {
    console.error(\`   ❌ Error inserting metrics: \${metricsError.message}\`)
  } else {
    console.log(\`   ✅ Metrics saved\`)
  }

  console.log(\`   ✅ Import complete for \${clientName}\`)
}

async function main() {
  console.log('🚀 SLA Report Import Script')
  console.log(\`   Mode: \${dryRun ? 'DRY RUN' : 'LIVE'}\`)
  console.log(\`   Files: \${files.length}\`)

  for (const file of files) {
    try {
      await importSLAReport(file)
    } catch (err) {
      console.error(\`   ❌ Error processing \${file}: \${err.message}\`)
    }
  }

  console.log('\n✅ Import complete')
}

main().catch(err => { console.error('Fatal error:', err); process.exit(1) })
