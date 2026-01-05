#!/usr/bin/env node
/**
 * Sync Pipeline and Attrition data from 2026 APAC Performance.xlsx
 *
 * Sources:
 * - Pipeline: "Rats and Mice Only" sheet (<50K items) + "Dial 2 Risk Profile Summary" (>=50K items)
 * - Attrition: "Attrition" sheet for confirmed revenue at risk
 * - Renewals: Derived from "Opal Maint Contracts and Value" sheet
 *
 * Weighted Pipeline Calculation:
 * - Best Case: 90% probability
 * - Business Case: 50% probability
 * - Pipeline: 30% probability
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

const BURC_FILE = '/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth(2)/APAC Leadership Team - General/Performance/Financials/BURC/2026/2026 APAC Performance.xlsx'

// Probability weights by section COLOR (for Dial 2 items)
// Green = High probability to close
// Yellow = Mid-range probability
// Red = Unlikely to close
const SECTION_PROBABILITY = {
  'GREEN': 0.9,      // High probability
  'YELLOW': 0.5,     // Mid-range
  'RED': 0.2,        // Unlikely
  'BUSINESS_CASE': 0.5,
  'PIPELINE': 0.3
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

    const sw = parseCurrency(row[8])
    const ps = parseCurrency(row[9])
    const maint = parseCurrency(row[10])
    const hw = parseCurrency(row[11])
    const totalRevenue = sw + ps + maint + hw

    if (totalRevenue === 0) continue

    const category = normaliseForecast(fcast)
    // Skip Lost/Closed deals
    if (category === 'EXCLUDE') continue

    const probability = CATEGORY_PROBABILITY[fcast] || 0.3

    pipelineRecords.push({
      deal_name: name,
      client_name: extractClientName(name),
      forecast_category: category,
      closure_date: closureDate,
      sw_revenue: sw,
      ps_revenue: ps,
      maint_revenue: maint,
      hw_revenue: hw,
      // total_revenue is a generated column (sw + ps + maint + hw)
      weighted_revenue: totalRevenue * probability,
      probability: probability,
      oracle_agreement: oracleNum ? String(oracleNum) : null,
      source_sheet: 'Rats and Mice Only',
      fiscal_year: 2026
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

    // Track section changes based on header rows (determines probability weighting)
    if (name.includes('Green:')) { currentSection = 'GREEN'; continue }
    if (name.includes('Yellow:')) { currentSection = 'YELLOW'; continue }
    if (name.includes('Red:')) { currentSection = 'RED'; continue }
    if (name.includes('Business Case Related')) { currentSection = 'BUSINESS_CASE'; continue }
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

    const sw = parseCurrency(row[8])
    const ps = parseCurrency(row[9])
    const maint = parseCurrency(row[10])
    const hw = parseCurrency(row[11])
    const totalRevenue = sw + ps + maint + hw

    // Allow negative values (reversals) but skip zero
    if (totalRevenue === 0) continue

    const category = normaliseForecast(fcast)

    // Use section-based probability (Green=90%, Yellow=50%, Red=20%)
    const probability = SECTION_PROBABILITY[currentSection] || 0.3

    pipelineRecords.push({
      deal_name: name,
      client_name: extractClientName(name),
      forecast_category: category,
      closure_date: closureDate,
      sw_revenue: sw,
      ps_revenue: ps,
      maint_revenue: maint,
      hw_revenue: hw,
      // total_revenue is a generated column (sw + ps + maint + hw)
      weighted_revenue: totalRevenue * probability,
      probability: probability,
      oracle_agreement: oracleNum ? String(oracleNum) : null,
      source_sheet: 'Dial 2 Risk Profile Summary',
      fiscal_year: 2026
    })
    dial2Count++
  }

  console.log(`   Found ${dial2Count} Dial 2 items`)
  console.log(`   Total pipeline items: ${pipelineRecords.length}`)

  // Count by forecast category
  const categoryCount = pipelineRecords.reduce((acc, r) => {
    acc[r.forecast_category] = (acc[r.forecast_category] || 0) + 1
    return acc
  }, {})
  console.log('   By Category:', categoryCount)

  // Calculate totals (sum individual revenue fields since total_revenue is a generated column)
  const totalPipeline = pipelineRecords.reduce((sum, r) =>
    sum + r.sw_revenue + r.ps_revenue + r.maint_revenue + r.hw_revenue, 0)
  const weightedPipeline = pipelineRecords.reduce((sum, r) => sum + r.weighted_revenue, 0)

  console.log(`   Total Pipeline Value: $${totalPipeline.toLocaleString()}`)
  console.log(`   Weighted Pipeline Value: $${weightedPipeline.toLocaleString()}`)

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

    console.log(`   ✅ ${pipelineRecords.length} pipeline records synced`)
  }

  return { totalPipeline, weightedPipeline, count: pipelineRecords.length }
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

async function updateExecutiveSummary(pipeline, attrition) {
  console.log('\n📈 Updating Executive Summary...')

  // Update burc_annual_financials with pipeline and attrition totals
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
  console.log(`   Total Pipeline: $${pipeline.totalPipeline.toLocaleString()}`)
  console.log(`   Weighted Pipeline: $${pipeline.weightedPipeline.toLocaleString()}`)
  console.log(`   Revenue at Risk (2026): $${attrition.revenueAtRisk.toLocaleString()}`)
  console.log(`   Net Revenue Impact: $${(pipeline.weightedPipeline - attrition.revenueAtRisk).toLocaleString()}`)
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
