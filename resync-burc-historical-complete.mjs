#!/usr/bin/env node

/**
 * Re-sync BURC Historical Data - Complete Version
 *
 * Fixes the previous sync which only got 1,000 records due to pagination issues.
 * This script properly handles the full 84,901 records.
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

const ARCHIVE_PATH = '/tmp/burc-archive/BURC'
const BATCH_SIZE = 500

async function syncHistoricalRevenue() {
  console.log('\n📊 Syncing Historical Revenue Data...\n')

  const filePath = `${ARCHIVE_PATH}/APAC Revenue 2019 - 2024.xlsx`
  const workbook = xlsx.readFile(filePath)

  // Use the Data sheet with raw transactions
  const sheet = workbook.Sheets['Data']
  const data = xlsx.utils.sheet_to_json(sheet)

  console.log(`Found ${data.length} rows in Data sheet`)

  // First, clear existing data
  console.log('Clearing existing historical revenue data...')
  const { error: deleteError } = await supabase
    .from('burc_historical_revenue_detail')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all

  if (deleteError) {
    console.log('Delete error (may be empty table):', deleteError.message)
  }

  // Map columns - using actual column names from Excel
  // NOTE: The source file uses accounting convention where revenue is NEGATIVE (credits)
  // We negate the amounts to show positive revenue values in the dashboard
  const records = data.map(row => {
    const fiscalYear = row['Period Year']
    const periodNumber = row['Period Number']?.toString() || ''
    const fiscalMonth = periodNumber.length >= 6 ? parseInt(periodNumber.slice(-2)) : null
    const customerName = row['Customer Name']
    const parentCompany = row['Parent Company'] || null
    const revenueType = row['Altera PnL Rollup'] || row['Altera Rollup'] || 'Other'
    // Note: column name has spaces: ' In USD '
    // Negate amounts - accounting convention uses negative for revenue (credits)
    const rawAmountUsd = parseFloat(row[' In USD '] || row['Net Accounted Amount USD (Based On Average Month Rate)'] || 0)
    const rawAmountAud = parseFloat(row['Net Amount'] || 0)
    const product = row['Product Code'] || row['Altera Solutions'] || null

    return {
      fiscal_year: parseInt(fiscalYear) || null,
      fiscal_month: fiscalMonth,
      client_name: customerName || null,
      parent_company: parentCompany,
      revenue_type: revenueType,
      amount_usd: isNaN(rawAmountUsd) ? 0 : -rawAmountUsd, // Negate for positive revenue
      amount_aud: isNaN(rawAmountAud) ? 0 : -rawAmountAud, // Negate for positive revenue
      product: product
    }
  }).filter(r => r.fiscal_year && r.client_name)

  console.log(`Prepared ${records.length} valid records`)

  // Check year distribution
  const yearCounts = {}
  records.forEach(r => {
    yearCounts[r.fiscal_year] = (yearCounts[r.fiscal_year] || 0) + 1
  })
  console.log('Records by year:', yearCounts)

  // Insert in batches
  let inserted = 0
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE)

    const { error } = await supabase
      .from('burc_historical_revenue_detail')
      .insert(batch)

    if (error) {
      console.error(`Batch ${i / BATCH_SIZE + 1} error:`, error.message)
    } else {
      inserted += batch.length
      process.stdout.write(`\rInserted ${inserted}/${records.length} records...`)
    }
  }

  console.log(`\n✅ Synced ${inserted} historical revenue records`)
  return inserted
}

async function syncCriticalSuppliers() {
  console.log('\n🏢 Syncing Critical Suppliers...\n')

  const filePath = `${ARCHIVE_PATH}/2025/Critical Supplier List APAC.xlsx`

  try {
    const workbook = xlsx.readFile(filePath)
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const data = xlsx.utils.sheet_to_json(sheet)

    console.log(`Found ${data.length} suppliers`)
    console.log('Columns:', Object.keys(data[0] || {}))

    // Clear existing
    await supabase
      .from('burc_critical_suppliers')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')

    // Map columns - actual columns are just 'Vendor Name' and 'Critical Y/N?'
    const records = data.map(row => {
      const vendorName = row['Vendor Name']
      const isCritical = row['Critical Y/N?'] === 'Y'

      return {
        vendor_name: vendorName,
        vendor_category: null, // Not in source file
        criticality: isCritical ? 'Critical' : 'Medium',
        annual_spend: 0, // Not in source file - would need separate OPEX data
        contract_end_date: null,
        primary_contact: null,
        risk_assessment: isCritical ? 'High' : 'Low'
      }
    }).filter(r => r.vendor_name)

    // Show sample of what we're inserting
    console.log('Sample mapped record:', JSON.stringify(records[0], null, 2))

    // Insert all
    const { error, count } = await supabase
      .from('burc_critical_suppliers')
      .insert(records)
      .select('id', { count: 'exact' })

    if (error) {
      console.error('Supplier insert error:', error.message)
      return 0
    }

    console.log(`✅ Synced ${records.length} suppliers`)
    return records.length
  } catch (e) {
    console.error('Error reading supplier file:', e.message)
    return 0
  }
}

async function verifySyncResults() {
  console.log('\n📋 Verifying Sync Results...\n')

  // Check revenue records by year
  const { data: years } = await supabase
    .from('burc_historical_revenue_detail')
    .select('fiscal_year')

  const yearCounts = {}
  years?.forEach(r => {
    yearCounts[r.fiscal_year] = (yearCounts[r.fiscal_year] || 0) + 1
  })
  console.log('Revenue records by year:', yearCounts)
  console.log('Total revenue records:', years?.length || 0)

  // Check supplier records
  const { count: supplierCount } = await supabase
    .from('burc_critical_suppliers')
    .select('*', { count: 'exact', head: true })

  console.log('Supplier records:', supplierCount)

  // Sample supplier with spend
  const { data: sampleSuppliers } = await supabase
    .from('burc_critical_suppliers')
    .select('vendor_name, annual_spend, criticality')
    .gt('annual_spend', 0)
    .limit(5)

  console.log('Suppliers with spend:', sampleSuppliers)
}

async function main() {
  console.log('='.repeat(60))
  console.log('BURC Historical Data Re-Sync (Complete)')
  console.log('='.repeat(60))

  const revenueCount = await syncHistoricalRevenue()
  const supplierCount = await syncCriticalSuppliers()
  await verifySyncResults()

  console.log('\n' + '='.repeat(60))
  console.log('SYNC COMPLETE')
  console.log(`Revenue Records: ${revenueCount}`)
  console.log(`Supplier Records: ${supplierCount}`)
  console.log('='.repeat(60))
}

main().catch(console.error)
