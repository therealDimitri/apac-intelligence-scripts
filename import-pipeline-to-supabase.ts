/**
 * Import Pipeline Data from Excel to Supabase
 *
 * This script reads the 2026 Sales Budget Excel file and imports the pipeline
 * opportunities into the Supabase pipeline_opportunities table.
 *
 * Usage: npx ts-node scripts/import-pipeline-to-supabase.ts
 */
import * as dotenv from 'dotenv'
import * as XLSX from 'xlsx'
import * as fs from 'fs'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const SALES_BUDGET_PATH =
  '/Users/jimmy.leimonitis/Desktop/APAC 2026 Sales Budget 14Jan2026 v0.1.xlsx'

const BURC_PATH =
  '/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth/APAC Leadership Team - General/Performance/Financials/BURC/2026/2026 APAC Performance.xlsx'

interface BURCEntry {
  name: string
  forecastCategory: string
  oracleNumber: string | number
  accountName: string
  acv: number
  section: string
}

interface BURCIndexes {
  byName: Map<string, BURCEntry>
  byOracleNumber: Map<string, BURCEntry>
}

// CSE name mapping - normalize variations to standard names
function mapCSEName(name: string | null | undefined): string {
  if (!name) return ''
  const nameLower = name.toLowerCase().trim()
  if (nameLower.includes('new asia') || nameLower === 'kenny gan') {
    return 'Open Role'
  }
  if (nameLower === 'johnathan salisbury') {
    return 'John Salisbury'
  }
  return name.trim()
}

function excelDateToString(excelDate: number | string | null): string | null {
  if (!excelDate) return null
  if (typeof excelDate === 'string') return excelDate
  const date = new Date((excelDate - 25569) * 86400 * 1000)
  return date.toISOString().split('T')[0]
}

function parseBURCFile(): BURCIndexes {
  const indexes: BURCIndexes = {
    byName: new Map(),
    byOracleNumber: new Map(),
  }

  if (!fs.existsSync(BURC_PATH)) {
    console.warn('[Import] BURC file not found, skipping BURC cross-reference')
    return indexes
  }

  try {
    const buffer = fs.readFileSync(BURC_PATH)
    const workbook = XLSX.read(buffer, { type: 'buffer' })

    // Helper to add entry to indexes
    const addEntry = (entry: BURCEntry) => {
      indexes.byName.set(entry.name.toLowerCase(), entry)
      if (entry.oracleNumber && entry.oracleNumber !== 'Various' && String(entry.oracleNumber).length > 1) {
        // Also index without trailing letters (e.g., "545891a" -> "545891")
        indexes.byOracleNumber.set(String(entry.oracleNumber).trim(), entry)
        const baseNumber = String(entry.oracleNumber).replace(/[a-zA-Z]+$/, '')
        if (baseNumber !== entry.oracleNumber) {
          indexes.byOracleNumber.set(baseNumber, entry)
        }
      }
    }

    // Parse "Dial 2 Risk Profile Summary" sheet
    const dialSheet = workbook.Sheets['Dial 2 Risk Profile Summary']
    if (dialSheet) {
      const data = XLSX.utils.sheet_to_json(dialSheet, { header: 1 }) as unknown[][]

      // Structure: Row 0-2 headers, Row 3+ has section markers and data
      // Column 0: Opty Name (or section marker like "Green:")
      // Column 1: F/Cast Category
      // Column 2: Closure Date
      // Column 3: Oracle Agreement #

      let currentSection = 'dial2-green' // Default to green

      for (let i = 3; i < data.length; i++) {
        const row = data[i]
        if (!row || row.length === 0) continue

        const firstCell = String(row[0] || '').trim()
        const firstCellLower = firstCell.toLowerCase()

        // Detect section markers
        if (firstCellLower === 'green:' || firstCellLower.startsWith('green:')) {
          currentSection = 'dial2-green'
          continue
        } else if (firstCellLower === 'yellow:' || firstCellLower.startsWith('yellow:')) {
          currentSection = 'dial2-yellow'
          continue
        } else if (firstCellLower === 'red:' || firstCellLower.startsWith('red:')) {
          currentSection = 'dial2-red'
          continue
        } else if (firstCellLower.includes('business case')) {
          currentSection = 'dial2-business-case'
          continue
        } else if (firstCellLower.includes('pipeline') && firstCellLower.includes('not included')) {
          currentSection = 'dial2-pipeline-not-included'
          continue
        }

        // Skip non-data rows
        if (!firstCell || firstCell.length < 3 ||
            firstCellLower.includes('total') ||
            firstCellLower.includes('sub-total') ||
            firstCellLower.includes('rats and mice - collated') ||
            firstCellLower.includes('anything') ||
            firstCellLower.includes('date the revenue')) {
          continue
        }

        const forecastCategory = String(row[1] || '').trim()
        const oracleNumber = String(row[3] || '').trim()

        // Only add if it has a forecast category (actual data row)
        if (forecastCategory) {
          addEntry({
            name: firstCell,
            forecastCategory,
            oracleNumber,
            accountName: '',
            acv: 0,
            section: currentSection,
          })
        }
      }
      console.log(`[Import] Loaded ${indexes.byName.size} entries from Dial 2 Risk Profile Summary`)
    }

    // Parse "Rats and Mice Only" sheet
    const ratsSheet = workbook.Sheets['Rats and Mice Only']
    if (ratsSheet) {
      const data = XLSX.utils.sheet_to_json(ratsSheet, { header: 1 }) as unknown[][]

      // Structure similar to Dial 2: Opty Name in col 0, Oracle # in col 3
      for (let i = 4; i < data.length; i++) { // Data starts from row 5 (index 4)
        const row = data[i]
        if (!row || row.length === 0) continue

        const optyName = String(row[0] || '').trim()
        const optyNameLower = optyName.toLowerCase()

        // Skip non-data rows
        if (!optyName || optyName.length < 3 ||
            optyNameLower.includes('total') ||
            optyNameLower.includes('rats and mice - balance')) {
          continue
        }

        const oracleNumber = String(row[3] || '').trim()

        // Only add if we have an opportunity name and it's not already in the index
        if (optyName && !indexes.byName.has(optyNameLower)) {
          addEntry({
            name: optyName,
            forecastCategory: 'Best Case', // R&M items are typically best case
            oracleNumber,
            accountName: '',
            acv: 0,
            section: 'rats-mice',
          })
        }
      }
      console.log(`[Import] Total entries after Rats and Mice: ${indexes.byName.size}`)
    }

    console.log(`[Import] Loaded ${indexes.byName.size} BURC entries (${indexes.byOracleNumber.size} with Oracle numbers)`)
  } catch (error) {
    console.error('[Import] Error parsing BURC file:', error)
  }

  return indexes
}

function determineBURCStatus(
  optyName: string,
  oracleNumber: string,
  burcIndexes: BURCIndexes
): { status: string; category: string | null } {
  // Try to find by Oracle number first (exact match)
  if (oracleNumber) {
    const byOracle = burcIndexes.byOracleNumber.get(oracleNumber)
    if (byOracle) {
      const status = mapBURCSectionToStatus(byOracle.section, byOracle.forecastCategory)
      return { status, category: byOracle.section }
    }

    // Try base number without trailing letters (e.g., "545891" matches "545891a")
    const baseNumber = oracleNumber.replace(/[a-zA-Z]+$/, '')
    if (baseNumber !== oracleNumber) {
      const byBase = burcIndexes.byOracleNumber.get(baseNumber)
      if (byBase) {
        const status = mapBURCSectionToStatus(byBase.section, byBase.forecastCategory)
        return { status, category: byBase.section }
      }
    }

    // Also try finding BURC entries that start with this Oracle number (for suffix matching)
    for (const [key, entry] of burcIndexes.byOracleNumber) {
      const keyBase = key.replace(/[a-zA-Z]+$/, '')
      if (keyBase === oracleNumber || keyBase === baseNumber) {
        const status = mapBURCSectionToStatus(entry.section, entry.forecastCategory)
        return { status, category: entry.section }
      }
    }
  }

  // Try to find by opportunity name (exact)
  const byName = burcIndexes.byName.get(optyName.toLowerCase())
  if (byName) {
    const status = mapBURCSectionToStatus(byName.section, byName.forecastCategory)
    return { status, category: byName.section }
  }

  // Try partial name matching
  const optyNameLower = optyName.toLowerCase()
  for (const [key, entry] of burcIndexes.byName) {
    if (optyNameLower.includes(key) || key.includes(optyNameLower)) {
      const status = mapBURCSectionToStatus(entry.section, entry.forecastCategory)
      return { status, category: entry.section }
    }
  }

  return { status: 'not-in-burc', category: null }
}

function mapBURCSectionToStatus(section: string, forecastCategory?: string): string {
  // Check forecast category for Best Case/Backlog determination
  const fcLower = (forecastCategory || '').toLowerCase()

  switch (section) {
    case 'best-case':
    case 'rats-mice':
      // Rats & Mice and Best Case items - check forecast category
      if (fcLower.includes('backlog')) return 'backlog-green'
      return 'best-case'
    case 'dial2-green':
      if (fcLower.includes('best case')) return 'best-case'
      return 'backlog-green'
    case 'dial2-yellow':
      return 'backlog-yellow'
    case 'dial2-red':
      return 'backlog-red'
    case 'dial2-business-case':
      return 'business-case'
    case 'dial2-pipeline-not-included':
      return 'pipeline-not-forecast'
    default:
      return 'not-in-burc'
  }
}

interface OracleQuoteDetail {
  forecastStatus: string
  stage: string
  totalACV: number
  acvWeighted: number
  itemDescription: string
  glProduct: string
  businessUnit: string
  quotingCategory: string
}

function parseOracleQuoteDetailSheet(workbook: XLSX.WorkBook): Map<string, OracleQuoteDetail> {
  const map = new Map<string, OracleQuoteDetail>()

  const sheet = workbook.Sheets['Oracle Quote Detail']
  if (!sheet) return map

  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][]

  // Find header row
  let headerRow = -1
  let headers: string[] = []

  for (let i = 0; i < Math.min(10, data.length); i++) {
    const row = data[i]
    if (row && row.some(cell => String(cell || '').toLowerCase().includes('quote number'))) {
      headerRow = i
      headers = row.map(cell => String(cell || '').trim())
      break
    }
  }

  if (headerRow === -1) return map

  const getColIndex = (name: string) =>
    headers.findIndex(h => h.toLowerCase().includes(name.toLowerCase()))

  const quoteNumCol = getColIndex('Quote Number')
  const forecastStatusCol = getColIndex('Forecast Status')
  const stageCol = getColIndex('Stage')
  const totalAcvCol = headers.findIndex(
    h => h.toLowerCase().includes('total acv') && !h.toLowerCase().includes('weighted')
  )
  const acvWeightedCol = getColIndex('ACV Weighted')
  const itemDescCol = getColIndex('Item Description')
  const glProductCol = getColIndex('GL Product')
  const businessUnitCol = getColIndex('Business Unit')
  const quotingCatCol = getColIndex('Quoting Category')

  for (let i = headerRow + 1; i < data.length; i++) {
    const row = data[i]
    if (!row) continue

    const quoteNum = String(row[quoteNumCol] || '').trim()
    if (!quoteNum) continue

    const detail: OracleQuoteDetail = {
      forecastStatus: String(row[forecastStatusCol] || '').trim(),
      stage: String(row[stageCol] || '').trim(),
      totalACV: parseFloat(String(row[totalAcvCol] || '0')) || 0,
      acvWeighted: parseFloat(String(row[acvWeightedCol] || '0')) || 0,
      itemDescription: String(row[itemDescCol] || '').trim(),
      glProduct: String(row[glProductCol] || '').trim(),
      businessUnit: String(row[businessUnitCol] || '').trim(),
      quotingCategory: String(row[quotingCatCol] || '').trim(),
    }

    // Only store if we have meaningful data
    if (detail.totalACV > 0 || detail.forecastStatus) {
      map.set(quoteNum, detail)
    }
  }

  console.log(`[Import] Loaded ${map.size} Oracle Quote Detail entries`)
  return map
}

async function importPipelineData() {
  console.log('Starting pipeline data import...\n')

  if (!fs.existsSync(SALES_BUDGET_PATH)) {
    throw new Error(`Sales budget file not found: ${SALES_BUDGET_PATH}`)
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

  // Load BURC entries for cross-reference
  const burcIndexes = parseBURCFile()

  // Read sales budget file
  const buffer = fs.readFileSync(SALES_BUDGET_PATH)
  const workbook = XLSX.read(buffer, { type: 'buffer' })

  // Parse Oracle Quote Detail sheet for enrichment
  const oracleQuoteDetailMap = parseOracleQuoteDetailSheet(workbook)

  const sheet = workbook.Sheets['APAC Pipeline by Qtr (RECON)']
  if (!sheet) {
    throw new Error('Sheet "APAC Pipeline by Qtr (RECON)" not found')
  }

  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][]

  // Find header row
  let headerRow = -1
  let headers: string[] = []

  for (let i = 0; i < Math.min(20, data.length); i++) {
    const row = data[i]
    if (row && row.includes('Account Name')) {
      headerRow = i
      headers = row.map(cell => String(cell || '').trim())
      break
    }
  }

  if (headerRow === -1) {
    throw new Error('Could not find header row with "Account Name"')
  }

  console.log(`Found header row at index ${headerRow}`)

  // Column names may have arrows (↑) or other suffixes - use partial matching
  const getColIndex = (name: string) => {
    const exactIndex = headers.indexOf(name)
    if (exactIndex !== -1) return exactIndex
    // Try partial match (column name starts with our search term)
    return headers.findIndex(h => h.startsWith(name) || h.includes(name))
  }

  const opportunities: Record<string, unknown>[] = []
  let idCounter = 1

  for (let i = headerRow + 1; i < data.length; i++) {
    const row = data[i]
    if (!row) continue

    const accountName = String(row[getColIndex('Account Name')] || '').trim()
    if (!accountName) continue

    const opportunityName = String(row[getColIndex('Opportunity Name')] || '').trim()
    const oracleQuoteNumber = String(row[getColIndex('Oracle Quote Number')] || '').trim()

    // Get BURC status
    const { status: burcStatus, category: burcCategory } = determineBURCStatus(
      opportunityName,
      oracleQuoteNumber,
      burcIndexes
    )

    // Get Oracle Quote Detail enrichment
    const oracleDetail = oracleQuoteDetailMap.get(oracleQuoteNumber)
    const oracleDetailTotalACV = oracleDetail?.totalACV || 0
    const oracleDetailACVWeighted = oracleDetail?.acvWeighted || 0
    const totalACV = parseFloat(String(row[getColIndex('Total ACV')] || '0')) || 0
    const weightedACV = parseFloat(String(row[getColIndex('Weighted ACV')] || '0')) || 0

    const closeDate = excelDateToString(row[getColIndex('Close Date')] as number | string | null)

    const opp = {
      id: `opp-2026-${String(idCounter++).padStart(4, '0')}`,
      fiscal_year: 2026,
      fiscal_period: String(row[getColIndex('Fiscal Period')] || '').trim(),
      forecast_category: String(row[getColIndex('Forecast Category')] || '').trim(),
      account_name: accountName,
      opportunity_name: opportunityName,
      opty_id: String(row[getColIndex('Opty ID')] || '').trim(),
      cse: mapCSEName(row[getColIndex('CSE')] as string),
      cam: String(row[getColIndex('CAM')] || '').trim(),
      in_or_out: String(row[getColIndex('In or Out')] || 'In').trim(),
      under_75k: String(row[getColIndex('< 75K')] || '').trim(),
      upside: String(row[getColIndex('Upside')] || '')
        .toLowerCase()
        .includes('yes'),
      focus_deal: String(row[getColIndex('Focus Deal')] || '')
        .toLowerCase()
        .includes('yes'),
      close_date: closeDate,
      oracle_quote_number: oracleQuoteNumber,
      total_acv: totalACV,
      oracle_quote_status: String(row[getColIndex('Oracle Quote Status')] || '').trim(),
      tcv: parseFloat(String(row[getColIndex('TCV')] || '0')) || 0,
      weighted_acv: weightedACV,
      acv_net_cogs: parseFloat(String(row[getColIndex('ACV Net COGS')] || '0')) || 0,
      bookings_forecast: String(row[getColIndex('Bookings Forecast')] || '').trim(),
      forecast_status: oracleDetail?.forecastStatus || '',
      stage: oracleDetail?.stage || '',
      oracle_quote_detail_total_acv: oracleDetailTotalACV,
      oracle_quote_detail_acv_weighted: oracleDetailACVWeighted,
      variance_acv: totalACV - oracleDetailTotalACV,
      variance_acv_weighted: weightedACV - oracleDetailACVWeighted,
      item_description: oracleDetail?.itemDescription || '',
      gl_product: oracleDetail?.glProduct || '',
      business_unit: oracleDetail?.businessUnit || '',
      quoting_category: oracleDetail?.quotingCategory || '',
      burc_status: burcStatus,
      burc_category: burcCategory,
    }

    opportunities.push(opp)
  }

  console.log(`\nParsed ${opportunities.length} opportunities`)

  // Clear existing data for fiscal year 2026
  console.log('\nClearing existing 2026 data...')
  const { error: deleteError } = await supabase
    .from('pipeline_opportunities')
    .delete()
    .eq('fiscal_year', 2026)

  if (deleteError) {
    console.error('Error deleting existing data:', deleteError)
  }

  // Insert in batches of 50
  console.log('Inserting opportunities...')
  const batchSize = 50
  let inserted = 0

  for (let i = 0; i < opportunities.length; i += batchSize) {
    const batch = opportunities.slice(i, i + batchSize)
    const { error: insertError } = await supabase.from('pipeline_opportunities').insert(batch)

    if (insertError) {
      console.error(`Error inserting batch ${i / batchSize + 1}:`, insertError)
    } else {
      inserted += batch.length
      console.log(`  Inserted ${inserted}/${opportunities.length}`)
    }
  }

  // Verify
  const { count } = await supabase
    .from('pipeline_opportunities')
    .select('*', { count: 'exact', head: true })
    .eq('fiscal_year', 2026)

  console.log(`\n✅ Import complete! ${count} opportunities in database`)

  // Show summary stats
  const { data: stats } = await supabase.from('pipeline_opportunities').select('total_acv, weighted_acv').eq('fiscal_year', 2026)

  if (stats) {
    const totalACV = stats.reduce((sum, r) => sum + (r.total_acv || 0), 0)
    const totalWeighted = stats.reduce((sum, r) => sum + (r.weighted_acv || 0), 0)
    console.log(`\nStats:`)
    console.log(`  Total ACV: $${totalACV.toLocaleString()}`)
    console.log(`  Total Weighted ACV: $${totalWeighted.toLocaleString()}`)
  }
}

importPipelineData().catch(console.error)
