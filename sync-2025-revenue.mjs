#!/usr/bin/env node

/**
 * Sync 2025 Revenue Data from BURC Performance File
 *
 * Extracts 2025 revenue by client from the APAC Performance file
 * and inserts it into burc_historical_revenue_detail table.
 */

import xlsx from 'xlsx'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const BURC_FILE = '/tmp/burc-archive/BURC/2025/2025 APAC Performance.xlsx'

// Client name mappings from short codes to full names (matching existing data)
const CLIENT_MAPPINGS = {
  'AWH': 'Albury Wodonga Health',
  'BWH': 'Barwon Health Australia',
  'EPH': 'Epworth HealthCare',
  'GHA': 'Gippsland Health Alliance',
  'Grampians': 'Grampians Health',
  'MAH': 'Mount Alvernia Hospital',
  'NCS': 'NCS PTE Ltd',
  'Parkway': 'Parkway Hospitals Singapore PTE LTD',
  'SA Health': 'Minister for Health aka South Australia Health',
  'SAPPI': 'Strategic Asia Pacific Partners, Incorporated',
  'Sing Health': 'Singapore Health Services Pte Ltd',
  'SLMC': "St Luke's Medical Center Global City Inc",
  'Waikato': 'Waikato District Health Board',
  'WA Health': 'Western Australia Department Of Health',
  'Western Health': 'Western Health',
  'RVEEH': 'The Royal Victorian Eye and Ear Hospital',
  'Epworth': 'Epworth HealthCare',
  'GRMC': 'Grampians Health', // Grampians Rural Medical Centre
}

async function extractMaintenanceRevenue(workbook) {
  console.log('\n📊 Extracting Maintenance Revenue...')

  const sheet = workbook.Sheets['Maint Net Rev 2025']
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1 })

  const records = []

  // Skip header rows (0-1), process client rows (2-17)
  for (let i = 2; i < data.length; i++) {
    const row = data[i]
    if (!row || !row[0]) continue

    const clientCode = row[0]?.toString().trim()
    if (!clientCode || clientCode === '' || clientCode.startsWith('Actual')) continue

    // Check if it's a total row
    if (typeof row[0] === 'number') continue

    const clientName = CLIENT_MAPPINGS[clientCode] || clientCode
    const grossRevenue = parseFloat(row[7]) || 0 // Column H (index 7): 2025 Gross

    if (grossRevenue > 0) {
      records.push({
        fiscal_year: 2025,
        fiscal_month: null, // Annual total
        client_name: clientName,
        parent_company: 'ADHI',
        revenue_type: 'Maintenance Revenue',
        amount_usd: Math.round(grossRevenue * 100) / 100,
        amount_aud: 0,
        product: 'Maintenance'
      })
      console.log(`  ${clientName}: $${grossRevenue.toLocaleString()}`)
    }
  }

  return records
}

async function extractPSRevenue(workbook) {
  console.log('\n💼 Extracting Professional Services Revenue...')

  const sheet = workbook.Sheets['PS']
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1 })

  const clientTotals = {}

  // Process PS rows - look for client names and revenue amounts
  // Column 1 = APAC Client, Column 9 = USD amount
  for (let i = 3; i < data.length; i++) {
    const row = data[i]
    if (!row || row.length < 10) continue

    const clientCode = row[1]?.toString().trim()
    if (!clientCode || clientCode === '' || clientCode === 'APAC' || clientCode === '0') continue
    if (clientCode === 'Rats and Mice' || clientCode === 'APAC Client') continue

    const clientName = CLIENT_MAPPINGS[clientCode] || clientCode
    const revenueUSD = parseFloat(row[9]) || 0 // USD column (index 9)

    // Skip reversal rows (negative amounts are already factored in)
    if (revenueUSD > 0) {
      clientTotals[clientName] = (clientTotals[clientName] || 0) + revenueUSD
    }
  }

  const records = []
  for (const [clientName, total] of Object.entries(clientTotals)) {
    if (total > 0) {
      records.push({
        fiscal_year: 2025,
        fiscal_month: null,
        client_name: clientName,
        parent_company: 'ADHI',
        revenue_type: 'Professional Services Revenue',
        amount_usd: Math.round(total * 100) / 100,
        amount_aud: 0,
        product: 'Professional Services'
      })
      console.log(`  ${clientName}: $${total.toLocaleString()}`)
    }
  }

  return records
}

async function extractSWRevenue(workbook) {
  console.log('\n💻 Extracting Software/License Revenue...')

  const sheet = workbook.Sheets['SW']
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1 })

  const clientTotals = {}

  // Process SW rows - Column 3 = APAC Client, Column 7 = Licence Val USD
  for (let i = 3; i < data.length; i++) {
    const row = data[i]
    if (!row || row.length < 8) continue

    // Client is in column D (index 3)
    const clientCode = row[3]?.toString().trim()
    if (!clientCode || clientCode === '' || clientCode === '0') continue
    if (clientCode === 'APAC Client' || clientCode === 'Status') continue

    const clientName = CLIENT_MAPPINGS[clientCode] || clientCode
    const licenceValue = parseFloat(row[7]) || 0 // Licence Val USD

    if (licenceValue > 0) {
      clientTotals[clientName] = (clientTotals[clientName] || 0) + licenceValue
    }
  }

  const records = []
  for (const [clientName, total] of Object.entries(clientTotals)) {
    if (total > 0) {
      records.push({
        fiscal_year: 2025,
        fiscal_month: null,
        client_name: clientName,
        parent_company: 'ADHI',
        revenue_type: 'License Revenue',
        amount_usd: Math.round(total * 100) / 100,
        amount_aud: 0,
        product: 'Software'
      })
      console.log(`  ${clientName}: $${total.toLocaleString()}`)
    }
  }

  return records
}

async function extractHWRevenue(workbook) {
  console.log('\n🖥️ Extracting Hardware Revenue...')

  const sheet = workbook.Sheets['HW']
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1 })

  // Get total from first data row
  const totalRow = data[1]
  if (!totalRow) return []

  // Sum all monthly values (columns 2-13)
  let totalHW = 0
  for (let i = 2; i <= 13; i++) {
    totalHW += parseFloat(totalRow[i]) || 0
  }

  if (totalHW > 0) {
    console.log(`  Total Hardware: $${totalHW.toLocaleString()}`)
    return [{
      fiscal_year: 2025,
      fiscal_month: null,
      client_name: 'APAC Hardware',
      parent_company: 'ADHI',
      revenue_type: 'Hardware & Other Revenue',
      amount_usd: Math.round(totalHW * 100) / 100,
      amount_aud: 0,
      product: 'Hardware'
    }]
  }

  return []
}

async function main() {
  console.log('='.repeat(60))
  console.log('2025 Revenue Data Sync')
  console.log('='.repeat(60))

  // Load workbook
  console.log(`\nLoading ${BURC_FILE}...`)
  const workbook = xlsx.readFile(BURC_FILE)

  // Extract revenue from each source
  const maintRecords = await extractMaintenanceRevenue(workbook)
  const psRecords = await extractPSRevenue(workbook)
  const swRecords = await extractSWRevenue(workbook)
  const hwRecords = await extractHWRevenue(workbook)

  const allRecords = [...maintRecords, ...psRecords, ...swRecords, ...hwRecords]

  console.log(`\n📈 Total 2025 records to insert: ${allRecords.length}`)

  // Calculate totals
  const totalByType = {}
  allRecords.forEach(r => {
    totalByType[r.revenue_type] = (totalByType[r.revenue_type] || 0) + r.amount_usd
  })

  console.log('\n2025 Revenue Summary:')
  Object.entries(totalByType).forEach(([type, total]) => {
    console.log(`  ${type}: $${(total / 1000000).toFixed(2)}M`)
  })

  const grandTotal = Object.values(totalByType).reduce((a, b) => a + b, 0)
  console.log(`  ─────────────────────────`)
  console.log(`  Total: $${(grandTotal / 1000000).toFixed(2)}M`)

  // Delete existing 2025 data
  console.log('\n🗑️ Removing existing 2025 records...')
  const { error: deleteError } = await supabase
    .from('burc_historical_revenue_detail')
    .delete()
    .eq('fiscal_year', 2025)

  if (deleteError) {
    console.error('Delete error:', deleteError.message)
  }

  // Insert new records
  console.log('\n📥 Inserting 2025 records...')
  const { error: insertError } = await supabase
    .from('burc_historical_revenue_detail')
    .insert(allRecords)

  if (insertError) {
    console.error('Insert error:', insertError.message)
    return
  }

  // Verify
  const { count } = await supabase
    .from('burc_historical_revenue_detail')
    .select('*', { count: 'exact', head: true })
    .eq('fiscal_year', 2025)

  console.log(`\n✅ Inserted ${count} records for 2025`)

  console.log('\n' + '='.repeat(60))
  console.log('2025 SYNC COMPLETE')
  console.log('='.repeat(60))
}

main().catch(console.error)
