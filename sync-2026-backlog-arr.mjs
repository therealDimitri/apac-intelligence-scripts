#!/usr/bin/env node
/**
 * Sync 2026 Backlog ARR Data
 *
 * Extracts Backlog (committed ARR) from 2026 APAC Performance.xlsx
 * and syncs to:
 * - burc_client_maintenance (for BURC dashboard)
 * - burc_historical_revenue_detail (for historical tracking)
 * - client_arr (for client profiles)
 */

import { createClient } from '@supabase/supabase-js'
import XLSX from 'xlsx'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import { BURC_MASTER_FILE, requireOneDrive } from './lib/onedrive-paths.mjs'

requireOneDrive()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

const BURC_FILE = BURC_MASTER_FILE

// Client name normalization map (BURC short names -> Full display names)
const CLIENT_NAME_MAP = {
  'SA Health': 'Minister for Health aka South Australia Health',
  'Sing Health': 'Singapore Health Services Pte Ltd',
  'SingHealth': 'Singapore Health Services Pte Ltd',
  'GHA': 'Gippsland Health Alliance',
  'GHRA': 'Gippsland Health Alliance',
  'WA Health': 'Western Australia Department Of Health',
  'SLMC': "St Luke's Medical Center Global City Inc",
  'NCS': 'Ministry of Defence, Singapore',
  'GRMC': 'GRMC (Guam Regional Medical Centre)',
  'MAH': 'Mount Alvernia Hospital',
  'EPH': 'Epworth Healthcare',
  'AWH': 'Albury Wodonga Health',
  'Waikato': 'Te Whatu Ora Waikato',
  'BWH': 'Barwon Health Australia',
  'Grampians': 'Grampians Health Alliance',
  'Western Health': 'Western Health',
}

function normalizeClientName(name) {
  if (!name) return null
  const trimmed = name.trim()
  return CLIENT_NAME_MAP[trimmed] || trimmed
}

function parseCurrency(value) {
  if (value === null || value === undefined || value === '') return 0
  if (typeof value === 'number') return value
  const cleaned = String(value).replace(/[$,\s]/g, '')
  const parsed = parseFloat(cleaned)
  return isNaN(parsed) ? 0 : parsed
}

async function main() {
  console.log('📊 Syncing 2026 Backlog ARR Data\n')

  if (!fs.existsSync(BURC_FILE)) {
    console.error('❌ File not found:', BURC_FILE)
    process.exit(1)
  }

  const workbook = XLSX.readFile(BURC_FILE)

  // Parse Maint sheet for client-level Backlog data
  const maintSheet = workbook.Sheets['Maint']
  if (!maintSheet) {
    console.error('❌ Maint sheet not found')
    process.exit(1)
  }

  const maintData = XLSX.utils.sheet_to_json(maintSheet, { header: 1, defval: '' })

  // Based on analysis:
  // Row 2 = Header: Notes, Quote No, Status, APAC Client, Solution, Project, Install Begin, Revenue USD...
  // Column 2 = Status (looking for "Backlog")
  // Column 3 = APAC Client
  // Column 4 = Solution
  // Column 7 = Revenue USD (annual amount)

  const STATUS_COL = 2
  const CLIENT_COL = 3
  const SOLUTION_COL = 4
  const REVENUE_COL = 7

  console.log('📋 Parsing Maint sheet with known structure:')
  console.log('   Status column: 2, Client column: 3, Revenue column: 7\n')

  // Extract Backlog amounts by client
  const clientBacklog = {}

  for (let i = 3; i < maintData.length; i++) { // Start from row 3 (after header)
    const row = maintData[i]
    if (!row) continue

    const status = String(row[STATUS_COL] || '').trim()
    if (status !== 'Backlog') continue

    const clientName = String(row[CLIENT_COL] || '').trim()
    if (!clientName || clientName === '') continue

    const normalizedClient = normalizeClientName(clientName)
    const solution = String(row[SOLUTION_COL] || '').trim()
    const revenueUSD = parseCurrency(row[REVENUE_COL])

    // Only include positive revenue (skip COGS-only rows and reversals)
    if (revenueUSD > 0) {
      if (!clientBacklog[normalizedClient]) {
        clientBacklog[normalizedClient] = { total: 0, products: [] }
      }
      clientBacklog[normalizedClient].total += revenueUSD
      clientBacklog[normalizedClient].products.push({ solution, revenue: revenueUSD })
    }
  }

  console.log('=== 2026 Backlog ARR by Client ===')
  const sortedClients = Object.entries(clientBacklog)
    .sort((a, b) => b[1].total - a[1].total)

  let grandTotal = 0
  for (const [client, data] of sortedClients) {
    console.log(`  ${client}: $${(data.total / 1000000).toFixed(2)}M`)
    grandTotal += data.total
  }
  console.log(`\n  TOTAL: $${(grandTotal / 1000000).toFixed(2)}M`)
  console.log(`  Clients: ${sortedClients.length}`)

  // Sync to burc_client_maintenance
  console.log('\n📤 Syncing to burc_client_maintenance...')

  const maintenanceRecords = sortedClients.map(([clientName, data]) => ({
    client_name: clientName,
    category: 'Backlog',
    annual_total: Math.round(data.total * 100) / 100,
  }))

  // Delete old Backlog records first
  const { error: deleteError } = await supabase
    .from('burc_client_maintenance')
    .delete()
    .eq('category', 'Backlog')

  if (deleteError) {
    console.log('   ⚠️ Delete error:', deleteError.message)
  }

  const { error: insertError } = await supabase
    .from('burc_client_maintenance')
    .insert(maintenanceRecords)

  if (insertError) {
    console.log('   ⚠️ Insert error:', insertError.message)
  } else {
    console.log(`   ✅ Synced ${maintenanceRecords.length} records`)
  }

  // Sync to burc_historical_revenue_detail (FY2026)
  console.log('\n📤 Syncing to burc_historical_revenue_detail...')

  const revenueRecords = sortedClients.map(([clientName, data]) => ({
    client_name: clientName,
    parent_company: 'ADHI',
    product: 'Maintenance',
    revenue_type: 'Maintenance Revenue',
    fiscal_year: 2026,
    amount_usd: Math.round(data.total * 100) / 100,
    amount_aud: 0,
    source_file: '2026 APAC Performance.xlsx',
    created_at: new Date().toISOString(),
  }))

  // Delete old 2026 records first
  const { error: revDeleteError } = await supabase
    .from('burc_historical_revenue_detail')
    .delete()
    .eq('fiscal_year', 2026)

  if (revDeleteError) {
    console.log('   ⚠️ Delete error:', revDeleteError.message)
  }

  const { error: revInsertError } = await supabase
    .from('burc_historical_revenue_detail')
    .insert(revenueRecords)

  if (revInsertError) {
    console.log('   ⚠️ Insert error:', revInsertError.message)
  } else {
    console.log(`   ✅ Synced ${revenueRecords.length} records`)
  }

  // Sync to client_arr
  console.log('\n📤 Syncing to client_arr...')

  // Get existing records to calculate growth
  const { data: existingArr } = await supabase
    .from('client_arr')
    .select('client_name, arr_usd')

  const existingMap = {}
  existingArr?.forEach(r => {
    existingMap[r.client_name] = r.arr_usd
  })

  // Delete existing records and insert new ones (no unique constraint)
  const clientArrRecords = sortedClients.map(([clientName, data]) => {
    const oldArr = existingMap[clientName] || 0
    const growthPct = oldArr > 0 ? Math.round((data.total - oldArr) / oldArr * 1000) / 10 : 0
    return {
      client_name: clientName,
      arr_usd: Math.round(data.total * 100) / 100,
      growth_percentage: growthPct,
      currency: 'USD',
      notes: `Updated from 2026 APAC Performance.xlsx (Backlog) - ${new Date().toISOString().split('T')[0]}`,
    }
  })

  // Delete then insert for clients we're updating
  for (const record of clientArrRecords) {
    await supabase.from('client_arr').delete().eq('client_name', record.client_name)
  }

  const { error: arrInsertError } = await supabase.from('client_arr').insert(clientArrRecords)

  if (arrInsertError) {
    console.log('   ⚠️ Insert error:', arrInsertError.message)
  } else {
    console.log(`   ✅ Updated ${clientArrRecords.length} client ARR records`)
  }

  console.log('\n✅ Sync complete!')
}

main().catch(console.error)
