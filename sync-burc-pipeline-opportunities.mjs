/**
 * Sync BURC Pipeline Opportunities from 2026 APAC Performance.xlsx
 *
 * This script imports pipeline opportunities from the BURC Excel file
 * into the pipeline_opportunities table with cross-reference logic.
 *
 * Source Sheets:
 *   - "Rats and Mice Only" - Small deals <$50k
 *   - "Dial 2 Risk Profile Summary" - Larger deals >=50k with probability sections
 *
 * Cross-Reference Logic:
 *   1. Extract client name from opportunity name prefix (e.g., "AWH" → "Albury Wodonga Health")
 *   2. Match client names to nps_clients.client_name
 *   3. Map CSE names from database client records
 *   4. Set burc_match = true if client found in database
 *
 * Usage:
 *   node scripts/sync-burc-pipeline-opportunities.mjs --dry-run    # Preview only
 *   node scripts/sync-burc-pipeline-opportunities.mjs              # Live sync
 *   node scripts/sync-burc-pipeline-opportunities.mjs --verbose    # Detailed output
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import XLSX from 'xlsx'
import path from 'path'
import fs from 'fs'
import { burcFile, requireOneDrive } from './lib/onedrive-paths.mjs'

requireOneDrive()

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const DRY_RUN = process.argv.includes('--dry-run')
const VERBOSE = process.argv.includes('--verbose')

// ============================================================================
// Configuration
// ============================================================================

// BURC Master File Path
const BURC_MASTER_FILE = burcFile(2026, '2026 APAC Performance.xlsx')

// CSE Territory Mapping (mirrors PlanningPortfolioContext.tsx)
const CSE_TERRITORY_MAP = {
  'Tracey Bland': { territory: 'VIC + NZ', region: 'Australia+NZ', cam: 'Anu Pradhan' },
  'John Salisbury': { territory: 'WA + VIC', region: 'Australia+NZ', cam: 'Anu Pradhan' },
  'Laura Messing': { territory: 'SA', region: 'Australia+NZ', cam: 'Anu Pradhan' },
  'Open Role': { territory: 'Asia + Guam', region: 'Asia+Guam', cam: 'Nikki Wei' },
}

// Client name prefix mapping: Acronym/Prefix → Database canonical name
// These map the prefix in opportunity names to database client names
const CLIENT_PREFIX_MAP = {
  'AWH': 'Albury Wodonga Health',
  'MAH': 'Mount Alvernia Hospital',
  'SA Health': 'SA Health (iPro)',
  'SAH': 'SA Health (iPro)',
  'SLMC': "Saint Luke's Medical Centre (SLMC)",
  'WA Health': 'WA Health',
  'WAH': 'WA Health',
  'SingHealth': 'SingHealth',
  'Sing': 'SingHealth',  // Short form
  'NCS': 'NCS/MinDef Singapore',
  'Mindef': 'NCS/MinDef Singapore',  // Singapore Ministry of Defence
  'MinDef': 'NCS/MinDef Singapore',
  'Parkway': 'Parkway Hospitals Singapore PTE LTD',
  'GHA': 'Gippsland Health Alliance (GHA)',
  'Gippsland': 'Gippsland Health Alliance (GHA)',
  'GRMC': 'Guam Regional Medical City (GRMC)',
  'Guam': 'Guam Regional Medical City (GRMC)',
  'Epworth': 'Epworth Healthcare',
  'EPH': 'Epworth Healthcare',  // Short form
  'Grampians': 'Grampians Health',
  'Barwon': 'Barwon Health Australia',
  'BWH': 'Barwon Health Australia',  // Short form
  'Western Health': 'Western Health',
  'RVEEH': 'Royal Victorian Eye and Ear Hospital',
  'Eye and Ear': 'Royal Victorian Eye and Ear Hospital',
  'Waikato': 'Te Whatu Ora Waikato',
  'Te Whatu': 'Te Whatu Ora Waikato',
  'DoH': 'Department of Health - Victoria',
  'Department of Health': 'Department of Health - Victoria',
  // Non-client entries (skip these)
  // 'APAC' - Internal/regional entries
  // 'FHIR' - Product/technical entries
  // 'CDV2' - Product entries
}

// Probability by forecast category
const FORECAST_CATEGORY_PROBABILITY = {
  'Best Case': 90,
  'Backlog': 100,  // Already committed
  'Pipeline': 30,
  'Closed/Won': 100,
  'Won': 100,
  'Commit': 90,
  'Upside': 50,
  'DEFAULT': 50,
}

// Section markers for Dial 2 Risk Profile
const SECTION_MARKERS = {
  'Green': 90,
  'Yellow': 50,
  'Red': 20,
  'Pipeline': 30,
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Convert Excel date serial to JS Date
 */
function excelDateToJSDate(excelDate) {
  if (!excelDate) return null
  if (typeof excelDate === 'string') {
    const parsed = new Date(excelDate)
    return isNaN(parsed.getTime()) ? null : parsed
  }
  if (typeof excelDate !== 'number') return null
  // Excel dates are days since 1899-12-30
  const date = new Date((excelDate - 25569) * 86400 * 1000)
  return isNaN(date.getTime()) ? null : date
}

/**
 * Format date as YYYY-MM-DD for database
 */
function formatDate(date) {
  if (!date) return null
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return null
  return d.toISOString().split('T')[0]
}

/**
 * Parse currency value (handles millions notation, commas, etc.)
 */
function parseCurrency(value) {
  if (value === null || value === undefined) return 0
  if (typeof value === 'number') return value
  const cleaned = String(value)
    .replace(/[$,]/g, '')
    .replace(/\(([^)]+)\)/, '-$1')
    .trim()
  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : num
}

/**
 * Get quarter from date
 */
function getQuarter(date) {
  if (!date) return 'Q1 2026'
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return 'Q1 2026'
  const month = d.getMonth()
  const year = d.getFullYear()
  if (month < 3) return `Q1 ${year}`
  if (month < 6) return `Q2 ${year}`
  if (month < 9) return `Q3 ${year}`
  return `Q4 ${year}`
}

/**
 * Extract client name from opportunity name
 * e.g., "AWH Clinical Alerts Manager" → "Albury Wodonga Health"
 */
function extractClientFromOpportunity(oppName, clientLookup) {
  if (!oppName) return { clientName: null, burcMatch: false }

  const normalised = String(oppName).trim()

  // First, check prefix map for known acronyms
  for (const [prefix, clientName] of Object.entries(CLIENT_PREFIX_MAP)) {
    if (normalised.toLowerCase().startsWith(prefix.toLowerCase())) {
      // Verify client exists in database
      const normClient = clientName.toLowerCase().replace(/\s+/g, ' ')
      const dbClient = clientLookup.get(normClient)
      if (dbClient) {
        return { clientName: dbClient.client_name, burcMatch: true, dbClient }
      }
      return { clientName, burcMatch: false }
    }
  }

  // Try to match against all database clients (fuzzy)
  for (const [normName, client] of clientLookup.entries()) {
    if (normalised.toLowerCase().includes(normName.split(' ')[0])) {
      return { clientName: client.client_name, burcMatch: true, dbClient: client }
    }
  }

  // Extract first word as client hint
  const firstWord = normalised.split(/[\s\-_]/)[0]
  return { clientName: firstWord, burcMatch: false }
}

// ============================================================================
// Sheet Parsing Functions
// ============================================================================

/**
 * Parse Rats and Mice sheet
 * Structure: Row 3 is header, data starts row 4
 */
function parseRatsAndMiceSheet(sheet, clientLookup) {
  const opportunities = []
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null })

  // Column indices based on observed structure
  // Row 3: ["Rats and Mice", "F/Cast Category", "Closure Date", "Oracle Agreement #", ...]
  const COL = {
    OPPORTUNITY: 0,     // "Rats and Mice" column = opportunity name
    FORECAST_CAT: 1,    // F/Cast Category
    CLOSE_DATE: 2,      // Closure Date
    ORACLE_AGR: 3,      // Oracle Agreement #
    SW_REV: 8,          // SW Rev
    PS_REV: 9,          // PS Rev
    MAINT_REV: 10,      // Maint
    HW_REV: 11,         // HW
    BOOKINGS_ACV: 17,   // Bookings ACV (in millions)
  }

  // Start from row 4 (index 4, after header at row 3)
  for (let i = 4; i < data.length; i++) {
    const row = data[i]
    if (!row || !row[COL.OPPORTUNITY]) continue

    const oppName = String(row[COL.OPPORTUNITY]).trim()

    // Skip header-like rows and totals
    if (oppName.toLowerCase().includes('total') ||
        oppName.toLowerCase() === 'rats and mice' ||
        oppName.toLowerCase().includes('anything')) {
      continue
    }

    // Extract client from opportunity name
    const { clientName, burcMatch, dbClient } = extractClientFromOpportunity(oppName, clientLookup)
    if (!clientName) continue

    // Parse financials - Bookings ACV is in millions
    const bookingsACV = parseCurrency(row[COL.BOOKINGS_ACV])
    const acv = bookingsACV > 0 ? bookingsACV * 1000000 : 0  // Convert from millions

    // If no bookings ACV, try to sum revenue columns
    let totalRev = acv
    if (totalRev === 0) {
      totalRev = parseCurrency(row[COL.SW_REV]) +
                 parseCurrency(row[COL.PS_REV]) +
                 parseCurrency(row[COL.MAINT_REV]) +
                 parseCurrency(row[COL.HW_REV])
    }

    // Skip zero-value opportunities
    if (totalRev === 0) continue

    const closeDate = excelDateToJSDate(row[COL.CLOSE_DATE])
    const forecastCat = String(row[COL.FORECAST_CAT] || 'Pipeline').trim()
    const probability = FORECAST_CATEGORY_PROBABILITY[forecastCat] || FORECAST_CATEGORY_PROBABILITY.DEFAULT

    opportunities.push({
      opportunity_name: oppName,
      client_name: clientName,
      assigned_cse: dbClient?.cse || null,
      assigned_cam: dbClient?.cam || null,
      in_target: false,
      focus_deal: false,
      rats_and_mice: true,
      close_date: formatDate(closeDate),
      probability: probability,
      acv: totalRev,
      acv_net_cogs: totalRev * 0.8,
      tcv: totalRev,
      burc_match: burcMatch,
      burc_source_sheet: 'Rats and Mice Only',
      oracle_agreement_number: row[COL.ORACLE_AGR] ? String(row[COL.ORACLE_AGR]) : null,
      stage: forecastCat === 'Backlog' ? 'Negotiation' : 'Prospect',
      booking_forecast: forecastCat,
      fiscal_year: closeDate ? closeDate.getFullYear() : 2026,
      quarter: getQuarter(closeDate),
    })
  }

  return opportunities
}

/**
 * Parse Dial 2 Risk Profile Summary sheet
 * Structure: Row 3 is header, sections marked by "Green:", "Yellow:", etc.
 */
function parseDial2Sheet(sheet, clientLookup) {
  const opportunities = []
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null })

  // Column indices (same structure as Rats and Mice)
  const COL = {
    OPPORTUNITY: 0,
    FORECAST_CAT: 1,
    CLOSE_DATE: 2,
    ORACLE_AGR: 3,
    SW_REV: 8,
    PS_REV: 9,
    MAINT_REV: 10,
    HW_REV: 11,
    BOOKINGS_ACV: 17,
  }

  let currentSection = 'Pipeline'

  // Start from row 4
  for (let i = 4; i < data.length; i++) {
    const row = data[i]
    if (!row) continue

    const firstCell = row[COL.OPPORTUNITY]
    if (!firstCell) continue

    const cellValue = String(firstCell).trim()

    // Check for section markers
    for (const [marker, prob] of Object.entries(SECTION_MARKERS)) {
      if (cellValue.toLowerCase().startsWith(marker.toLowerCase() + ':') ||
          cellValue.toLowerCase() === marker.toLowerCase()) {
        currentSection = marker
        continue
      }
    }

    // Skip header-like rows, totals, and section markers
    if (cellValue.toLowerCase().includes('total') ||
        cellValue.toLowerCase().includes('anything') ||
        cellValue.toLowerCase() === 'green:' ||
        cellValue.toLowerCase() === 'yellow:' ||
        cellValue.toLowerCase() === 'red:' ||
        cellValue.toLowerCase() === 'pipeline:' ||
        cellValue.toLowerCase().includes('collated from')) {
      continue
    }

    // This is an opportunity row
    const oppName = cellValue

    // Extract client from opportunity name
    const { clientName, burcMatch, dbClient } = extractClientFromOpportunity(oppName, clientLookup)
    if (!clientName) continue

    // Parse financials
    const bookingsACV = parseCurrency(row[COL.BOOKINGS_ACV])
    const acv = bookingsACV > 0 ? bookingsACV * 1000000 : 0

    let totalRev = acv
    if (totalRev === 0) {
      totalRev = parseCurrency(row[COL.SW_REV]) +
                 parseCurrency(row[COL.PS_REV]) +
                 parseCurrency(row[COL.MAINT_REV]) +
                 parseCurrency(row[COL.HW_REV])
    }

    // Skip zero-value opportunities
    if (totalRev === 0) continue

    const closeDate = excelDateToJSDate(row[COL.CLOSE_DATE])
    const forecastCat = String(row[COL.FORECAST_CAT] || 'Pipeline').trim()

    // Determine probability: section marker takes precedence
    let probability = SECTION_MARKERS[currentSection] ||
                      FORECAST_CATEGORY_PROBABILITY[forecastCat] ||
                      FORECAST_CATEGORY_PROBABILITY.DEFAULT

    // Determine stage based on forecast category and section
    let stage = 'Prospect'
    if (forecastCat === 'Backlog' || forecastCat === 'Closed/Won') stage = 'Closed Won'
    else if (currentSection === 'Green' || forecastCat === 'Best Case') stage = 'Negotiation'
    else if (currentSection === 'Yellow') stage = 'Proposal'
    else if (currentSection === 'Red') stage = 'Qualified'

    // Focus deal / in target detection
    const isInTarget = currentSection === 'Green' || forecastCat === 'Best Case' || forecastCat === 'Commit'
    const isFocusDeal = totalRev >= 500000 && (currentSection === 'Green' || currentSection === 'Yellow')

    opportunities.push({
      opportunity_name: oppName,
      client_name: clientName,
      assigned_cse: dbClient?.cse || null,
      assigned_cam: dbClient?.cam || null,
      in_target: isInTarget,
      focus_deal: isFocusDeal,
      rats_and_mice: false,
      close_date: formatDate(closeDate),
      probability: probability,
      acv: totalRev,
      acv_net_cogs: totalRev * 0.8,
      tcv: totalRev,
      burc_match: burcMatch,
      burc_source_sheet: 'Dial 2 Risk Profile Summary',
      oracle_agreement_number: row[COL.ORACLE_AGR] ? String(row[COL.ORACLE_AGR]) : null,
      stage: stage,
      booking_forecast: forecastCat,
      fiscal_year: closeDate ? closeDate.getFullYear() : 2026,
      quarter: getQuarter(closeDate),
    })
  }

  return opportunities
}

// ============================================================================
// Main Sync Function
// ============================================================================

async function syncBURCPipelineOpportunities() {
  console.log('='.repeat(80))
  console.log('BURC Pipeline Opportunities Sync')
  console.log('='.repeat(80))
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE'}`)
  console.log(`Verbose: ${VERBOSE ? 'ON' : 'OFF'}`)
  console.log('')

  // Check file exists
  if (!fs.existsSync(BURC_MASTER_FILE)) {
    console.error(`ERROR: BURC file not found: ${BURC_MASTER_FILE}`)
    console.error('Please ensure OneDrive is synced and the file exists.')
    process.exit(1)
  }

  console.log(`Reading: ${BURC_MASTER_FILE}`)
  const workbook = XLSX.readFile(BURC_MASTER_FILE)
  console.log(`Available sheets: ${workbook.SheetNames.join(', ')}`)
  console.log('')

  // Fetch existing clients from database for cross-reference
  console.log('Fetching existing clients from database...')
  const { data: dbClients, error: clientsError } = await supabase
    .from('nps_clients')
    .select('client_name, cse, cam')

  if (clientsError) {
    console.error('Error fetching clients:', clientsError)
    process.exit(1)
  }

  // Build client lookup map (normalised name → client record)
  const clientLookup = new Map()
  for (const client of dbClients) {
    const normalised = client.client_name.toLowerCase().replace(/\s+/g, ' ')
    clientLookup.set(normalised, client)
  }
  console.log(`Loaded ${dbClients.length} clients from database`)
  console.log('')

  // Parse opportunities from both sheets
  const allOpportunities = []
  const unmatchedClients = new Map()

  // Parse Rats and Mice sheet
  const ratsSheet = workbook.Sheets['Rats and Mice Only']
  if (ratsSheet) {
    console.log('--- Parsing "Rats and Mice Only" sheet ---')
    const ratsOpps = parseRatsAndMiceSheet(ratsSheet, clientLookup)
    console.log(`Parsed ${ratsOpps.length} opportunities`)

    for (const opp of ratsOpps) {
      if (!opp.burc_match) {
        unmatchedClients.set(opp.client_name, (unmatchedClients.get(opp.client_name) || 0) + 1)
      }
      if (VERBOSE) {
        console.log(`  + ${opp.opportunity_name.substring(0, 40).padEnd(40)} | ${opp.client_name.substring(0, 20).padEnd(20)} | $${(opp.acv/1000).toFixed(0)}k | ${opp.burc_match ? '✓' : '✗'}`)
      }
    }
    allOpportunities.push(...ratsOpps)
  } else {
    console.log('WARNING: "Rats and Mice Only" sheet not found')
  }

  // Parse Dial 2 sheet
  const dial2Sheet = workbook.Sheets['Dial 2 Risk Profile Summary']
  if (dial2Sheet) {
    console.log('')
    console.log('--- Parsing "Dial 2 Risk Profile Summary" sheet ---')
    const dial2Opps = parseDial2Sheet(dial2Sheet, clientLookup)
    console.log(`Parsed ${dial2Opps.length} opportunities`)

    for (const opp of dial2Opps) {
      if (!opp.burc_match) {
        unmatchedClients.set(opp.client_name, (unmatchedClients.get(opp.client_name) || 0) + 1)
      }
      if (VERBOSE) {
        const flags = `${opp.in_target ? 'T' : '-'}${opp.focus_deal ? 'F' : '-'}`
        console.log(`  + ${opp.opportunity_name.substring(0, 40).padEnd(40)} | ${opp.client_name.substring(0, 20).padEnd(20)} | $${(opp.acv/1000).toFixed(0)}k | ${opp.probability}% | ${flags} | ${opp.burc_match ? '✓' : '✗'}`)
      }
    }
    allOpportunities.push(...dial2Opps)
  } else {
    console.log('WARNING: "Dial 2 Risk Profile Summary" sheet not found')
  }

  // ============================================================================
  // Summary Report
  // ============================================================================
  console.log('')
  console.log('='.repeat(80))
  console.log('SUMMARY')
  console.log('='.repeat(80))
  console.log(`Total opportunities parsed: ${allOpportunities.length}`)

  const matched = allOpportunities.filter(o => o.burc_match).length
  const unmatched = allOpportunities.filter(o => !o.burc_match).length
  const matchRate = allOpportunities.length > 0 ? (matched/allOpportunities.length)*100 : 0
  console.log(`  - Matched to database: ${matched} (${matchRate.toFixed(1)}%)`)
  console.log(`  - Unmatched: ${unmatched}`)

  const ratsCount = allOpportunities.filter(o => o.rats_and_mice).length
  const dial2Count = allOpportunities.filter(o => !o.rats_and_mice).length
  console.log('')
  console.log('By Source Sheet:')
  console.log(`  - Rats and Mice Only: ${ratsCount}`)
  console.log(`  - Dial 2 Risk Profile: ${dial2Count}`)

  const focusDeals = allOpportunities.filter(o => o.focus_deal).length
  const inTargetDeals = allOpportunities.filter(o => o.in_target).length
  console.log('')
  console.log('Classification:')
  console.log(`  - Focus Deals: ${focusDeals}`)
  console.log(`  - In Target: ${inTargetDeals}`)

  // Probability distribution
  const probDist = {}
  for (const opp of allOpportunities) {
    probDist[opp.probability] = (probDist[opp.probability] || 0) + 1
  }
  console.log('')
  console.log('By Probability:')
  for (const [prob, count] of Object.entries(probDist).sort((a, b) => Number(b[0]) - Number(a[0]))) {
    console.log(`  - ${prob}%: ${count}`)
  }

  // Financials
  const totalACV = allOpportunities.reduce((sum, o) => sum + (o.acv || 0), 0)
  const totalWeightedACV = allOpportunities.reduce((sum, o) => sum + ((o.acv || 0) * (o.probability || 0) / 100), 0)
  console.log('')
  console.log('Financials:')
  console.log(`  - Total ACV: $${(totalACV / 1e6).toFixed(2)}M`)
  console.log(`  - Total Weighted ACV: $${(totalWeightedACV / 1e6).toFixed(2)}M`)

  // Unmatched clients
  if (unmatchedClients.size > 0) {
    console.log('')
    console.log('⚠️  Unmatched Clients (need CLIENT_PREFIX_MAP entry):')
    const sortedUnmatched = [...unmatchedClients.entries()].sort((a, b) => b[1] - a[1])
    for (const [client, count] of sortedUnmatched) {
      console.log(`  - ${client} (${count} opportunities)`)
    }
  }

  // By CSE
  const byCSE = {}
  for (const opp of allOpportunities.filter(o => o.burc_match)) {
    const cse = opp.assigned_cse || 'Unassigned'
    if (!byCSE[cse]) byCSE[cse] = { count: 0, acv: 0 }
    byCSE[cse].count++
    byCSE[cse].acv += opp.acv
  }
  console.log('')
  console.log('By CSE (matched opportunities only):')
  for (const [cse, data] of Object.entries(byCSE).sort((a, b) => b[1].acv - a[1].acv)) {
    console.log(`  - ${cse}: ${data.count} opportunities, $${(data.acv / 1e6).toFixed(2)}M`)
  }

  // ============================================================================
  // Database Upsert
  // ============================================================================
  if (DRY_RUN) {
    console.log('')
    console.log('='.repeat(80))
    console.log('[DRY RUN] Would delete existing BURC opportunities')
    console.log(`[DRY RUN] Would insert ${allOpportunities.length} opportunities`)
    console.log('')
    console.log('Run without --dry-run to apply changes.')
    return
  }

  console.log('')
  console.log('='.repeat(80))
  console.log('SYNCING TO DATABASE')
  console.log('='.repeat(80))

  // Delete existing BURC opportunities (ones we've previously imported)
  console.log('Deleting existing BURC-imported opportunities...')
  const { error: deleteError } = await supabase
    .from('pipeline_opportunities')
    .delete()
    .not('burc_source_sheet', 'is', null)

  if (deleteError) {
    console.error('Delete error:', deleteError)
    process.exit(1)
  }

  // Insert in batches
  console.log(`Inserting ${allOpportunities.length} opportunities...`)
  const BATCH_SIZE = 100
  let inserted = 0
  let errors = 0

  for (let i = 0; i < allOpportunities.length; i += BATCH_SIZE) {
    const batch = allOpportunities.slice(i, i + BATCH_SIZE)

    const { error: insertError } = await supabase
      .from('pipeline_opportunities')
      .insert(batch)

    if (insertError) {
      console.error(`\nInsert error at batch ${Math.floor(i / BATCH_SIZE)}:`, insertError)
      errors += batch.length
    } else {
      inserted += batch.length
    }
    process.stdout.write(`\rInserted ${inserted}/${allOpportunities.length} records`)
  }

  console.log('')
  console.log('')
  console.log('='.repeat(80))
  console.log('SYNC COMPLETE')
  console.log('='.repeat(80))
  console.log(`Successfully inserted: ${inserted}`)
  console.log(`Errors: ${errors}`)
  console.log(`Match rate: ${matchRate.toFixed(1)}%`)
}

// Run the sync
syncBURCPipelineOpportunities().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
