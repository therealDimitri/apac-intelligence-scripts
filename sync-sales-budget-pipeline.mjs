#!/usr/bin/env node

/**
 * Sync Sales Budget Pipeline Opportunities
 *
 * Imports pipeline data from "APAC Pipeline by Qtr (2)" sheet in APAC 2026 Sales Budget Excel
 * Cross-references with BURC pipeline data and marks matches
 *
 * Usage:
 *   node scripts/sync-sales-budget-pipeline.mjs --dry-run   # Preview only
 *   node scripts/sync-sales-budget-pipeline.mjs             # Live sync
 *   node scripts/sync-sales-budget-pipeline.mjs --verbose   # Detailed output
 */

import XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env.local') })

// Configuration
const EXCEL_PATH =
  '/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth/Documents/Client Success/Team Docs/Sales Targets/2026/APAC 2026 Sales Budget 6Jan2026.xlsx'
const SHEET_NAME = 'APAC Pipeline by Qtr (2)'
const HEADER_ROW = 5 // 0-indexed row where headers are

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

// Command line args
const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const VERBOSE = args.includes('--verbose')

// Column indices based on sheet structure
const COLUMNS = {
  FISCAL_PERIOD: 0,
  FORECAST_CATEGORY: 1,
  ACCOUNT_NAME: 2,
  OPPORTUNITY_NAME: 3,
  CSE: 4,
  CAM: 5,
  IN_OR_OUT: 6,
  UNDER_75K: 7,
  UPSIDE: 8,
  FOCUS_DEAL: 9,
  CLOSE_DATE: 10,
  ORACLE_QUOTE_NUMBER: 11,
  TOTAL_ACV: 12,
  ORACLE_QUOTE_STATUS: 13,
  TCV: 14,
  WEIGHTED_ACV: 15,
  ACV_NET_COGS: 16,
  BOOKINGS_FORECAST: 17,
}

// CSE name normalization - Sales Budget uses full names, we need to map to database names
const CSE_NAME_MAP = {
  'Johnathan Salisbury': 'John Salisbury',
  'John Salisbury': 'John Salisbury',
  'Laura Messing': 'Laura Messing',
  'Tracey Bland': 'Tracey Bland',
  'New Asia CSE': 'Open Role',
  'Open Role': 'Open Role',
}

// CAM name normalization
const CAM_NAME_MAP = {
  'Anu Pradhan': 'Anu Pradhan',
  'Nikki Wei': 'Nikki Wei',
}

console.log('🔄 Sales Budget Pipeline Sync')
console.log('='.repeat(60))
console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN (preview only)' : '🚀 LIVE SYNC'}`)
console.log(`Verbose: ${VERBOSE ? 'Yes' : 'No'}`)
console.log('')

function getCellValue(sheet, row, col) {
  const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })]
  return cell ? cell.v : null
}

function parseDate(value) {
  if (!value) return null
  // Excel dates can be numbers (serial) or strings
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value)
    return new Date(date.y, date.m - 1, date.d)
  }
  // Parse string date like "3/31/2026"
  const parts = String(value).split('/')
  if (parts.length === 3) {
    const month = parseInt(parts[0]) - 1
    const day = parseInt(parts[1])
    const year = parseInt(parts[2])
    return new Date(year, month, day)
  }
  return new Date(value)
}

function parseBoolean(value) {
  if (value === null || value === undefined) return false
  if (typeof value === 'boolean') return value
  const str = String(value).toLowerCase()
  return str === 'true' || str === 'yes' || str === '1'
}

function parseNumber(value) {
  if (value === null || value === undefined) return 0
  const num = parseFloat(value)
  return isNaN(num) ? 0 : num
}

function normalizeCseName(name) {
  if (!name) return null
  const normalized = CSE_NAME_MAP[name]
  if (normalized) return normalized
  // Try partial match
  const trimmed = String(name).trim()
  for (const [key, value] of Object.entries(CSE_NAME_MAP)) {
    if (trimmed.toLowerCase().includes(key.toLowerCase().split(' ')[0])) {
      return value
    }
  }
  return trimmed
}

function normalizeCamName(name) {
  if (!name) return null
  const normalized = CAM_NAME_MAP[name]
  return normalized || String(name).trim()
}

// String similarity for fuzzy matching
function similarity(s1, s2) {
  if (!s1 || !s2) return 0
  const str1 = String(s1).toLowerCase().replace(/[^a-z0-9]/g, '')
  const str2 = String(s2).toLowerCase().replace(/[^a-z0-9]/g, '')
  if (str1 === str2) return 1

  // Jaccard similarity on words
  const words1 = new Set(String(s1).toLowerCase().split(/\s+/))
  const words2 = new Set(String(s2).toLowerCase().split(/\s+/))
  const intersection = [...words1].filter((w) => words2.has(w)).length
  const union = new Set([...words1, ...words2]).size
  return union > 0 ? intersection / union : 0
}

async function loadBurcPipeline(supabase) {
  console.log('📥 Loading BURC pipeline for cross-reference...')

  const { data, error } = await supabase
    .from('pipeline_opportunities')
    .select('id, opportunity_name, client_name, acv, close_date')

  if (error) {
    console.error('Error loading BURC pipeline:', error.message)
    return []
  }

  console.log(`   Loaded ${data.length} BURC opportunities`)
  return data
}

function findBurcMatch(opportunity, burcPipeline) {
  // Try exact match on opportunity name first
  const exactMatch = burcPipeline.find(
    (b) =>
      b.opportunity_name &&
      opportunity.opportunity_name &&
      b.opportunity_name.toLowerCase() === opportunity.opportunity_name.toLowerCase()
  )

  if (exactMatch) {
    return { id: exactMatch.id, confidence: 'exact' }
  }

  // Try fuzzy match on opportunity name + client
  let bestMatch = null
  let bestScore = 0

  for (const burc of burcPipeline) {
    const nameSim = similarity(opportunity.opportunity_name, burc.opportunity_name)
    const clientSim = similarity(opportunity.account_name, burc.client_name)

    // Combined score (name matters more)
    const score = nameSim * 0.7 + clientSim * 0.3

    // Also check if ACV matches (strong signal)
    const acvMatch = opportunity.total_acv > 0 && Math.abs(opportunity.total_acv - burc.acv) < 1000

    const adjustedScore = acvMatch ? score + 0.2 : score

    if (adjustedScore > bestScore && adjustedScore > 0.5) {
      bestScore = adjustedScore
      bestMatch = burc
    }
  }

  if (bestMatch && bestScore > 0.7) {
    return { id: bestMatch.id, confidence: 'fuzzy' }
  }

  return null
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing Supabase credentials in .env.local')
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // Load Excel file
  console.log('📊 Loading Excel file...')
  console.log(`   File: ${EXCEL_PATH}`)

  const workbook = XLSX.readFile(EXCEL_PATH)
  const sheet = workbook.Sheets[SHEET_NAME]

  if (!sheet) {
    console.error(`❌ Sheet "${SHEET_NAME}" not found!`)
    console.log('   Available sheets:', workbook.SheetNames.join(', '))
    process.exit(1)
  }

  const range = XLSX.utils.decode_range(sheet['!ref'])
  console.log(`   Sheet: ${SHEET_NAME}`)
  console.log(`   Rows: ${range.e.r + 1}, Cols: ${range.e.c + 1}`)
  console.log('')

  // Load BURC pipeline for cross-reference
  const burcPipeline = await loadBurcPipeline(supabase)
  console.log('')

  // Parse opportunities
  console.log('📋 Parsing opportunities...')
  const opportunities = []

  for (let r = HEADER_ROW + 1; r <= range.e.r; r++) {
    const fiscalPeriod = getCellValue(sheet, r, COLUMNS.FISCAL_PERIOD)
    const opportunityName = getCellValue(sheet, r, COLUMNS.OPPORTUNITY_NAME)

    // Skip empty rows or summary rows
    if (!fiscalPeriod || !opportunityName) continue
    if (String(fiscalPeriod).includes('Total') || String(fiscalPeriod).includes('Grand')) continue

    const accountName = getCellValue(sheet, r, COLUMNS.ACCOUNT_NAME)
    const cseName = getCellValue(sheet, r, COLUMNS.CSE)
    const camName = getCellValue(sheet, r, COLUMNS.CAM)
    const forecastCategory = getCellValue(sheet, r, COLUMNS.FORECAST_CATEGORY)
    const inOrOut = getCellValue(sheet, r, COLUMNS.IN_OR_OUT)
    const under75k = getCellValue(sheet, r, COLUMNS.UNDER_75K)
    const upside = getCellValue(sheet, r, COLUMNS.UPSIDE)
    const focusDeal = getCellValue(sheet, r, COLUMNS.FOCUS_DEAL)
    const closeDate = getCellValue(sheet, r, COLUMNS.CLOSE_DATE)
    const oracleQuoteNumber = getCellValue(sheet, r, COLUMNS.ORACLE_QUOTE_NUMBER)
    const totalAcv = getCellValue(sheet, r, COLUMNS.TOTAL_ACV)
    const oracleQuoteStatus = getCellValue(sheet, r, COLUMNS.ORACLE_QUOTE_STATUS)
    const tcv = getCellValue(sheet, r, COLUMNS.TCV)
    const weightedAcv = getCellValue(sheet, r, COLUMNS.WEIGHTED_ACV)
    const acvNetCogs = getCellValue(sheet, r, COLUMNS.ACV_NET_COGS)
    const bookingsForecast = getCellValue(sheet, r, COLUMNS.BOOKINGS_FORECAST)

    const opportunity = {
      fiscal_period: String(fiscalPeriod).trim(),
      forecast_category: forecastCategory ? String(forecastCategory).trim() : null,
      account_name: accountName ? String(accountName).trim() : 'Unknown',
      opportunity_name: String(opportunityName).trim(),
      cse_name: normalizeCseName(cseName),
      cam_name: normalizeCamName(camName),
      in_or_out: inOrOut ? String(inOrOut).trim() : null,
      is_under_75k: String(under75k).toLowerCase() === 'yes',
      is_upside: parseBoolean(upside),
      is_focus_deal: parseBoolean(focusDeal),
      close_date: closeDate ? parseDate(closeDate).toISOString().split('T')[0] : null,
      oracle_quote_number: oracleQuoteNumber ? String(oracleQuoteNumber).trim() : null,
      total_acv: parseNumber(totalAcv),
      oracle_quote_status: oracleQuoteStatus ? String(oracleQuoteStatus).trim() : null,
      tcv: parseNumber(tcv),
      weighted_acv: parseNumber(weightedAcv),
      acv_net_cogs: parseNumber(acvNetCogs),
      bookings_forecast: parseNumber(bookingsForecast),
      source_file: 'APAC 2026 Sales Budget',
      source_sheet: SHEET_NAME,
    }

    // Find BURC match
    const burcMatch = findBurcMatch(opportunity, burcPipeline)
    if (burcMatch) {
      opportunity.burc_pipeline_id = burcMatch.id
      opportunity.burc_matched = true
      opportunity.burc_match_confidence = burcMatch.confidence
    } else {
      opportunity.burc_matched = false
      opportunity.burc_pipeline_id = null
      opportunity.burc_match_confidence = null
    }

    opportunities.push(opportunity)
  }

  console.log(`   Parsed ${opportunities.length} opportunities`)
  console.log('')

  // Stats
  const stats = {
    total: opportunities.length,
    byQuarter: {},
    byCse: {},
    byCam: {},
    byCategory: {},
    inTarget: 0,
    outTarget: 0,
    under75k: 0,
    focusDeals: 0,
    upsideDeals: 0,
    burcMatched: 0,
    burcExact: 0,
    burcFuzzy: 0,
    totalAcv: 0,
    totalWeightedAcv: 0,
    totalTcv: 0,
  }

  for (const opp of opportunities) {
    // By quarter
    stats.byQuarter[opp.fiscal_period] = (stats.byQuarter[opp.fiscal_period] || 0) + 1

    // By CSE
    const cse = opp.cse_name || 'Unassigned'
    stats.byCse[cse] = (stats.byCse[cse] || 0) + 1

    // By CAM
    const cam = opp.cam_name || 'Unassigned'
    stats.byCam[cam] = (stats.byCam[cam] || 0) + 1

    // By category
    const cat = opp.forecast_category || 'Unknown'
    stats.byCategory[cat] = (stats.byCategory[cat] || 0) + 1

    // In/Out target
    if (opp.in_or_out === 'In') stats.inTarget++
    else stats.outTarget++

    // Flags
    if (opp.is_under_75k) stats.under75k++
    if (opp.is_focus_deal) stats.focusDeals++
    if (opp.is_upside) stats.upsideDeals++

    // BURC matches
    if (opp.burc_matched) {
      stats.burcMatched++
      if (opp.burc_match_confidence === 'exact') stats.burcExact++
      if (opp.burc_match_confidence === 'fuzzy') stats.burcFuzzy++
    }

    // Financials
    stats.totalAcv += opp.total_acv
    stats.totalWeightedAcv += opp.weighted_acv
    stats.totalTcv += opp.tcv
  }

  // Print stats
  console.log('📊 Summary Statistics')
  console.log('-'.repeat(40))
  console.log(`Total Opportunities: ${stats.total}`)
  console.log('')
  console.log('By Quarter:')
  for (const [q, count] of Object.entries(stats.byQuarter).sort()) {
    console.log(`  ${q}: ${count}`)
  }
  console.log('')
  console.log('By CSE:')
  for (const [cse, count] of Object.entries(stats.byCse).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cse}: ${count}`)
  }
  console.log('')
  console.log('By Forecast Category:')
  for (const [cat, count] of Object.entries(stats.byCategory).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: ${count}`)
  }
  console.log('')
  console.log('Target Status:')
  console.log(`  In Target: ${stats.inTarget}`)
  console.log(`  Out of Target: ${stats.outTarget}`)
  console.log('')
  console.log('Classifications:')
  console.log(`  Rats & Mice (<75K): ${stats.under75k}`)
  console.log(`  Focus Deals: ${stats.focusDeals}`)
  console.log(`  Upside Deals: ${stats.upsideDeals}`)
  console.log('')
  console.log('🔗 BURC Cross-Reference:')
  console.log(`  Total Matched: ${stats.burcMatched} (${((stats.burcMatched / stats.total) * 100).toFixed(1)}%)`)
  console.log(`    Exact Matches: ${stats.burcExact}`)
  console.log(`    Fuzzy Matches: ${stats.burcFuzzy}`)
  console.log(`  Unmatched: ${stats.total - stats.burcMatched}`)
  console.log('')
  console.log('💰 Financials:')
  console.log(`  Total ACV: $${(stats.totalAcv / 1000000).toFixed(2)}M`)
  console.log(`  Weighted ACV: $${(stats.totalWeightedAcv / 1000000).toFixed(2)}M`)
  console.log(`  Total TCV: $${(stats.totalTcv / 1000000).toFixed(2)}M`)
  console.log('')

  if (VERBOSE) {
    console.log('📋 Detailed BURC Matches:')
    console.log('-'.repeat(60))
    for (const opp of opportunities.filter((o) => o.burc_matched)) {
      console.log(`  ✅ ${opp.opportunity_name.substring(0, 40)}...`)
      console.log(`     ${opp.burc_match_confidence} match → ${opp.burc_pipeline_id}`)
    }
    console.log('')

    console.log('❌ Unmatched (Sales Budget only):')
    console.log('-'.repeat(60))
    for (const opp of opportunities.filter((o) => !o.burc_matched).slice(0, 20)) {
      console.log(`  • ${opp.opportunity_name.substring(0, 50)}`)
      console.log(`    ${opp.account_name} | ${opp.cse_name} | $${opp.total_acv.toLocaleString()}`)
    }
    if (opportunities.filter((o) => !o.burc_matched).length > 20) {
      console.log(`  ... and ${opportunities.filter((o) => !o.burc_matched).length - 20} more`)
    }
    console.log('')
  }

  if (DRY_RUN) {
    console.log('🔍 DRY RUN - No database changes made')
    console.log('   Run without --dry-run to sync to database')
    return
  }

  // Sync to database
  console.log('🗄️  Syncing to database...')

  // Delete existing Sales Budget records
  console.log('   Deleting existing Sales Budget records...')
  const { error: deleteError } = await supabase
    .from('sales_pipeline_opportunities')
    .delete()
    .eq('source_sheet', SHEET_NAME)

  if (deleteError) {
    console.error('   Delete error:', deleteError.message)
  } else {
    console.log('   ✅ Existing records deleted')
  }

  // Insert in batches
  const BATCH_SIZE = 50
  let inserted = 0

  for (let i = 0; i < opportunities.length; i += BATCH_SIZE) {
    const batch = opportunities.slice(i, i + BATCH_SIZE)

    const { error: insertError } = await supabase.from('sales_pipeline_opportunities').insert(batch)

    if (insertError) {
      console.error(`   Batch ${Math.floor(i / BATCH_SIZE) + 1} error:`, insertError.message)
      if (VERBOSE) {
        console.log('   Sample record:', JSON.stringify(batch[0], null, 2))
      }
    } else {
      inserted += batch.length
    }
  }

  console.log(`   ✅ Inserted ${inserted}/${opportunities.length} opportunities`)
  console.log('')

  // Verify
  console.log('✅ Sync complete!')
  console.log('')

  const { data: verifyData, count } = await supabase
    .from('sales_pipeline_opportunities')
    .select('id', { count: 'exact' })

  console.log(`Database now has ${count} Sales Budget pipeline opportunities`)
}

main().catch(console.error)
