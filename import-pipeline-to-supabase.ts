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

    // Parse DIAL 2 sheet for backlog categories
    const dial2Sheet = workbook.Sheets['DIAL 2']
    if (dial2Sheet) {
      const dial2Data = XLSX.utils.sheet_to_json(dial2Sheet, { header: 1 }) as unknown[][]

      // Find sections in DIAL 2
      const sections = [
        { name: 'dial2-green', startText: 'GREEN', endText: 'YELLOW' },
        { name: 'dial2-yellow', startText: 'YELLOW', endText: 'RED' },
        { name: 'dial2-red', startText: 'RED', endText: 'Business Case' },
        { name: 'dial2-business-case', startText: 'Business Case', endText: 'Pipeline' },
        { name: 'dial2-pipeline-not-included', startText: 'Pipeline (not', endText: null },
      ]

      let currentSection: string | null = null
      let inDataRows = false

      for (let i = 0; i < dial2Data.length; i++) {
        const row = dial2Data[i]
        if (!row || row.length === 0) continue

        const firstCell = String(row[0] || '').trim()

        // Check if we're entering a new section
        for (const section of sections) {
          if (firstCell.toLowerCase().includes(section.startText.toLowerCase())) {
            currentSection = section.name
            inDataRows = false
            break
          }
        }

        // Check for header row (contains "Forecast Category" or similar)
        if (
          currentSection &&
          (firstCell.toLowerCase().includes('forecast') ||
            String(row[1] || '')
              .toLowerCase()
              .includes('opty name'))
        ) {
          inDataRows = true
          continue
        }

        // Parse data rows
        if (currentSection && inDataRows && row[1]) {
          const optyName = String(row[1] || '').trim()
          const oracleNumber = String(row[3] || '').trim()
          const accountName = String(row[4] || '').trim()
          const acv = parseFloat(String(row[5] || '0')) || 0

          if (optyName && optyName !== '' && !optyName.toLowerCase().includes('total')) {
            const entry: BURCEntry = {
              name: optyName,
              forecastCategory: String(row[0] || '').trim(),
              oracleNumber,
              accountName,
              acv,
              section: currentSection,
            }

            indexes.byName.set(optyName.toLowerCase(), entry)
            if (oracleNumber) {
              indexes.byOracleNumber.set(oracleNumber, entry)
            }
          }
        }
      }
    }

    // Parse Best Case sheet
    const bestCaseSheet = workbook.Sheets['Best Case']
    if (bestCaseSheet) {
      const bestCaseData = XLSX.utils.sheet_to_json(bestCaseSheet, { header: 1 }) as unknown[][]

      let headerFound = false
      for (let i = 0; i < bestCaseData.length; i++) {
        const row = bestCaseData[i]
        if (!row || row.length === 0) continue

        const firstCell = String(row[0] || '').trim().toLowerCase()

        if (firstCell.includes('forecast') || firstCell.includes('opty')) {
          headerFound = true
          continue
        }

        if (headerFound && row[1]) {
          const optyName = String(row[1] || '').trim()
          const oracleNumber = String(row[3] || '').trim()
          const accountName = String(row[4] || '').trim()
          const acv = parseFloat(String(row[5] || '0')) || 0

          if (optyName && optyName !== '' && !optyName.toLowerCase().includes('total')) {
            const entry: BURCEntry = {
              name: optyName,
              forecastCategory: String(row[0] || '').trim(),
              oracleNumber,
              accountName,
              acv,
              section: 'best-case',
            }

            indexes.byName.set(optyName.toLowerCase(), entry)
            if (oracleNumber) {
              indexes.byOracleNumber.set(oracleNumber, entry)
            }
          }
        }
      }
    }

    console.log(
      `[Import] Loaded ${indexes.byName.size} BURC entries (${indexes.byOracleNumber.size} with Oracle numbers)`
    )
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
  // Try to find by Oracle number first
  if (oracleNumber) {
    const byOracle = burcIndexes.byOracleNumber.get(oracleNumber)
    if (byOracle) {
      const status = mapBURCSectionToStatus(byOracle.section)
      return { status, category: byOracle.section }
    }
  }

  // Try to find by opportunity name
  const byName = burcIndexes.byName.get(optyName.toLowerCase())
  if (byName) {
    const status = mapBURCSectionToStatus(byName.section)
    return { status, category: byName.section }
  }

  return { status: 'not-in-burc', category: null }
}

function mapBURCSectionToStatus(section: string): string {
  switch (section) {
    case 'best-case':
      return 'best-case'
    case 'dial2-green':
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

  const getColIndex = (name: string) => headers.indexOf(name)

  const opportunities: Record<string, unknown>[] = []
  let idCounter = 1

  for (let i = headerRow + 1; i < data.length; i++) {
    const row = data[i]
    if (!row) continue

    const accountName = String(row[getColIndex('Account Name')] || '').trim()
    if (!accountName) continue

    const opportunityName = String(row[getColIndex('Opty Name')] || '').trim()
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
