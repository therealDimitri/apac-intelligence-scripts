#!/usr/bin/env node
/**
 * Automated Monthly BURC Sync Script
 *
 * Syncs data from BURC source files to Supabase database.
 * Can be run manually or scheduled via cron/launchd.
 *
 * Usage:
 *   node scripts/sync-burc-monthly.mjs              # Full sync
 *   node scripts/sync-burc-monthly.mjs --dry-run    # Preview changes only
 *   node scripts/sync-burc-monthly.mjs --waterfall  # Sync waterfall only
 *
 * Source: 2026 APAC Performance.xlsx (forecast/actuals file)
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import XLSX from 'xlsx'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Configuration
const BURC_PATH = '/tmp/burc-source/BURC'
const SOURCE_FILE = join(BURC_PATH, '2026', '2026 APAC Performance.xlsx')

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const WATERFALL_ONLY = args.includes('--waterfall')

const formatCurrency = (value) => {
  if (!value || isNaN(value)) return '$0'
  if (Math.abs(value) >= 1000000) return `$${(value / 1000000).toFixed(2)}M`
  if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(1)}K`
  return `$${value.toFixed(0)}`
}

function readExcelFile(filePath) {
  try {
    const workbook = XLSX.readFile(filePath)
    return workbook
  } catch (error) {
    console.log(`❌ Error reading ${filePath}: ${error.message}`)
    return null
  }
}

function getSheetData(workbook, sheetName) {
  if (!workbook || !workbook.SheetNames.includes(sheetName)) {
    return null
  }
  const sheet = workbook.Sheets[sheetName]
  return XLSX.utils.sheet_to_json(sheet, { header: 1 })
}

/**
 * Extract waterfall data from source file
 * Structure: Column 0 = label, Column 1 = value
 */
function extractWaterfallData(workbook) {
  console.log('\n📊 Extracting Waterfall Data...')

  const data = getSheetData(workbook, 'Waterfall Data')
  if (!data) {
    console.log('  ⚠️ Waterfall Data sheet not found')
    return null
  }

  const waterfall = {
    backlog_runrate: null,
    committed_gross_rev: null,
    best_case_ps: null,
    best_case_maint: null,
    pipeline_sw: null,
    pipeline_ps: null,
    target_ebita: null
  }

  // Map source row labels to database fields (exact matches from source)
  const rowMappings = {
    'Backlog and Runrate': 'backlog_runrate',
    'Committed Gross Rev': 'committed_gross_rev',
    'Best Case PS': 'best_case_ps',
    'Best Case Maint': 'best_case_maint',
    'Pipeline SW': 'pipeline_sw',
    'Pipeline PS': 'pipeline_ps',
    'Target EBITA': 'target_ebita'
  }

  // Parse each row - Column 0 is label, Column 1 is value
  for (const row of data) {
    if (!row || !row[0]) continue

    const label = String(row[0]).trim()
    const value = row[1]

    if (rowMappings[label] && typeof value === 'number') {
      const dbField = rowMappings[label]
      waterfall[dbField] = value
      console.log(`  ${dbField}: ${formatCurrency(value)}`)
    }
  }

  return waterfall
}

/**
 * Extract CSI OPEX data from source file
 */
function extractCSIOpexData(workbook) {
  console.log('\n📊 Extracting CSI OPEX Data...')

  const data = getSheetData(workbook, 'APAC BURC - Monthly NR Comp')
  if (!data) {
    console.log('  ⚠️ Monthly NR Comp sheet not found')
    return null
  }

  const months = data[0] || []
  const records = []

  // Find License, PS, and Maintenance Actual rows
  const findActualRow = (startIdx, endIdx) => {
    for (let i = startIdx; i < Math.min(endIdx, data.length); i++) {
      if (data[i] && data[i][0] === 'Actual') return data[i]
    }
    return null
  }

  const licenseActual = findActualRow(2, 6)
  const psActual = findActualRow(7, 11)
  const maintActual = findActualRow(12, 16)

  for (let i = 1; i <= 12; i++) {
    const month = months[i]
    if (!month) continue

    records.push({
      year: 2026,
      month_num: i,
      month: month,
      license_nr: licenseActual?.[i] || 0,
      ps_nr: psActual?.[i] || 0,
      maintenance_nr: maintActual?.[i] || 0,
      source_file: '2026 APAC Performance.xlsx',
      updated_at: new Date().toISOString()
    })
  }

  console.log(`  Found ${records.length} monthly records`)
  return records
}

/**
 * Extract attrition risk data
 */
function extractAttritionData(workbook) {
  console.log('\n📊 Extracting Attrition Data...')

  const data = getSheetData(workbook, 'Attrition')
  if (!data) {
    console.log('  ⚠️ Attrition sheet not found')
    return null
  }

  const records = []
  const headers = data[0] || []

  // Find relevant columns
  const clientIdx = headers.findIndex(h => String(h).toLowerCase().includes('client') || String(h).toLowerCase().includes('customer'))
  const riskIdx = headers.findIndex(h => String(h).toLowerCase().includes('risk'))
  const revenueIdx = headers.findIndex(h => String(h).toLowerCase().includes('revenue') || String(h).toLowerCase().includes('arr'))

  if (clientIdx === -1) {
    console.log('  ⚠️ Could not find client column')
    return null
  }

  for (let i = 1; i < data.length; i++) {
    const row = data[i]
    if (!row || !row[clientIdx]) continue

    records.push({
      client_name: row[clientIdx],
      risk_level: row[riskIdx] || 'Medium',
      revenue_at_risk: row[revenueIdx] || 0,
      source_file: '2026 APAC Performance.xlsx',
      updated_at: new Date().toISOString()
    })
  }

  console.log(`  Found ${records.length} attrition records`)
  return records
}

/**
 * Sync waterfall data to database
 */
async function syncWaterfall(data) {
  console.log('\n🔄 Syncing Waterfall Data...')

  if (DRY_RUN) {
    console.log('  [DRY RUN] Would update burc_waterfall with:')
    Object.entries(data).forEach(([key, val]) => {
      if (val !== null) console.log(`    ${key}: ${formatCurrency(val)}`)
    })
    return
  }

  const fieldMappings = {
    backlog_runrate: 'Backlog/Runrate',
    committed_gross_rev: 'Committed Gross Rev',
    best_case_ps: 'Best Case PS',
    best_case_maint: 'Best Case Maint',
    pipeline_sw: 'Pipeline SW',
    pipeline_ps: 'Pipeline PS',
    target_ebita: 'Target EBITA'
  }

  for (const [field, category] of Object.entries(fieldMappings)) {
    if (data[field] === null) continue

    const { error } = await supabase
      .from('burc_waterfall')
      .update({ amount: data[field], updated_at: new Date().toISOString() })
      .eq('category', category)

    if (error) {
      console.log(`  ❌ Error updating ${category}: ${error.message}`)
    } else {
      console.log(`  ✅ ${category}: ${formatCurrency(data[field])}`)
    }
  }
}

/**
 * Sync CSI OPEX data to database
 */
async function syncCSIOpex(records) {
  console.log('\n🔄 Syncing CSI OPEX Data...')

  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would upsert ${records.length} records to burc_csi_opex`)
    return
  }

  for (const record of records) {
    const { error } = await supabase
      .from('burc_csi_opex')
      .upsert(record, {
        onConflict: 'year,month_num',
        ignoreDuplicates: false
      })

    if (error) {
      console.log(`  ❌ Error upserting ${record.month}: ${error.message}`)
    }
  }

  console.log(`  ✅ Synced ${records.length} monthly CSI OPEX records`)
}

/**
 * Sync attrition data to database
 */
async function syncAttrition(records) {
  console.log('\n🔄 Syncing Attrition Data...')

  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would upsert ${records.length} records to burc_attrition_risk`)
    return
  }

  for (const record of records) {
    const { error } = await supabase
      .from('burc_attrition_risk')
      .upsert(record, {
        onConflict: 'client_name',
        ignoreDuplicates: false
      })

    if (error) {
      console.log(`  ❌ Error upserting ${record.client_name}: ${error.message}`)
    }
  }

  console.log(`  ✅ Synced ${records.length} attrition records`)
}

/**
 * Refresh executive summary view
 */
async function refreshExecutiveSummary() {
  console.log('\n🔄 Refreshing Executive Summary...')

  if (DRY_RUN) {
    console.log('  [DRY RUN] Would refresh burc_executive_summary view')
    return
  }

  // The view is automatically calculated, just verify it's working
  const { data, error } = await supabase
    .from('burc_executive_summary')
    .select('*')
    .single()

  if (error) {
    console.log(`  ⚠️ Executive summary view error: ${error.message}`)
  } else {
    console.log('  ✅ Executive Summary updated:')
    console.log(`     Total Pipeline: ${formatCurrency(data.total_pipeline)}`)
    console.log(`     Weighted Pipeline: ${formatCurrency(data.weighted_pipeline)}`)
    console.log(`     EBITA Margin: ${data.ebita_margin_percent}%`)
  }
}

/**
 * Main sync function
 */
async function main() {
  console.log('═'.repeat(60))
  console.log('BURC MONTHLY SYNC')
  console.log(`Generated: ${new Date().toLocaleString('en-AU')}`)
  if (DRY_RUN) console.log('🔍 DRY RUN MODE - No changes will be made')
  console.log('═'.repeat(60))

  // Check source file exists
  if (!fs.existsSync(SOURCE_FILE)) {
    console.log(`\n❌ Source file not found: ${SOURCE_FILE}`)
    console.log('   Please ensure BURC files are extracted to /tmp/burc-source/')
    process.exit(1)
  }

  console.log(`\n📂 Source: ${SOURCE_FILE}`)

  const workbook = readExcelFile(SOURCE_FILE)
  if (!workbook) {
    process.exit(1)
  }

  console.log(`📊 Sheets: ${workbook.SheetNames.length} total`)

  // Extract data
  const waterfallData = extractWaterfallData(workbook)

  if (!WATERFALL_ONLY) {
    const csiOpexData = extractCSIOpexData(workbook)
    const attritionData = extractAttritionData(workbook)

    // Sync to database
    if (waterfallData) await syncWaterfall(waterfallData)
    if (csiOpexData) await syncCSIOpex(csiOpexData)
    if (attritionData) await syncAttrition(attritionData)
  } else {
    if (waterfallData) await syncWaterfall(waterfallData)
  }

  await refreshExecutiveSummary()

  console.log('\n═'.repeat(60))
  console.log('SYNC COMPLETE')
  console.log('═'.repeat(60))

  // Log sync record
  if (!DRY_RUN) {
    console.log(`\n📝 Sync completed at ${new Date().toISOString()}`)
  }
}

main().catch(error => {
  console.error('\n❌ Sync failed:', error.message)
  process.exit(1)
})
