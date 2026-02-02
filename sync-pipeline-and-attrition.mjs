#!/usr/bin/env node
/**
 * Sync Net Bookings and Attrition data from 2026 APAC Performance.xlsx
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * METHODOLOGY
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * DATA SOURCES:
 * - "Rats and Mice Only" sheet: Opportunities < $50K
 * - "Dial 2 Risk Profile Summary" sheet: Opportunities >= $50K
 * - "Attrition" sheet: Confirmed revenue at risk
 *
 * BOOKING VALUE HIERARCHY:
 * 1. Primary: "Total Net Booking" (column 24) - Net after COGS/margin deduction
 * 2. Fallback: "Bookings ACV" (column 17) - Annual Contract Value (if Net Booking is empty)
 * Note: Values in Excel are in $M (millions), converted to dollars by × 1,000,000
 *
 * PROBABILITY WEIGHTING (by section COLOUR in Dial 2 sheet):
 * - GREEN section:    90% probability (high likelihood to close)
 *                     Contains: Best Case AND Business Case items
 * - YELLOW section:   50% probability (mid-range likelihood)
 *                     Contains: Best Case AND Business Case items
 * - RED section:      20% probability (unlikely to close)
 *                     Contains: Best Case AND Business Case items
 * - PIPELINE section: 30% probability (not Best Case or Business Case)
 *
 * Note: Forecast category (Best Case/Business Case) is tracked separately
 *       from section colour. The colour determines probability, not the category.
 *
 * CALCULATIONS:
 * - Total Net Booking = Sum of all booking values
 * - Weighted Net Booking = Sum of (booking value × probability)
 * - Net Impact = Weighted Net Booking - Revenue at Risk
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js'
import XLSX from 'xlsx'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

const BURC_FILE = '/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth/APAC Leadership Team - General/Performance/Financials/BURC/2026/2026 APAC Performance.xlsx'

// Probability weights by section COLOUR (for Dial 2 items)
// Colours indicate probability, NOT forecast category
// Each colour section can contain Best Case AND Business Case items
const SECTION_PROBABILITY = {
  'GREEN': 0.9,      // High probability - contains Best Case & Business Case
  'YELLOW': 0.5,     // Mid-range - contains Best Case & Business Case
  'RED': 0.2,        // Unlikely - contains Best Case & Business Case
  'PIPELINE': 0.3    // Pure pipeline items (not Best Case or Business Case)
}

// Category-based probability for Rats & Mice items (no color sections)
const CATEGORY_PROBABILITY = {
  'best case': 0.9,
  'business case': 0.5,
  'pipeline': 0.3
}

// Excel serial date to ISO date
function excelDateToISO(serial) {
  if (!serial || typeof serial !== 'number') return null
  const date = new Date((serial - 25569) * 86400 * 1000)
  return date.toISOString().split('T')[0]
}

// Parse currency value
function parseCurrency(value) {
  if (value === null || value === undefined || value === '' || value === ' ') return 0
  if (typeof value === 'number') return value
  const cleaned = String(value).replace(/[$,\s]/g, '')
  return parseFloat(cleaned) || 0
}

async function syncPipelineData() {
  console.log('\n📊 Syncing Pipeline Data...')

  const workbook = XLSX.readFile(BURC_FILE)
  const pipelineRecords = []
  const seenKeys = new Set()

  // ===== RATS AND MICE (<50K items) =====
  console.log('   Processing Rats and Mice sheet...')
  const rmSheet = workbook.Sheets['Rats and Mice Only']
  const rmData = XLSX.utils.sheet_to_json(rmSheet, { header: 1 })

  for (let i = 4; i < rmData.length; i++) {
    const row = rmData[i]
    if (!row || !row[0] || row[0].includes('Total') || row[0].includes('Grand Total')) continue

    const name = String(row[0]).trim()
    const fcast = (row[1] || 'Pipeline').toString().toLowerCase()
    const closureDate = excelDateToISO(row[2])
    const oracleNum = row[3] || ''

    const key = `${name}|${oracleNum}`
    if (seenKeys.has(key)) continue
    seenKeys.add(key)

    // BOOKING VALUE HIERARCHY:
    // 1. Primary: Total Net Booking (column 24) - after COGS/margin
    // 2. Fallback: Bookings ACV (column 17) - if Net Booking is empty
    // Values are in $M, multiply by 1,000,000 to convert to dollars
    const netBookingRaw = parseCurrency(row[24])
    const bookingsAcvRaw = parseCurrency(row[17])

    let netBooking = netBookingRaw * 1000000
    let bookingSource = 'Net Booking'

    // Fallback to Bookings ACV if Net Booking is zero/empty
    if (netBooking === 0 && bookingsAcvRaw !== 0) {
      netBooking = bookingsAcvRaw * 1000000
      bookingSource = 'Bookings ACV'
    }

    // Skip if still zero after fallback
    if (netBooking === 0) continue

    const category = normaliseForecast(fcast)
    // Skip Lost/Closed deals
    if (category === 'EXCLUDE') continue

    const probability = CATEGORY_PROBABILITY[fcast] || 0.3

    // Also capture individual revenue components for breakdown (columns 8-11)
    const sw = parseCurrency(row[8])
    const ps = parseCurrency(row[9])
    const maint = parseCurrency(row[10])
    const hw = parseCurrency(row[11])

    // R&M items use category-based sections (no color in Excel)
    // Map category to section: backlog/best case -> green, business case -> yellow, pipeline -> pipeline
    const sectionColor = category === 'Backlog' ? 'green' :
                         category === 'Best Case' ? 'green' :
                         category === 'Business Case' ? 'yellow' : 'pipeline'
    const inForecast = ['green', 'yellow'].includes(sectionColor)

    pipelineRecords.push({
      deal_name: name,
      client_name: extractClientName(name),
      forecast_category: category,
      closure_date: closureDate,
      sw_revenue: sw,
      ps_revenue: ps,
      maint_revenue: maint,
      hw_revenue: hw,
      net_booking: netBooking,
      weighted_revenue: netBooking * probability,
      probability: probability,
      oracle_agreement: oracleNum ? String(oracleNum) : null,
      source_sheet: 'Rats and Mice Only',
      booking_source: bookingSource,
      fiscal_year: 2026,
      // BURC Section fields
      section_color: sectionColor,
      in_forecast: inForecast,
      pipeline_status: 'active'
    })
  }

  console.log(`   Found ${pipelineRecords.length} R&M items`)

  // ===== DIAL 2 RISK PROFILE SUMMARY (>=50K items) =====
  console.log('   Processing Dial 2 Risk Profile Summary sheet...')
  const d2Sheet = workbook.Sheets['Dial 2 Risk Profile Summary']
  const d2Data = XLSX.utils.sheet_to_json(d2Sheet, { header: 1 })

  let dial2Count = 0
  let currentSection = 'GREEN' // Default to green section at start

  for (let i = 3; i < d2Data.length; i++) {
    const row = d2Data[i]
    if (!row || !row[0]) continue

    const name = String(row[0]).trim()

    // Track section changes based on COLOUR headers (determines probability weighting)
    // Note: Green/Yellow/Red sections contain BOTH Best Case and Business Case items
    // The colour determines probability, the forecast category is tracked separately
    if (name.includes('Green:')) { currentSection = 'GREEN'; continue }
    if (name.includes('Yellow:')) { currentSection = 'YELLOW'; continue }
    if (name.includes('Red:')) { currentSection = 'RED'; continue }
    // "Business Case Related" is NOT a separate section - items stay in their colour section
    // Only Pipeline is a separate section with its own probability
    if (name.includes('Pipeline - NOT')) { currentSection = 'PIPELINE'; continue }
    if (name.includes('Closed in 2026') || name.includes('Lost or missed')) { currentSection = 'EXCLUDE'; continue }

    // Skip summary rows and collated R&M (already captured from R&M sheet)
    if (name.includes('Total') || name.includes('Anything') ||
        name.includes('Rats and Mice - Collated') || name.includes('Professional Services Backlog')) continue

    // Skip excluded sections (Closed, Lost)
    if (currentSection === 'EXCLUDE') continue

    const fcast = (row[1] || '').toString().toLowerCase()
    const closureDate = excelDateToISO(row[2])
    const oracleNum = row[3] || ''

    // Skip items explicitly marked as Lost
    if (fcast.includes('lost')) continue

    const key = `${name}|${oracleNum}`
    if (seenKeys.has(key)) continue
    seenKeys.add(key)

    // BOOKING VALUE HIERARCHY:
    // 1. Primary: Total Net Booking (column 24) - after COGS/margin
    // 2. Fallback: Bookings ACV (column 17) - if Net Booking is empty
    // Values are in $M, multiply by 1,000,000 to convert to dollars
    const netBookingRaw = parseCurrency(row[24])
    const bookingsAcvRaw = parseCurrency(row[17])

    let netBooking = netBookingRaw * 1000000
    let bookingSource = 'Net Booking'

    // Fallback to Bookings ACV if Net Booking is zero/empty
    if (netBooking === 0 && bookingsAcvRaw !== 0) {
      netBooking = bookingsAcvRaw * 1000000
      bookingSource = 'Bookings ACV'
    }

    // Allow negative values (reversals) but skip zero
    if (netBooking === 0) continue

    const category = normaliseForecast(fcast)

    // Use section-based probability (Green=90%, Yellow=50%, Red=20%)
    const probability = SECTION_PROBABILITY[currentSection] || 0.3

    // Also capture individual revenue components for breakdown (columns 8-11)
    const sw = parseCurrency(row[8])
    const ps = parseCurrency(row[9])
    const maint = parseCurrency(row[10])
    const hw = parseCurrency(row[11])

    // Map BURC section to section_color for database
    const sectionColorMap = {
      'GREEN': 'green',
      'YELLOW': 'yellow',
      'RED': 'red',
      'PIPELINE': 'pipeline'
    }
    const sectionColor = sectionColorMap[currentSection] || 'pipeline'
    const inForecast = ['green', 'yellow'].includes(sectionColor)

    pipelineRecords.push({
      deal_name: name,
      client_name: extractClientName(name),
      forecast_category: category,
      closure_date: closureDate,
      sw_revenue: sw,
      ps_revenue: ps,
      maint_revenue: maint,
      hw_revenue: hw,
      net_booking: netBooking,
      weighted_revenue: netBooking * probability,
      probability: probability,
      oracle_agreement: oracleNum ? String(oracleNum) : null,
      source_sheet: 'Dial 2 Risk Profile Summary',
      booking_source: bookingSource,
      fiscal_year: 2026,
      // BURC Section fields - parsed from Excel colour sections
      section_color: sectionColor,
      in_forecast: inForecast,
      pipeline_status: 'active'
    })
    dial2Count++
  }

  console.log(`   Found ${dial2Count} Dial 2 items`)
  console.log(`   Total booking items: ${pipelineRecords.length}`)

  // Count by forecast category
  const categoryCount = pipelineRecords.reduce((acc, r) => {
    acc[r.forecast_category] = (acc[r.forecast_category] || 0) + 1
    return acc
  }, {})
  console.log('   By Category:', categoryCount)

  // Count by booking source (methodology transparency)
  const sourceCount = pipelineRecords.reduce((acc, r) => {
    acc[r.booking_source] = (acc[r.booking_source] || 0) + 1
    return acc
  }, {})
  console.log('   By Booking Source:', sourceCount)

  // Count by section_color (directly from Excel sections)
  const sectionCount = pipelineRecords.reduce((acc, r) => {
    const label = r.section_color.charAt(0).toUpperCase() + r.section_color.slice(1)
    acc[label] = (acc[label] || 0) + 1
    return acc
  }, {})
  console.log('   By Section Colour:', sectionCount)

  // Count by in_forecast
  const forecastCount = pipelineRecords.reduce((acc, r) => {
    const label = r.in_forecast ? 'In Forecast' : 'Not in Forecast'
    acc[label] = (acc[label] || 0) + 1
    return acc
  }, {})
  console.log('   By Forecast Status:', forecastCount)

  // Calculate totals using Net Booking
  const totalNetBooking = pipelineRecords.reduce((sum, r) => sum + r.net_booking, 0)
  const weightedNetBooking = pipelineRecords.reduce((sum, r) => sum + r.weighted_revenue, 0)

  console.log(`   Total Net Booking: $${totalNetBooking.toLocaleString()}`)
  console.log(`   Weighted Net Booking: $${weightedNetBooking.toLocaleString()}`)

  // Insert into database
  if (pipelineRecords.length > 0) {
    // Clear existing 2026 pipeline data
    await supabase.from('burc_pipeline_detail').delete().eq('fiscal_year', 2026)

    // Insert in batches
    const batchSize = 50
    for (let i = 0; i < pipelineRecords.length; i += batchSize) {
      const batch = pipelineRecords.slice(i, i + batchSize)
      const { error } = await supabase.from('burc_pipeline_detail').insert(batch)
      if (error) console.log(`   ⚠️ Batch insert error: ${error.message}`)
    }

    console.log(`   ✅ ${pipelineRecords.length} booking records synced`)
  }

  return { totalNetBooking, weightedNetBooking, count: pipelineRecords.length }
}

async function syncAttritionData() {
  console.log('\n⚠️ Syncing Attrition Data...')

  const workbook = XLSX.readFile(BURC_FILE)
  const sheet = workbook.Sheets['Attrition']
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 })

  const attritionRecords = []

  // Header is row 1, data starts row 3
  for (let i = 3; i < data.length; i++) {
    const row = data[i]
    if (!row || !row[0] || row[0] === 'Grand Total') continue

    const clientName = String(row[0]).trim()
    const riskType = (row[1] || 'Partial').toString()
    const forecastDate = excelDateToISO(row[2])

    // Revenue in $,000 so multiply by 1000
    const rev2025 = (parseCurrency(row[3]) || 0) * 1000
    const rev2026 = (parseCurrency(row[4]) || 0) * 1000
    const rev2027 = (parseCurrency(row[5]) || 0) * 1000
    const rev2028 = (parseCurrency(row[6]) || 0) * 1000
    const totalAtRisk = (parseCurrency(row[7]) || 0) * 1000

    attritionRecords.push({
      client_name: clientName,
      risk_type: riskType === 'Full' ? 'Full' : 'Partial',
      forecast_date: forecastDate,
      revenue_2025: rev2025,
      revenue_2026: rev2026,
      revenue_2027: rev2027,
      revenue_2028: rev2028,
      revenue_at_risk: rev2026, // Current year at risk
      total_at_risk: totalAtRisk,
      status: 'confirmed',
      fiscal_year: 2026,
      source: 'Attrition Sheet'
    })
  }

  console.log(`   Found ${attritionRecords.length} attrition records`)

  // Calculate totals
  const revenueAtRisk2026 = attritionRecords.reduce((sum, r) => sum + r.revenue_2026, 0)
  const totalAtRiskAllYears = attritionRecords.reduce((sum, r) => sum + r.total_at_risk, 0)

  console.log(`   2026 Revenue at Risk: $${revenueAtRisk2026.toLocaleString()}`)
  console.log(`   Total at Risk (all years): $${totalAtRiskAllYears.toLocaleString()}`)

  // Insert into database
  if (attritionRecords.length > 0) {
    await supabase.from('burc_attrition').delete().eq('fiscal_year', 2026)

    const { error } = await supabase.from('burc_attrition').insert(attritionRecords)
    if (error) {
      console.log(`   ⚠️ Insert error: ${error.message}`)
    } else {
      console.log(`   ✅ ${attritionRecords.length} attrition records synced`)
    }
  }

  return { revenueAtRisk: revenueAtRisk2026, totalAtRisk: totalAtRiskAllYears, count: attritionRecords.length }
}

async function updateExecutiveSummary(bookings, attrition) {
  console.log('\n📈 Updating Executive Summary...')

  // Update burc_annual_financials with booking and attrition totals
  const { error } = await supabase
    .from('burc_annual_financials')
    .update({
      updated_at: new Date().toISOString()
    })
    .eq('fiscal_year', 2026)

  if (error) {
    console.log(`   ⚠️ Update error: ${error.message}`)
  } else {
    console.log(`   ✅ Executive summary updated`)
  }

  // Log the final values that will appear on dashboard
  console.log('\n📋 Dashboard Values:')
  console.log(`   Total Net Booking: $${bookings.totalNetBooking.toLocaleString()}`)
  console.log(`   Weighted Net Booking: $${bookings.weightedNetBooking.toLocaleString()}`)
  console.log(`   Revenue at Risk (2026): $${attrition.revenueAtRisk.toLocaleString()}`)
  console.log(`   Net Impact: $${(bookings.weightedNetBooking - attrition.revenueAtRisk).toLocaleString()}`)
}

// Helper: Extract client name from opportunity name
function extractClientName(oppName) {
  const patterns = [
    /^(SA Health|WA Health|GHA|AWH|SLMC|Mindef|Waikato|BWH|EPH|MAH|Western Health|Sing Health|NCS|Parkway)/i
  ]

  for (const pattern of patterns) {
    const match = oppName.match(pattern)
    if (match) return match[1]
  }

  // Try to extract from hyphen-separated
  const parts = oppName.split(/[-–]/)
  if (parts.length > 1) return parts[0].trim()

  return oppName.split(' ').slice(0, 2).join(' ')
}

// Helper: Normalise forecast category
function normaliseForecast(fcast) {
  const f = fcast.toLowerCase()
  if (f.includes('backlog')) return 'Backlog'
  if (f.includes('best')) return 'Best Case'
  if (f.includes('bus')) return 'Business Case'
  if (f.includes('lost') || f.includes('closed')) return 'EXCLUDE' // Lost/closed deals
  return 'Pipeline'
}

// Main
async function main() {
  console.log('🚀 Pipeline and Attrition Sync')
  console.log('==============================')
  console.log(`📁 Source: ${BURC_FILE}`)
  console.log(`📅 Started: ${new Date().toISOString()}`)

  const startTime = Date.now()

  const pipelineResult = await syncPipelineData()
  const attritionResult = await syncAttritionData()
  await updateExecutiveSummary(pipelineResult, attritionResult)

  const duration = ((Date.now() - startTime) / 1000).toFixed(2)

  console.log('\n==============================')
  console.log(`✅ Sync complete in ${duration}s`)
}

main().catch(err => {
  console.error('❌ Fatal error:', err)
  process.exit(1)
})
