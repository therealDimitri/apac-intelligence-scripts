#!/usr/bin/env node
/**
 * Import 2025 Monthly BURC Data
 *
 * This script imports detailed monthly revenue data from the 2025 BURC files
 * into the burc_historical_revenue_detail table.
 *
 * Data sources:
 * - APAC Support Rev: Maintenance/Support revenue
 * - APAC PS Rev: Professional Services revenue
 * - APAC Upfront Rev: Software/License revenue
 */

import { createClient } from '@supabase/supabase-js'
import xlsx from 'xlsx'
import path from 'path'
import fs from 'fs'

// Load environment variables
const envPath = path.join(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8')
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=')
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join('=').trim().replace(/^["']|["']$/g, '')
    }
  })
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Month name to number mapping
const MONTH_MAP = {
  'Jan': 1, 'Feb': 2, 'Mar': 3, 'Apr': 4, 'May': 5, 'Jun': 6,
  'Jul': 7, 'Aug': 8, 'Sep': 9, 'Oct': 10, 'Nov': 11, 'Dec': 12
}

// Files to process (latest available for each month)
const FILES_TO_PROCESS = [
  { path: '/tmp/burc-archive/BURC/2025/Nov/2025 11 Rev and COGS detail.xlsx', month: 'Nov' },
]

/**
 * Parse Support Revenue sheet
 */
function parseSupportRevenue(wb) {
  const sheet = wb.Sheets['APAC Support Rev']
  if (!sheet) return []

  const data = xlsx.utils.sheet_to_json(sheet, { header: 1 })
  const records = []

  // Find header row (contains 'MNT' in first column)
  let headerRowIdx = -1
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === 'MNT') {
      headerRowIdx = i
      break
    }
  }

  if (headerRowIdx === -1) {
    console.log('  ⚠️  Could not find header row in APAC Support Rev')
    return []
  }

  // Column indices for months (actual values, not forecast)
  // Format: MNT, Jan & Feb, March, April, May, June, July, August, September, October, November, December, Full Year
  const monthColumns = {
    1: [1],      // Jan (part of Jan & Feb combined)
    2: [1],      // Feb (part of Jan & Feb combined)
    3: [2],      // March
    4: [3],      // April
    5: [4],      // May
    6: [5],      // June
    7: [6],      // July
    8: [7],      // August
    9: [8],      // September
    10: [9],     // October
    11: [10],    // November
    12: [11],    // December
  }

  // Parse data rows
  for (let i = headerRowIdx + 1; i < data.length; i++) {
    const row = data[i]
    if (!row || !row[0] || typeof row[0] !== 'string') continue

    const clientName = row[0].trim()
    if (clientName === 'Grand Total' || clientName === '') continue

    // Get monthly values
    for (let month = 1; month <= 12; month++) {
      let amount = 0

      if (month <= 2) {
        // Jan and Feb are combined - split equally
        const combined = parseFloat(row[1]) || 0
        amount = combined / 2
      } else {
        amount = parseFloat(row[month]) || 0
      }

      if (amount !== 0) {
        records.push({
          client_name: clientName,
          fiscal_year: 2025,
          fiscal_month: month,
          revenue_type: 'Maintenance',
          amount_usd: Math.round(amount * 100) / 100,
          product: 'Support',
          source_file: 'Nov 2025 Rev and COGS detail'
        })
      }
    }
  }

  return records
}

/**
 * Parse PS Revenue sheet
 */
function parsePSRevenue(wb) {
  const sheet = wb.Sheets['APAC PS Rev']
  if (!sheet) return []

  const data = xlsx.utils.sheet_to_json(sheet, { header: 1 })
  const records = []

  // Find header row (contains 'Customer Name' and month columns)
  let headerRowIdx = -1
  for (let i = 0; i < data.length; i++) {
    if (data[i] && data[i][0] === 'Customer Name') {
      headerRowIdx = i
      break
    }
  }

  if (headerRowIdx === -1) {
    console.log('  ⚠️  Could not find header row in APAC PS Rev')
    return []
  }

  const headers = data[headerRowIdx]

  // Find month column indices
  const monthIndices = {}
  for (let col = 0; col < headers.length; col++) {
    const header = headers[col]
    if (header && typeof header === 'string') {
      const match = header.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-25$/i)
      if (match) {
        monthIndices[MONTH_MAP[match[1]]] = col
      }
    }
  }

  // Parse data rows
  for (let i = headerRowIdx + 1; i < data.length; i++) {
    const row = data[i]
    if (!row) continue

    const clientName = row[0]
    if (!clientName || typeof clientName !== 'string' || clientName === 'Grand Total') continue

    // Get monthly values
    for (const [month, colIdx] of Object.entries(monthIndices)) {
      const amount = parseFloat(row[colIdx]) || 0

      if (amount !== 0) {
        records.push({
          client_name: clientName.trim(),
          fiscal_year: 2025,
          fiscal_month: parseInt(month),
          revenue_type: 'PS',
          amount_usd: Math.round(amount * 100) / 100,
          product: 'Professional Services',
          source_file: 'Nov 2025 Rev and COGS detail'
        })
      }
    }
  }

  return records
}

/**
 * Parse Software/License Revenue sheet
 */
function parseSoftwareRevenue(wb) {
  const sheet = wb.Sheets['APAC Upfront Rev']
  if (!sheet) return []

  const data = xlsx.utils.sheet_to_json(sheet, { header: 1 })
  const records = []

  // Find header row (contains 'Customer Name' and month columns)
  let headerRowIdx = -1
  for (let i = 0; i < data.length; i++) {
    if (data[i] && data[i].includes('Customer Name')) {
      headerRowIdx = i
      break
    }
  }

  if (headerRowIdx === -1) {
    console.log('  ⚠️  Could not find header row in APAC Upfront Rev')
    return []
  }

  const headers = data[headerRowIdx]
  const customerNameIdx = headers.indexOf('Customer Name')

  // Find month column indices
  const monthIndices = {}
  for (let col = 0; col < headers.length; col++) {
    const header = headers[col]
    if (header && typeof header === 'string') {
      const match = header.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-25$/i)
      if (match) {
        monthIndices[MONTH_MAP[match[1]]] = col
      }
    }
  }

  // Parse data rows
  for (let i = headerRowIdx + 1; i < data.length; i++) {
    const row = data[i]
    if (!row) continue

    const clientName = row[customerNameIdx]
    if (!clientName || typeof clientName !== 'string' || clientName === 'Grand Total') continue

    // Get monthly values
    for (const [month, colIdx] of Object.entries(monthIndices)) {
      const amount = parseFloat(row[colIdx]) || 0

      if (amount !== 0) {
        records.push({
          client_name: clientName.trim(),
          fiscal_year: 2025,
          fiscal_month: parseInt(month),
          revenue_type: 'SW',
          amount_usd: Math.round(amount * 100) / 100,
          product: 'Software License',
          source_file: 'Nov 2025 Rev and COGS detail'
        })
      }
    }
  }

  return records
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 Starting 2025 Monthly BURC Import\n')

  // Check if table exists and get current 2025 record count
  const { count: existingCount } = await supabase
    .from('burc_historical_revenue_detail')
    .select('*', { count: 'exact', head: true })
    .eq('fiscal_year', 2025)

  console.log(`📊 Existing 2025 records: ${existingCount || 0}\n`)

  const allRecords = []

  for (const file of FILES_TO_PROCESS) {
    console.log(`📁 Processing: ${path.basename(file.path)}`)

    if (!fs.existsSync(file.path)) {
      console.log(`  ❌ File not found: ${file.path}`)
      continue
    }

    const wb = xlsx.readFile(file.path)
    console.log(`  📋 Sheets: ${wb.SheetNames.join(', ')}`)

    // Parse each revenue type
    const supportRecords = parseSupportRevenue(wb)
    console.log(`  ✅ Support Revenue: ${supportRecords.length} records`)

    const psRecords = parsePSRevenue(wb)
    console.log(`  ✅ PS Revenue: ${psRecords.length} records`)

    const softwareRecords = parseSoftwareRevenue(wb)
    console.log(`  ✅ Software Revenue: ${softwareRecords.length} records`)

    allRecords.push(...supportRecords, ...psRecords, ...softwareRecords)
  }

  console.log(`\n📊 Total records to import: ${allRecords.length}`)

  if (allRecords.length === 0) {
    console.log('❌ No records to import')
    return
  }

  // Aggregate by client/month/type to avoid duplicates
  const aggregated = {}
  for (const record of allRecords) {
    const key = `${record.client_name}|${record.fiscal_month}|${record.revenue_type}`
    if (!aggregated[key]) {
      aggregated[key] = { ...record }
    } else {
      aggregated[key].amount_usd += record.amount_usd
    }
  }

  const finalRecords = Object.values(aggregated)
  console.log(`📊 Aggregated records: ${finalRecords.length}`)

  // Show sample records
  console.log('\n📋 Sample records:')
  for (const record of finalRecords.slice(0, 5)) {
    console.log(`  ${record.client_name} | ${record.fiscal_month}/${record.fiscal_year} | ${record.revenue_type} | $${record.amount_usd.toLocaleString()}`)
  }

  // Calculate totals by type
  const totals = finalRecords.reduce((acc, r) => {
    acc[r.revenue_type] = (acc[r.revenue_type] || 0) + r.amount_usd
    return acc
  }, {})

  console.log('\n💰 Totals by type:')
  for (const [type, total] of Object.entries(totals)) {
    console.log(`  ${type}: $${total.toLocaleString()}`)
  }
  console.log(`  TOTAL: $${Object.values(totals).reduce((a, b) => a + b, 0).toLocaleString()}`)

  // Ask for confirmation before importing
  console.log('\n⚠️  This will DELETE existing 2025 monthly data and INSERT new records.')
  console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...\n')

  await new Promise(resolve => setTimeout(resolve, 5000))

  // Delete existing 2025 records (keep annual summary if different source)
  console.log('🗑️  Deleting existing 2025 monthly records...')
  const { error: deleteError } = await supabase
    .from('burc_historical_revenue_detail')
    .delete()
    .eq('fiscal_year', 2025)
    .not('source_file', 'eq', '2025 APAC Performance.xlsx')

  if (deleteError) {
    console.error('❌ Delete error:', deleteError.message)
  }

  // Insert new records in batches
  console.log('📤 Inserting new records...')
  const batchSize = 100
  let inserted = 0

  for (let i = 0; i < finalRecords.length; i += batchSize) {
    const batch = finalRecords.slice(i, i + batchSize)
    const { error } = await supabase
      .from('burc_historical_revenue_detail')
      .insert(batch)

    if (error) {
      console.error(`❌ Insert error at batch ${Math.floor(i / batchSize)}:`, error.message)
    } else {
      inserted += batch.length
      process.stdout.write(`\r  Inserted: ${inserted}/${finalRecords.length}`)
    }
  }

  console.log('\n\n✅ Import complete!')

  // Verify final count
  const { count: finalCount } = await supabase
    .from('burc_historical_revenue_detail')
    .select('*', { count: 'exact', head: true })
    .eq('fiscal_year', 2025)

  console.log(`📊 Final 2025 record count: ${finalCount}`)
}

main().catch(console.error)
