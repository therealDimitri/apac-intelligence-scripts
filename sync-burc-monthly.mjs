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
import { BURC_MASTER_FILE, requireOneDrive } from './lib/onedrive-paths.mjs'

requireOneDrive()

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Configuration
// Source of truth for 2024 actuals, 2025 actuals, and 2026 forecasts
// SharePoint: https://alteradh.sharepoint.com/teams/APACLeadershipTeam/Shared Documents/General/Performance/Financials/BURC/2026/2026 APAC Performance.xls
const PRIMARY_SOURCE = BURC_MASTER_FILE
// Fallback: Manual extraction path
const FALLBACK_SOURCE = '/tmp/burc-source/BURC/2026/2026 APAC Performance.xlsx'
// Use primary source, then fallback
const SOURCE_FILE = fs.existsSync(PRIMARY_SOURCE) ? PRIMARY_SOURCE : FALLBACK_SOURCE

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
 * Extract CSI Ratios and OPEX data from APAC BURC sheet
 * Uses pre-calculated ratios from rows 119-125 of the Budget Planning file
 */
function extractCSIOpexData(workbook) {
  console.log('\n📊 Extracting CSI Data from APAC BURC sheet...')

  const data = getSheetData(workbook, 'APAC BURC')
  if (!data) {
    console.log('  ⚠️ APAC BURC sheet not found')
    return null
  }

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const records = []

  // Row indices in APAC BURC sheet (0-indexed):
  // Row 10 (idx 9): Gross License Revenue
  // Row 11 (idx 10): Gross PS Revenue
  // Row 12 (idx 11): Gross Maintenance Revenue
  // Row 57 (idx 56): License NR
  // Row 58 (idx 57): PS NR
  // Row 59 (idx 58): Maintenance NR
  // Row 61 (idx 60): Net Revenue Excluding Pipeline
  // Row 69 (idx 68): PS OPEX
  // Row 75 (idx 74): Maintenance OPEX
  // Row 80 (idx 79): S&M OPEX
  // Row 86 (idx 85): R&D OPEX
  // Row 87 (idx 86): G&A OPEX
  // Row 120 (idx 119): CSI Ratio header
  // Row 121 (idx 120): Customer Service (Maint) ratio
  // Row 122 (idx 121): Sales & Marketing ratio
  // Row 123 (idx 122): R&D ratio
  // Row 124 (idx 123): Professional Services ratio
  // Row 125 (idx 124): Administration (G&A) ratio

  // Find rows by label for more robust matching
  const findRowByLabel = (searchTerm) => {
    for (let i = 0; i < data.length; i++) {
      if (data[i] && data[i][0] && String(data[i][0]).toLowerCase().includes(searchTerm.toLowerCase())) {
        return data[i]
      }
    }
    return null
  }

  // Get revenue and OPEX rows
  const licenseNRRow = findRowByLabel('License NR') || data[56]
  const psNRRow = findRowByLabel('Professional Service NR') || data[57]
  const maintNRRow = findRowByLabel('Maintenance NR') || data[58]
  const totalNRRow = findRowByLabel('Net Revenue Excluding Pipeline') || data[60]
  const psOpexRow = findRowByLabel('Professional Services (less Depr) - OPEX') || data[68]
  const maintOpexRow = findRowByLabel('Maintenance (less Depr) - OPEX') || data[74]
  const smOpexRow = findRowByLabel('Sales & Marketing (less Depr) - OPEX') || data[79]
  const rdOpexRow = findRowByLabel('Research & Development (less Depr)') || data[85]
  const gaOpexRow = findRowByLabel('General & Administration (less Depr)') || data[86]

  // Get pre-calculated CSI ratios (these are the official BURC forecasts)
  const maintRatioRow = findRowByLabel('Customer Service (>4)')
  const salesRatioRow = findRowByLabel('Sales & Marketing (>1)')
  const rdRatioRow = findRowByLabel('R&D (>1)')
  const psRatioRow = findRowByLabel('Professional Services (>2)')
  const gaRatioRow = findRowByLabel('Administration <=20%')

  console.log('  Found CSI ratio rows:')
  console.log('    - Maint (Customer Service):', maintRatioRow ? '✓' : '✗')
  console.log('    - Sales & Marketing:', salesRatioRow ? '✓' : '✗')
  console.log('    - R&D:', rdRatioRow ? '✓' : '✗')
  console.log('    - PS:', psRatioRow ? '✓' : '✗')
  console.log('    - G&A (Admin):', gaRatioRow ? '✓' : '✗')

  // Column mapping in APAC BURC sheet:
  // Column A (index 0) = Row labels
  // Column B (index 1) = "YTD Actual" or "Total" header
  // Column C (index 2) = Jan data
  // Column D (index 3) = Feb data, etc.
  for (let m = 1; m <= 12; m++) {
    const colIdx = m + 1  // Column index: m=1 (Jan) → colIdx=2 (Column C)

    // Get values, handling nulls
    const getValue = (row, idx) => {
      if (!row) return 0
      const val = row[idx]
      return (val !== null && val !== undefined && typeof val === 'number') ? val : 0
    }

    const record = {
      year: 2026,
      month_num: m,
      month: monthNames[m - 1],
      // Net Revenue values
      license_nr: getValue(licenseNRRow, colIdx),
      ps_nr: getValue(psNRRow, colIdx),
      maintenance_nr: getValue(maintNRRow, colIdx),
      total_nr: getValue(totalNRRow, colIdx),
      // OPEX values
      ps_opex: getValue(psOpexRow, colIdx),
      maintenance_opex: getValue(maintOpexRow, colIdx),
      sm_opex: getValue(smOpexRow, colIdx),
      rd_opex: getValue(rdOpexRow, colIdx),
      ga_opex: getValue(gaOpexRow, colIdx),
      // Pre-calculated CSI ratios from BURC
      burc_maint_ratio: getValue(maintRatioRow, colIdx),
      burc_sales_ratio: getValue(salesRatioRow, colIdx),
      burc_rd_ratio: getValue(rdRatioRow, colIdx),
      burc_ps_ratio: getValue(psRatioRow, colIdx),
      burc_ga_ratio: getValue(gaRatioRow, colIdx),
      source_file: '2026 APAC Performance.xlsx (Budget Planning)',
      updated_at: new Date().toISOString()
    }

    records.push(record)

    // Log non-zero ratio values
    if (record.burc_sales_ratio > 0) {
      console.log(`  ${monthNames[m-1]}: Sales Ratio = ${record.burc_sales_ratio.toFixed(2)}`)
    }
  }

  console.log(`  Extracted ${records.length} monthly records with pre-calculated CSI ratios`)
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
      risk_type: row[riskIdx] || 'Medium',
      total_at_risk: row[revenueIdx] || 0,
      last_synced: new Date().toISOString()
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

  // Database stores categories as snake_case field names, not display names
  const fieldMappings = {
    backlog_runrate: 'Backlog/Runrate',
    committed_gross_rev: 'Committed Gross Rev',
    best_case_ps: 'Best Case PS',
    best_case_maint: 'Best Case Maint',
    pipeline_sw: 'Pipeline SW',
    pipeline_ps: 'Pipeline PS',
    target_ebita: 'Target EBITA'
  }

  for (const [field, displayName] of Object.entries(fieldMappings)) {
    if (data[field] === null) continue

    const { data: updated, error } = await supabase
      .from('burc_waterfall')
      .update({ amount: data[field], updated_at: new Date().toISOString() })
      .eq('category', field)  // Use field name (snake_case) as that's what DB stores
      .select()

    if (error) {
      console.log(`  ❌ Error updating ${displayName}: ${error.message}`)
    } else if (!updated || updated.length === 0) {
      console.log(`  ⚠️ ${displayName}: No matching row found for category '${field}'`)
    } else {
      console.log(`  ✅ ${displayName}: ${formatCurrency(data[field])}`)
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
    // Only include columns that exist in the table (exclude burc_*_ratio columns)
    const { burc_maint_ratio, burc_sales_ratio, burc_rd_ratio, burc_ps_ratio, burc_ga_ratio, ...opexRecord } = record

    const { error } = await supabase
      .from('burc_csi_opex')
      .upsert(opexRecord, {
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
 * Sync pre-calculated CSI Ratios from BURC to burc_csi_ratios table
 * This overwrites the calculated values with the official BURC forecast ratios
 */
async function syncCSIRatios(records) {
  console.log('\n🔄 Syncing Pre-calculated CSI Ratios from BURC...')

  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would update ${records.length} records in burc_csi_ratios`)
    records.forEach(r => {
      if (r.burc_sales_ratio > 0 || r.burc_ps_ratio > 0) {
        console.log(`    ${r.month}: Sales=${r.burc_sales_ratio?.toFixed(2)}, PS=${r.burc_ps_ratio?.toFixed(2)}, Maint=${r.burc_maint_ratio?.toFixed(2)}`)
      }
    })
    return
  }

  let updated = 0
  for (const record of records) {
    // Map BURC ratio values to database columns
    // Note: BURC G&A is a percentage (e.g., 17.58), store as-is
    const ratioData = {
      year: record.year,
      month_num: record.month_num,
      ps_ratio: record.burc_ps_ratio || 0,
      sales_ratio: record.burc_sales_ratio || 0,
      maintenance_ratio: record.burc_maint_ratio || 0,
      rd_ratio: record.burc_rd_ratio || 0,
      ga_ratio: record.burc_ga_ratio || 0,
      // Calculate status based on targets
      ps_status: (record.burc_ps_ratio >= 2) ? 'green' : (record.burc_ps_ratio >= 1.5) ? 'amber' : 'red',
      sales_status: (record.burc_sales_ratio >= 1) ? 'green' : (record.burc_sales_ratio >= 0.5) ? 'amber' : 'red',
      maintenance_status: (record.burc_maint_ratio >= 4) ? 'green' : (record.burc_maint_ratio >= 3) ? 'amber' : 'red',
      rd_status: (record.burc_rd_ratio >= 1) ? 'green' : (record.burc_rd_ratio >= 0.5) ? 'amber' : 'red',
      ga_status: (record.burc_ga_ratio <= 20) ? 'green' : (record.burc_ga_ratio <= 25) ? 'amber' : 'red',
      calculated_at: new Date().toISOString()
    }

    const { error } = await supabase
      .from('burc_csi_ratios')
      .upsert(ratioData, {
        onConflict: 'year,month_num',
        ignoreDuplicates: false
      })

    if (error) {
      console.log(`  ❌ Error upserting ${record.month}: ${error.message}`)
    } else {
      updated++
    }
  }

  console.log(`  ✅ Updated ${updated} monthly CSI ratios with BURC forecast values`)

  // Show sample of key values
  const jan = records.find(r => r.month_num === 1)
  if (jan) {
    console.log(`  📊 Jan 2026 ratios: PS=${jan.burc_ps_ratio?.toFixed(2)}, Sales=${jan.burc_sales_ratio?.toFixed(2)}, Maint=${jan.burc_maint_ratio?.toFixed(2)}`)
  }
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
    // Note: Attrition data sync disabled - table lacks unique constraint
    // Attrition data was manually populated and should be maintained via UI
    // const attritionData = extractAttritionData(workbook)

    // Sync to database
    if (waterfallData) await syncWaterfall(waterfallData)
    if (csiOpexData) {
      await syncCSIOpex(csiOpexData)
      // Also sync the pre-calculated CSI ratios to burc_csi_ratios table
      await syncCSIRatios(csiOpexData)
    }
    // if (attritionData) await syncAttrition(attritionData)
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
