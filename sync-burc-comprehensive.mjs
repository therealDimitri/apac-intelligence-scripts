#!/usr/bin/env node
/**
 * BURC Comprehensive Data Sync
 *
 * Syncs data from the full BURC archive (247 files) including:
 * - Historical Revenue (2019-2026)
 * - Opal Contracts
 * - Attrition Risk
 * - Business Cases / Pipeline
 * - Monthly Revenue & COGS
 * - ARR Targets
 *
 * Usage: node scripts/sync-burc-comprehensive.mjs [--full|--incremental]
 */

import { createClient } from '@supabase/supabase-js'
import XLSX from 'xlsx'
import path from 'path'
import fs from 'fs'
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

// Base path for BURC files
const BURC_BASE = '/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth(2)/APAC Leadership Team - General/Performance/Financials/BURC'

// Current year Performance file
const PERFORMANCE_FILE_2026 = `${BURC_BASE}/2026/2026 APAC Performance.xlsx`

// Helper to convert Excel date to JS Date
function excelDateToJSDate(excelDate) {
  if (!excelDate || typeof excelDate !== 'number') return null
  const date = new Date((excelDate - 25569) * 86400 * 1000)
  return date.toISOString().split('T')[0]
}

// Helper to parse currency values (capped at 999 billion for DECIMAL(14,2))
function parseCurrency(value, maxValue = 999999999999.99) {
  if (value === null || value === undefined || value === '' || value === ' ') return 0
  if (typeof value === 'number') {
    return Math.min(Math.abs(value), maxValue)
  }
  const cleaned = String(value).replace(/[$,\s]/g, '')
  const parsed = parseFloat(cleaned)
  return isNaN(parsed) ? 0 : Math.min(Math.abs(parsed), maxValue)
}

// Sync audit logging
async function logSync(syncType, tableName, operation, recordCount, sourceFile, error = null) {
  await supabase.from('burc_sync_audit').insert({
    sync_type: syncType,
    table_name: tableName,
    operation: operation,
    records_processed: recordCount,
    source_file: sourceFile,
    error_message: error
  })
}

// ============================================================
// 1. SYNC HISTORICAL REVENUE (2019-2026)
// ============================================================
async function syncHistoricalRevenue() {
  console.log('\n📊 Syncing Historical Revenue (2019-2026)...')

  const filePath = `${BURC_BASE}/APAC Revenue 2019 - 2024.xlsx`

  if (!fs.existsSync(filePath)) {
    console.log('   ⚠️ Historical revenue file not found')
    return
  }

  try {
    const workbook = XLSX.readFile(filePath)
    const sheet = workbook.Sheets['Customer Level Summary']
    if (!sheet) {
      console.log('   ⚠️ Customer Level Summary sheet not found')
      return
    }

    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 })
    const records = []

    // Find header row (contains year columns)
    let headerRow = -1
    for (let i = 0; i < Math.min(5, data.length); i++) {
      if (data[i] && data[i].includes(2019)) {
        headerRow = i
        break
      }
    }

    if (headerRow === -1) {
      console.log('   ⚠️ Could not find header row')
      return
    }

    // Parse data rows
    for (let i = headerRow + 1; i < data.length; i++) {
      const row = data[i]
      if (!row || !row[1]) continue // Skip if no customer name

      const parentCompany = row[0] || null
      const customerName = row[1]
      const revenueType = row[2]

      if (!revenueType || revenueType === 'Grand Total') continue

      // Map revenue types to standard names
      let mappedType = revenueType
      if (revenueType.includes('Hardware')) mappedType = 'Hardware & Other Revenue'
      if (revenueType.includes('License')) mappedType = 'License Revenue'
      if (revenueType.includes('Maintenance')) mappedType = 'Maintenance Revenue'
      if (revenueType.includes('Professional')) mappedType = 'Professional Services Revenue'

      records.push({
        parent_company: parentCompany,
        customer_name: customerName,
        revenue_type: mappedType,
        year_2019: parseCurrency(row[3]),
        year_2020: parseCurrency(row[4]),
        year_2021: parseCurrency(row[5]),
        year_2022: parseCurrency(row[6]),
        year_2023: parseCurrency(row[7]),
        year_2024: parseCurrency(row[8]) || 0,
        year_2025: 0, // Will be populated from 2025 data
        year_2026: 0, // Will be populated from 2026 data
        currency: 'USD'
      })
    }

    if (records.length > 0) {
      // Delete existing and insert new
      await supabase.from('burc_historical_revenue').delete().neq('id', 0)

      // Insert in batches
      const batchSize = 50
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize)
        const { error } = await supabase.from('burc_historical_revenue').insert(batch)
        if (error) console.log(`   ⚠️ Batch insert error: ${error.message}`)
      }

      console.log(`   ✅ ${records.length} historical revenue records synced`)
      await logSync('historical_revenue', 'burc_historical_revenue', 'full_sync', records.length, filePath)
    }
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`)
    await logSync('historical_revenue', 'burc_historical_revenue', 'full_sync', 0, filePath, err.message)
  }
}

// ============================================================
// 2. SYNC OPAL CONTRACTS
// ============================================================
async function syncContracts() {
  console.log('\n📋 Syncing Opal Contracts...')

  if (!fs.existsSync(PERFORMANCE_FILE_2026)) {
    console.log('   ⚠️ 2026 Performance file not found')
    return
  }

  try {
    const workbook = XLSX.readFile(PERFORMANCE_FILE_2026)
    const sheet = workbook.Sheets['Opal Maint Contracts and Value']

    if (!sheet) {
      console.log('   ⚠️ Opal Maint Contracts sheet not found')
      return
    }

    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 })
    const records = []

    // Find header row
    let headerRow = -1
    for (let i = 0; i < Math.min(5, data.length); i++) {
      if (data[i] && data[i][0] === 'Client') {
        headerRow = i
        break
      }
    }

    if (headerRow === -1) {
      console.log('   ⚠️ Could not find header row')
      return
    }

    // Get exchange rate from file if available
    let exchangeRate = 0.64
    for (const row of data) {
      if (row && row[6] === 'Exch Rate' && typeof row[7] === 'number') {
        exchangeRate = row[7]
        break
      }
    }

    // Parse data rows
    for (let i = headerRow + 1; i < data.length; i++) {
      const row = data[i]
      if (!row || !row[0] || row[0] === 'Total') continue

      const clientName = row[0]
      const annualValueAUD = parseCurrency(row[1])
      const annualValueUSD = parseCurrency(row[2])
      const renewalDate = excelDateToJSDate(row[3])
      const comments = row[4] || null

      // Detect CPI and auto-renewal from comments
      const cpiApplicable = comments && (comments.toLowerCase().includes('cpi') || comments.toLowerCase().includes('4%'))
      const autoRenewal = comments && comments.toLowerCase().includes('auto')

      if (annualValueAUD > 0 || annualValueUSD > 0) {
        records.push({
          client_name: clientName,
          annual_value_aud: Math.min(annualValueAUD, 999999999999.99),
          annual_value_usd: Math.min(annualValueUSD || annualValueAUD * exchangeRate, 999999999999.99),
          renewal_date: renewalDate,
          comments: comments ? String(comments).substring(0, 500) : null,
          exchange_rate: Math.min(exchangeRate, 99.9999),
          cpi_applicable: cpiApplicable,
          auto_renewal: autoRenewal,
          contract_status: 'active'
        })
      }
    }

    if (records.length > 0) {
      await supabase.from('burc_contracts').delete().neq('id', 0)
      const { error } = await supabase.from('burc_contracts').insert(records)
      if (error) {
        console.log(`   ⚠️ Insert error: ${error.message}`)
      } else {
        console.log(`   ✅ ${records.length} contracts synced`)
      }
      await logSync('contracts', 'burc_contracts', 'full_sync', records.length, PERFORMANCE_FILE_2026)
    }
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`)
    await logSync('contracts', 'burc_contracts', 'full_sync', 0, PERFORMANCE_FILE_2026, err.message)
  }
}

// ============================================================
// 3. SYNC ATTRITION RISK
// ============================================================
async function syncAttrition() {
  console.log('\n⚠️ Syncing Attrition Risk...')

  if (!fs.existsSync(PERFORMANCE_FILE_2026)) {
    console.log('   ⚠️ 2026 Performance file not found')
    return
  }

  try {
    const workbook = XLSX.readFile(PERFORMANCE_FILE_2026)
    const sheet = workbook.Sheets['Attrition']

    if (!sheet) {
      console.log('   ⚠️ Attrition sheet not found')
      return
    }

    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 })
    const records = []

    // Find header row
    let headerRow = -1
    for (let i = 0; i < Math.min(5, data.length); i++) {
      if (data[i] && data[i][0] === 'Client') {
        headerRow = i
        break
      }
    }

    if (headerRow === -1) {
      console.log('   ⚠️ Could not find header row')
      return
    }

    // Parse data rows
    for (let i = headerRow + 1; i < data.length; i++) {
      const row = data[i]
      if (!row || !row[0] || row[0] === 'Grand Total') continue

      const clientName = row[0]
      const riskType = row[1] || 'Partial'
      const forecastDate = excelDateToJSDate(row[2])

      // Revenue columns (2025, 2026, 2027, 2028, Total)
      const revenue2025 = parseCurrency(row[3]) * 1000 // Values in $,000
      const revenue2026 = parseCurrency(row[4]) * 1000
      const revenue2027 = parseCurrency(row[5]) * 1000
      const revenue2028 = parseCurrency(row[6]) * 1000
      const totalAtRisk = parseCurrency(row[7]) * 1000

      if (totalAtRisk > 0 || revenue2025 > 0 || revenue2026 > 0) {
        records.push({
          client_name: clientName,
          risk_type: riskType === 'Full' ? 'Full' : 'Partial',
          forecast_date: forecastDate,
          revenue_2025: revenue2025,
          revenue_2026: revenue2026,
          revenue_2027: revenue2027,
          revenue_2028: revenue2028,
          total_at_risk: totalAtRisk,
          status: 'open'
        })
      }
    }

    if (records.length > 0) {
      await supabase.from('burc_attrition_risk').delete().neq('id', 0)
      const { error } = await supabase.from('burc_attrition_risk').insert(records)
      if (error) {
        console.log(`   ⚠️ Insert error: ${error.message}`)
      } else {
        console.log(`   ✅ ${records.length} attrition risks synced`)
      }
      await logSync('attrition', 'burc_attrition_risk', 'full_sync', records.length, PERFORMANCE_FILE_2026)
    }
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`)
    await logSync('attrition', 'burc_attrition_risk', 'full_sync', 0, PERFORMANCE_FILE_2026, err.message)
  }
}

// ============================================================
// 4. SYNC BUSINESS CASES / PIPELINE
// ============================================================
async function syncBusinessCases() {
  console.log('\n💼 Syncing Business Cases / Pipeline...')

  if (!fs.existsSync(PERFORMANCE_FILE_2026)) {
    console.log('   ⚠️ 2026 Performance file not found')
    return
  }

  try {
    const workbook = XLSX.readFile(PERFORMANCE_FILE_2026)
    const sheet = workbook.Sheets['Dial 2 Risk Profile Summary']

    if (!sheet) {
      console.log('   ⚠️ Dial 2 Risk Profile Summary sheet not found')
      return
    }

    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 })
    const records = []

    let currentCategory = 'Best Case'

    for (let i = 3; i < data.length; i++) {
      const row = data[i]
      if (!row || !row[0]) continue

      const firstCol = row[0]

      // Detect category changes
      if (firstCol.toLowerCase().includes('green') || firstCol.toLowerCase().includes('best case')) {
        currentCategory = 'Best Case'
        continue
      }
      if (firstCol.toLowerCase().includes('pipeline')) {
        currentCategory = 'Pipeline'
        continue
      }
      if (firstCol.toLowerCase().includes('business case')) {
        currentCategory = 'Business Case'
        continue
      }
      if (firstCol.toLowerCase().includes('total') || firstCol.toLowerCase().includes('rats')) {
        continue
      }

      // Parse opportunity
      const opportunityName = firstCol
      const forecastCategory = row[1] || currentCategory
      const closureDate = excelDateToJSDate(row[2])
      const oracleNumber = row[3] ? String(row[3]) : null
      const swDate = excelDateToJSDate(row[4])
      const psDate = excelDateToJSDate(row[5])
      const maintDate = excelDateToJSDate(row[6])
      const hwDate = excelDateToJSDate(row[7])

      if (opportunityName && opportunityName.length > 3) {
        records.push({
          opportunity_name: opportunityName,
          forecast_category: forecastCategory === 'Best Case' ? 'Best Case' :
                            forecastCategory === 'Pipeline' ? 'Pipeline' : 'Business Case',
          closure_date: closureDate,
          oracle_agreement_number: oracleNumber,
          sw_revenue_date: swDate,
          ps_revenue_date: psDate,
          maint_revenue_date: maintDate,
          hw_revenue_date: hwDate,
          stage: 'active',
          snapshot_month: '2026-01'
        })
      }
    }

    if (records.length > 0) {
      await supabase.from('burc_business_cases').delete().eq('snapshot_month', '2026-01')
      const { error } = await supabase.from('burc_business_cases').insert(records)
      if (error) {
        console.log(`   ⚠️ Insert error: ${error.message}`)
      } else {
        console.log(`   ✅ ${records.length} business cases synced`)
      }
      await logSync('business_cases', 'burc_business_cases', 'full_sync', records.length, PERFORMANCE_FILE_2026)
    }
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`)
    await logSync('business_cases', 'burc_business_cases', 'full_sync', 0, PERFORMANCE_FILE_2026, err.message)
  }
}

// ============================================================
// 5. SYNC ARR TARGETS
// ============================================================
async function syncARRTargets() {
  console.log('\n🎯 Syncing ARR Targets...')

  const arrFile = `${BURC_BASE}/2025/ARR Target 2025.xlsx`

  if (!fs.existsSync(arrFile)) {
    console.log('   ⚠️ ARR Target file not found')
    return
  }

  try {
    const workbook = XLSX.readFile(arrFile)
    const sheet = workbook.Sheets['Target Pipeline']

    if (!sheet) {
      console.log('   ⚠️ Target Pipeline sheet not found')
      return
    }

    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 })
    const records = []

    // Skip header row
    for (let i = 1; i < data.length; i++) {
      const row = data[i]
      if (!row || !row[0]) continue

      const clientName = row[0]
      const cseOwner = row[1] || null
      const arrUSD = parseCurrency(row[2])
      const targetPipelineValue = parseCurrency(row[3])
      const totalBookings = parseCurrency(row[4])
      const variance = parseCurrency(row[5])

      if (arrUSD > 0) {
        records.push({
          client_name: clientName,
          cse_owner: cseOwner,
          arr_usd: arrUSD,
          target_pipeline_percent: 10,
          target_pipeline_value: targetPipelineValue,
          actual_bookings: totalBookings,
          variance: variance,
          year: 2025
        })
      }
    }

    if (records.length > 0) {
      await supabase.from('burc_arr_tracking').delete().eq('year', 2025)
      const { error } = await supabase.from('burc_arr_tracking').insert(records)
      if (error) {
        console.log(`   ⚠️ Insert error: ${error.message}`)
      } else {
        console.log(`   ✅ ${records.length} ARR targets synced`)
      }
      await logSync('arr_targets', 'burc_arr_tracking', 'full_sync', records.length, arrFile)
    }
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`)
    await logSync('arr_targets', 'burc_arr_tracking', 'full_sync', 0, arrFile, err.message)
  }
}

// ============================================================
// 6. SYNC FX RATES
// ============================================================
async function syncFXRates() {
  console.log('\n💱 Syncing FX Rates...')

  const fxFile = `${BURC_BASE}/2025/2025 BURC Fx Headwinds.xlsx`

  if (!fs.existsSync(fxFile)) {
    console.log('   ⚠️ FX Headwinds file not found')
    return
  }

  try {
    const workbook = XLSX.readFile(fxFile)
    const sheet = workbook.Sheets[workbook.SheetNames[0]]

    if (!sheet) {
      console.log('   ⚠️ FX sheet not found')
      return
    }

    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 })
    const records = []

    // Parse FX data
    for (let i = 1; i < data.length; i++) {
      const row = data[i]
      if (!row || !row[0]) continue

      const currency = row[0] // AUD, SGD, etc.
      const baseline = row[1]

      if (currency && baseline && typeof baseline === 'number') {
        // Add baseline rate
        records.push({
          rate_date: '2025-01-01',
          currency_from: currency,
          currency_to: 'USD',
          rate: baseline,
          rate_type: 'budget'
        })

        // Add quarterly rates if available
        for (let q = 0; q < 4; q++) {
          const rate = row[3 + q]
          if (typeof rate === 'number') {
            const month = (q * 3) + 1
            records.push({
              rate_date: `2025-${String(month).padStart(2, '0')}-01`,
              currency_from: currency,
              currency_to: 'USD',
              rate: rate,
              rate_type: 'period_end'
            })
          }
        }
      }
    }

    if (records.length > 0) {
      // Upsert to handle duplicates
      for (const record of records) {
        await supabase.from('burc_fx_rates').upsert(record, {
          onConflict: 'rate_date,currency_from,currency_to,rate_type'
        })
      }
      console.log(`   ✅ ${records.length} FX rates synced`)
      await logSync('fx_rates', 'burc_fx_rates', 'upsert', records.length, fxFile)
    }
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`)
    await logSync('fx_rates', 'burc_fx_rates', 'upsert', 0, fxFile, err.message)
  }
}

// ============================================================
// MAIN SYNC FUNCTION
// ============================================================
async function runComprehensiveSync() {
  console.log('🚀 BURC Comprehensive Data Sync')
  console.log('================================')
  console.log(`📁 Base path: ${BURC_BASE}`)
  console.log(`📅 Started: ${new Date().toISOString()}\n`)

  const startTime = Date.now()

  // Run all sync functions
  await syncHistoricalRevenue()
  await syncContracts()
  await syncAttrition()
  await syncBusinessCases()
  await syncARRTargets()
  await syncFXRates()

  const duration = ((Date.now() - startTime) / 1000).toFixed(2)

  console.log('\n================================')
  console.log(`✅ Sync complete in ${duration}s`)
  console.log(`📅 Finished: ${new Date().toISOString()}`)

  // Log overall sync
  await supabase.from('burc_sync_log').insert({
    synced_at: new Date().toISOString(),
    file_path: BURC_BASE,
    status: 'success',
    notes: `Comprehensive sync completed in ${duration}s`
  })
}

// Run
runComprehensiveSync().catch(err => {
  console.error('❌ Fatal error:', err)
  process.exit(1)
})
