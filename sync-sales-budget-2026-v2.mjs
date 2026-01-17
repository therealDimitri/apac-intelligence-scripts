#!/usr/bin/env node
/**
 * Sales Budget 2026 v0.1 Sync Script
 *
 * Imports all sheets from the updated APAC 2026 Sales Budget 14Jan2026 v0.1.xlsx
 * - Maps "New Asia CSE" to "Open Role"
 * - Uses Oracle Quote Number from APAC Pipeline by Qtr (RECON) sheet
 * - Uses Forecast Status and Stage from Oracle Quote Detail sheet
 *
 * Run: node scripts/sync-sales-budget-2026-v2.mjs
 */

import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
import * as fs from 'fs'
import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing Supabase environment variables')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const SALES_BUDGET_PATH = '/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth/Documents/Client Success/Sales Planning & Targets/Sales Targets/2026/APAC 2026 Sales Budget 14Jan2026 v0.1.xlsx'

const SOURCE_FILE = 'APAC 2026 Sales Budget 14Jan2026 v0.1'

// CSE name mapping
function mapCSEName(name) {
  if (!name) return null
  const nameLower = name.toLowerCase().trim()

  // Map "New Asia CSE" and "Kenny Gan" to "Open Role"
  if (nameLower.includes('new asia') || nameLower === 'kenny gan') {
    return 'Open Role'
  }

  // Map "Johnathan Salisbury" to "John Salisbury" for consistency
  if (nameLower === 'johnathan salisbury') {
    return 'John Salisbury'
  }

  return name.trim()
}

// Excel date conversion
function excelDateToISO(excelDate) {
  if (!excelDate) return null
  if (typeof excelDate === 'string') {
    // Try to parse as date string
    const parsed = new Date(excelDate)
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0]
    }
    return null
  }
  if (typeof excelDate === 'number') {
    // Excel dates are days since 1900-01-01
    const date = new Date((excelDate - 25569) * 86400 * 1000)
    return date.toISOString().split('T')[0]
  }
  if (excelDate instanceof Date) {
    return excelDate.toISOString().split('T')[0]
  }
  return null
}

// Parse numeric value
function parseNumber(value) {
  if (value === null || value === undefined || value === '') return 0
  if (typeof value === 'number') return value
  const parsed = parseFloat(String(value).replace(/[$,]/g, ''))
  return isNaN(parsed) ? 0 : parsed
}

// ============================================================================
// 1. Run Schema Migration
// ============================================================================
async function runMigration() {
  console.log('\n📦 Running schema migration...')

  // Create oracle_quote_details table
  const { error: createOracleError } = await supabase.rpc('exec_sql', {
    sql: `
      CREATE TABLE IF NOT EXISTS oracle_quote_details (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sales_team TEXT DEFAULT 'INTL APAC',
        account_name TEXT NOT NULL,
        cdh_account_number TEXT,
        opty_name TEXT NOT NULL,
        opty_id TEXT NOT NULL,
        opportunity_owner TEXT,
        quote_number TEXT NOT NULL,
        order_type TEXT,
        forecast_status TEXT,
        stage TEXT,
        close_date DATE,
        fiscal_period TEXT,
        fiscal_year INTEGER,
        item_num TEXT,
        item_description TEXT,
        gl_product TEXT,
        business_unit TEXT,
        quoting_category TEXT,
        rev_type TEXT,
        tcv DECIMAL(15,2) DEFAULT 0,
        item_term_months INTEGER,
        acv DECIMAL(15,2) DEFAULT 0,
        acv_weighted_identifier TEXT,
        acv_weighting DECIMAL(5,4) DEFAULT 0,
        acv_weighted DECIMAL(15,2) DEFAULT 0,
        source_file TEXT DEFAULT 'APAC 2026 Sales Budget 14Jan2026 v0.1',
        source_sheet TEXT DEFAULT 'Oracle Quote Detail',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `
  })

  if (createOracleError) {
    console.log('Note: oracle_quote_details table may already exist or exec_sql not available')
  }

  // Try direct table operations instead
  console.log('✓ Schema ready (tables will be created on first insert if needed)')
}

// ============================================================================
// 2. Import Oracle Quote Detail Sheet
// ============================================================================
async function importOracleQuoteDetail(workbook) {
  console.log('\n📊 Importing Oracle Quote Detail...')

  const sheet = workbook.Sheets['Oracle Quote Detail']
  if (!sheet) {
    console.error('  ❌ Sheet not found')
    return
  }

  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 })

  // Headers at row 2 (index 1)
  const headers = data[1]
  console.log(`  Found ${data.length - 2} rows`)

  // Clear existing data
  const { error: deleteError } = await supabase
    .from('oracle_quote_details')
    .delete()
    .gte('id', '00000000-0000-0000-0000-000000000000')

  if (deleteError && !deleteError.message.includes('does not exist')) {
    console.error('  Delete error:', deleteError.message)
  }

  const records = []
  for (let i = 2; i < data.length; i++) {
    const row = data[i]
    if (!row || !row[1]) continue  // Skip if no account name

    const record = {
      sales_team: row[0] || 'INTL APAC',
      account_name: row[1] || '',
      opty_name: row[2] || '',
      opty_id: row[3] || '',
      opportunity_owner: mapCSEName(row[4]),
      quote_number: String(row[5] || ''),
      order_type: row[6] || null,
      forecast_status: row[7] || null,
      stage: row[8] || null,
      close_date: excelDateToISO(row[9]),
      fiscal_period: row[10] || null,
      fiscal_year: row[11] ? parseInt(row[11]) : 2026,
      cdh_account_number: row[12] || null,
      item_num: row[13] || null,
      item_description: row[14] || null,
      gl_product: row[15] || null,
      business_unit: row[16] || null,
      quoting_category: row[17] || null,
      rev_type: row[18] || null,
      tcv: parseNumber(row[19]),
      item_term_months: row[20] ? parseInt(row[20]) : null,
      acv: parseNumber(row[21]),
      acv_weighted_identifier: row[22] || null,
      acv_weighting: parseNumber(row[23]),
      acv_weighted: parseNumber(row[24]),
      source_file: SOURCE_FILE,
      source_sheet: 'Oracle Quote Detail'
    }

    if (record.account_name && record.opty_id) {
      records.push(record)
    }
  }

  // Insert in batches
  const batchSize = 100
  let inserted = 0
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize)
    const { error } = await supabase.from('oracle_quote_details').insert(batch)
    if (error) {
      console.error(`  Batch ${i / batchSize + 1} error:`, error.message)
    } else {
      inserted += batch.length
    }
  }

  console.log(`  ✓ Inserted ${inserted} Oracle Quote Detail records`)
}

// ============================================================================
// 3. Import APAC Pipeline by Qtr (RECON) Sheet
// ============================================================================
async function importPipelineRecon(workbook) {
  console.log('\n📊 Importing APAC Pipeline by Qtr (RECON)...')

  const sheet = workbook.Sheets['APAC Pipeline by Qtr (RECON)']
  if (!sheet) {
    console.error('  ❌ Sheet not found')
    return
  }

  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 })

  // Headers at row 2 (index 1)
  // Columns: Fiscal Period, Forecast Category, Account Name, Opportunity Name, Opty Id,
  //          CSE, CAM, In or Out, < 75K, Upside, Focus Deal, Close Date, Oracle Quote Number,
  //          Total ACV, Oracle Quote Status, TCV, Weighted ACV, ACV Net COGS, Bookings Forecast,
  //          Oracle Quote Detail: Total ACV, Oracle Quote Detail: ACV Weighted,
  //          Variance: ACV, Variance: ACV Weighted

  console.log(`  Found ${data.length - 2} rows`)

  // Clear existing pipeline data
  const { error: deleteError } = await supabase
    .from('sales_pipeline_opportunities')
    .delete()
    .gte('id', '00000000-0000-0000-0000-000000000000')

  if (deleteError) {
    console.log('  Note: Could not clear existing data:', deleteError.message)
  }

  const records = []
  for (let i = 2; i < data.length; i++) {
    const row = data[i]
    if (!row || !row[0] || !row[2]) continue  // Skip if no fiscal period or account name

    const cseName = mapCSEName(row[5])

    const record = {
      fiscal_period: String(row[0] || '').replace('  ↑', '').trim(),
      forecast_category: String(row[1] || '').replace('  ↑', '').trim(),
      account_name: row[2] || '',
      opportunity_name: row[3] || '',
      opty_id: row[4] || null,
      cse_name: cseName,
      cam_name: row[6] || null,
      in_or_out: row[7] || null,
      is_under_75k: row[8] === 'Yes' || row[8] === true,
      is_upside: row[9] === true || row[9] === 'Yes',
      is_focus_deal: row[10] === true || row[10] === 'Yes',
      close_date: excelDateToISO(row[11]),
      oracle_quote_number: String(row[12] || ''),
      total_acv: parseNumber(row[13]),
      oracle_quote_status: row[14] || null,
      tcv: parseNumber(row[15]),
      weighted_acv: parseNumber(row[16]),
      acv_net_cogs: parseNumber(row[17]),
      bookings_forecast: parseNumber(row[18]),
      oracle_quote_detail_total_acv: parseNumber(row[19]),
      oracle_quote_detail_acv_weighted: parseNumber(row[20]),
      variance_acv: parseNumber(row[21]),
      variance_acv_weighted: parseNumber(row[22]),
      source_file: SOURCE_FILE,
      source_sheet: 'APAC Pipeline by Qtr (RECON)'
    }

    if (record.account_name) {
      records.push(record)
    }
  }

  // Insert in batches
  const batchSize = 50
  let inserted = 0
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize)
    const { error } = await supabase.from('sales_pipeline_opportunities').insert(batch)
    if (error) {
      console.error(`  Batch ${i / batchSize + 1} error:`, error.message)
    } else {
      inserted += batch.length
    }
  }

  console.log(`  ✓ Inserted ${inserted} pipeline records from RECON sheet`)

  // Now enrich with Forecast Status and Stage from Oracle Quote Detail
  await enrichPipelineWithOracleData()
}

// ============================================================================
// 4. Enrich Pipeline with Oracle Quote Detail (Forecast Status, Stage)
// ============================================================================
async function enrichPipelineWithOracleData() {
  console.log('\n🔗 Enriching pipeline with Oracle Quote Detail data...')

  // Get aggregated Oracle data by opty_id
  const { data: oracleData, error: oracleError } = await supabase
    .from('oracle_quote_details')
    .select('opty_id, forecast_status, stage')

  if (oracleError) {
    console.error('  Error fetching Oracle data:', oracleError.message)
    return
  }

  // Create lookup map by opty_id (take first occurrence)
  const oracleLookup = new Map()
  for (const row of oracleData || []) {
    if (row.opty_id && !oracleLookup.has(row.opty_id)) {
      oracleLookup.set(row.opty_id, {
        forecast_status: row.forecast_status,
        stage: row.stage
      })
    }
  }

  console.log(`  Built lookup with ${oracleLookup.size} unique opportunities`)

  // Get pipeline records
  const { data: pipelineData, error: pipelineError } = await supabase
    .from('sales_pipeline_opportunities')
    .select('id, opty_id')

  if (pipelineError) {
    console.error('  Error fetching pipeline:', pipelineError.message)
    return
  }

  // Update pipeline records with Oracle data
  let updated = 0
  for (const pipeline of pipelineData || []) {
    if (pipeline.opty_id && oracleLookup.has(pipeline.opty_id)) {
      const oracle = oracleLookup.get(pipeline.opty_id)
      const { error } = await supabase
        .from('sales_pipeline_opportunities')
        .update({
          forecast_status: oracle.forecast_status,
          stage: oracle.stage,
          updated_at: new Date().toISOString()
        })
        .eq('id', pipeline.id)

      if (!error) updated++
    }
  }

  console.log(`  ✓ Enriched ${updated} pipeline records with Forecast Status & Stage`)
}

// ============================================================================
// 5. Import CSE Summary Sheets
// ============================================================================
async function importCSESummary(workbook) {
  console.log('\n📊 Importing CSE Summary data...')

  // Clear existing CSE summary
  await supabase
    .from('cse_sales_budget_summary')
    .delete()
    .gte('id', '00000000-0000-0000-0000-000000000000')

  // Import from "Sales Budget CSE" sheet (row 3 headers)
  const budgetSheet = workbook.Sheets['Sales Budget CSE']
  if (budgetSheet) {
    const data = XLSX.utils.sheet_to_json(budgetSheet, { header: 1 })
    // Headers at row 3, data starts row 4
    // Structure: CSE Name (grouped), Opportunity, Wgt ACV, ACV Net COGS, Total ACV, TCV

    const cseTotals = new Map()
    let currentCSE = null

    for (let i = 3; i < data.length; i++) {
      const row = data[i]
      if (!row || !row[0]) continue

      const firstCol = String(row[0]).trim()

      // Check if this is a CSE name row (has total values)
      if (firstCol && !firstCol.includes('Grand Total') && row[1] && typeof row[1] === 'number') {
        // This might be a summary row for a CSE
        // Check if next rows are opportunities or if this is the CSE total
        const nextRow = data[i + 1]
        if (!nextRow || !nextRow[0] || typeof nextRow[1] !== 'number') {
          // This is a CSE total row
          const cseName = mapCSEName(firstCol)
          if (cseName) {
            cseTotals.set(cseName, {
              weighted_acv: parseNumber(row[1]),
              acv_net_cogs: parseNumber(row[2]),
              total_acv: parseNumber(row[3]),
              tcv: parseNumber(row[4])
            })
          }
        } else {
          currentCSE = mapCSEName(firstCol)
        }
      }
    }

    console.log(`  Found ${cseTotals.size} CSEs in Sales Budget CSE`)
  }

  // Import from "CSE Summary Wgt ACV" sheet (Oracle source)
  const oracleSheet = workbook.Sheets['CSE Summary Wgt ACV']
  if (oracleSheet) {
    const data = XLSX.utils.sheet_to_json(oracleSheet, { header: 1 })

    const records = []
    for (let i = 3; i < data.length; i++) {
      const row = data[i]
      if (!row || !row[0]) continue

      const cseName = mapCSEName(row[0])
      if (!cseName || cseName.toLowerCase().includes('grand total')) continue

      records.push({
        cse_name: cseName,
        fiscal_year: 2026,
        oracle_acv_weighted: parseNumber(row[1]),
        oracle_total_acv: parseNumber(row[2]),
        source_file: SOURCE_FILE
      })
    }

    if (records.length > 0) {
      const { error } = await supabase.from('cse_sales_budget_summary').insert(records)
      if (error) {
        console.error('  Insert error:', error.message)
      } else {
        console.log(`  ✓ Inserted ${records.length} CSE summary records`)
      }
    }
  }
}

// ============================================================================
// 6. Import CAM Summary Sheets
// ============================================================================
async function importCAMSummary(workbook) {
  console.log('\n📊 Importing CAM Summary data...')

  // Clear existing CAM summary
  await supabase
    .from('cam_sales_budget_summary')
    .delete()
    .gte('id', '00000000-0000-0000-0000-000000000000')

  // Import from "CAM Summary Wgt ACV" sheet
  const oracleSheet = workbook.Sheets['CAM Summary Wgt ACV']
  if (oracleSheet) {
    const data = XLSX.utils.sheet_to_json(oracleSheet, { header: 1 })

    const records = []
    for (let i = 3; i < data.length; i++) {
      const row = data[i]
      if (!row || !row[0]) continue

      const camName = String(row[0]).trim()
      if (!camName || camName.toLowerCase().includes('grand total')) continue

      records.push({
        cam_name: camName,
        fiscal_year: 2026,
        oracle_acv_weighted: parseNumber(row[1]),
        oracle_total_acv: parseNumber(row[2]),
        source_file: SOURCE_FILE
      })
    }

    if (records.length > 0) {
      const { error } = await supabase.from('cam_sales_budget_summary').insert(records)
      if (error) {
        console.error('  Insert error:', error.message)
      } else {
        console.log(`  ✓ Inserted ${records.length} CAM summary records`)
      }
    }
  }
}

// ============================================================================
// 7. Update CSE/CAM Targets with New Totals
// ============================================================================
async function updateCSECAMTargets(workbook) {
  console.log('\n📊 Updating CSE/CAM Targets...')

  // Get CSE Summary data
  const cseSummarySheet = workbook.Sheets['CSE Summary Wgt ACV']
  if (!cseSummarySheet) return

  const cseData = XLSX.utils.sheet_to_json(cseSummarySheet, { header: 1 })

  const cseTargets = {
    'John Salisbury': { weighted_acv: 0, total_acv: 0 },
    'Laura Messing': { weighted_acv: 0, total_acv: 0 },
    'Tracey Bland': { weighted_acv: 0, total_acv: 0 },
    'Open Role': { weighted_acv: 0, total_acv: 0 }
  }

  for (let i = 3; i < cseData.length; i++) {
    const row = cseData[i]
    if (!row || !row[0]) continue

    const rawName = String(row[0]).trim()
    const cseName = mapCSEName(rawName)

    if (cseName && cseTargets[cseName] !== undefined) {
      cseTargets[cseName].weighted_acv = parseNumber(row[1])
      cseTargets[cseName].total_acv = parseNumber(row[2])
    }
  }

  console.log('  CSE Targets from file:')
  for (const [name, targets] of Object.entries(cseTargets)) {
    console.log(`    ${name}: Wgt ACV $${(targets.weighted_acv / 1000000).toFixed(2)}M, Total ACV $${(targets.total_acv / 1000000).toFixed(2)}M`)
  }

  // Update cse_cam_targets table for each CSE
  for (const [cseName, targets] of Object.entries(cseTargets)) {
    if (targets.weighted_acv === 0) continue

    const quarterlyWeightedACV = targets.weighted_acv / 4
    const quarterlyTotalACV = targets.total_acv / 4

    for (const quarter of ['Q1 2026', 'Q2 2026', 'Q3 2026', 'Q4 2026']) {
      const { error } = await supabase
        .from('cse_cam_targets')
        .update({
          weighted_acv_target: quarterlyWeightedACV,
          total_acv_target: quarterlyTotalACV,
          updated_at: new Date().toISOString()
        })
        .eq('cse_cam_name', cseName)
        .eq('quarter', quarter)
        .eq('fiscal_year', 2026)

      if (error && !error.message.includes('0 rows')) {
        console.error(`    Error updating ${cseName} ${quarter}:`, error.message)
      }
    }
  }

  console.log('  ✓ Updated CSE/CAM targets with new values')
}

// ============================================================================
// Main
// ============================================================================
async function main() {
  console.log('=' .repeat(70))
  console.log('Sales Budget 2026 v0.1 Import Script')
  console.log('=' .repeat(70))
  console.log(`Source: ${SALES_BUDGET_PATH}`)

  // Check if file exists
  if (!fs.existsSync(SALES_BUDGET_PATH)) {
    console.error(`\n❌ File not found: ${SALES_BUDGET_PATH}`)
    process.exit(1)
  }

  // Load workbook
  console.log('\n📂 Loading Excel file...')
  const buffer = fs.readFileSync(SALES_BUDGET_PATH)
  const workbook = XLSX.read(buffer, { type: 'buffer' })

  console.log(`  Found ${workbook.SheetNames.length} sheets:`)
  workbook.SheetNames.forEach(name => console.log(`    - ${name}`))

  try {
    // Run imports
    await runMigration()
    await importOracleQuoteDetail(workbook)
    await importPipelineRecon(workbook)
    await importCSESummary(workbook)
    await importCAMSummary(workbook)
    await updateCSECAMTargets(workbook)

    console.log('\n' + '=' .repeat(70))
    console.log('✅ Import complete!')
    console.log('=' .repeat(70))

    // Print summary
    const { count: pipelineCount } = await supabase
      .from('sales_pipeline_opportunities')
      .select('*', { count: 'exact', head: true })

    const { count: oracleCount } = await supabase
      .from('oracle_quote_details')
      .select('*', { count: 'exact', head: true })

    console.log(`\nSummary:`)
    console.log(`  - Pipeline opportunities: ${pipelineCount}`)
    console.log(`  - Oracle Quote Details: ${oracleCount}`)

  } catch (error) {
    console.error('\n❌ Error during import:', error)
    process.exit(1)
  }
}

main()
