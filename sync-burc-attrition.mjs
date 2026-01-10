#!/usr/bin/env node
/**
 * Sync BURC Attrition Data from Excel
 *
 * Reads the Attrition sheet from the BURC file and syncs to burc_attrition_risk table
 * Replaces hardcoded data with dynamic imports from the source Excel file
 *
 * Created: 2026-01-05
 */

import { createClient } from '@supabase/supabase-js'
import XLSX from 'xlsx'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// BURC file path - adjust to your OneDrive path
const BURC_PATHS = [
  '/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth/APAC Leadership Team - General/Performance/Financials/BURC/2026 APAC Performance.xlsx',
  '/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth/APAC Leadership Team - Performance/Financials/BURC/2026/Budget Planning/2026 APAC Performance.xlsx',
]

async function findBurcFile() {
  for (const filePath of BURC_PATHS) {
    if (fs.existsSync(filePath)) {
      console.log(`✅ Found BURC file: ${filePath}`)
      return filePath
    }
  }
  console.error('❌ BURC file not found in expected locations')
  process.exit(1)
}

async function syncAttritionData() {
  console.log('🔄 Starting BURC Attrition Data Sync...\n')

  const burcPath = await findBurcFile()

  // Read the BURC Excel file
  console.log('📖 Reading BURC Excel file...')
  const workbook = XLSX.readFile(burcPath)

  // List available sheets
  console.log('📋 Available sheets:', workbook.SheetNames.slice(0, 20).join(', '))

  // Find the Attrition sheet (may have different names)
  const attritionSheetName = workbook.SheetNames.find(name =>
    name.toLowerCase().includes('attrition') ||
    name.toLowerCase().includes('churn') ||
    name.toLowerCase().includes('risk')
  )

  if (!attritionSheetName) {
    console.error('❌ Attrition sheet not found. Available sheets:', workbook.SheetNames)
    process.exit(1)
  }

  console.log(`✅ Using sheet: "${attritionSheetName}"`)

  // Parse the sheet
  const sheet = workbook.Sheets[attritionSheetName]
  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 })

  if (rawData.length < 2) {
    console.error('❌ Sheet appears to be empty')
    process.exit(1)
  }

  // Log first few rows for debugging
  console.log('\n📊 Sheet preview (first 5 rows):')
  rawData.slice(0, 5).forEach((row, i) => {
    console.log(`  Row ${i}: ${JSON.stringify(row).slice(0, 150)}...`)
  })

  // Parse header row to find columns
  const header = rawData[0].map(h => String(h || '').toLowerCase().trim())
  console.log('\n📋 Headers:', header)

  // Find column indices
  const findColumn = (keywords) => {
    return header.findIndex(h => keywords.some(k => h.includes(k)))
  }

  const clientCol = findColumn(['client', 'customer', 'account', 'name'])
  const typeCol = findColumn(['type', 'risk type', 'category'])
  const forecastCol = findColumn(['forecast', 'date', 'exit'])
  const rev2025Col = findColumn(['2025', 'fy25', 'revenue 2025'])
  const rev2026Col = findColumn(['2026', 'fy26', 'revenue 2026'])
  const rev2027Col = findColumn(['2027', 'fy27', 'revenue 2027'])
  const rev2028Col = findColumn(['2028', 'fy28', 'revenue 2028'])
  const totalCol = findColumn(['total', 'at risk', 'impact'])
  const statusCol = findColumn(['status', 'state'])
  const notesCol = findColumn(['notes', 'comments', 'mitigation'])

  console.log(`\n📌 Column mapping:`)
  console.log(`  Client: col ${clientCol}`)
  console.log(`  Type: col ${typeCol}`)
  console.log(`  Forecast Date: col ${forecastCol}`)
  console.log(`  Revenue 2025: col ${rev2025Col}`)
  console.log(`  Revenue 2026: col ${rev2026Col}`)
  console.log(`  Total At Risk: col ${totalCol}`)
  console.log(`  Status: col ${statusCol}`)
  console.log(`  Notes: col ${notesCol}`)

  // Parse data rows
  const attritionRecords = []

  for (let i = 1; i < rawData.length; i++) {
    const row = rawData[i]
    if (!row || row.length === 0) continue

    const clientName = clientCol >= 0 ? String(row[clientCol] || '').trim() : ''
    if (!clientName || clientName.toLowerCase() === 'total') continue

    // Parse numeric values
    const parseNumber = (val) => {
      if (val === null || val === undefined || val === '') return 0
      const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/[,$]/g, ''))
      return isNaN(num) ? 0 : Math.abs(num)
    }

    // Parse date
    const parseDate = (val) => {
      if (!val) return null
      if (typeof val === 'number') {
        // Excel serial date
        const date = new Date((val - 25569) * 86400 * 1000)
        return date.toISOString().split('T')[0]
      }
      const date = new Date(val)
      return isNaN(date.getTime()) ? null : date.toISOString().split('T')[0]
    }

    const record = {
      client_name: clientName,
      risk_type: typeCol >= 0 ? String(row[typeCol] || 'Full').trim() : 'Full',
      forecast_date: forecastCol >= 0 ? parseDate(row[forecastCol]) : null,
      revenue_2025: rev2025Col >= 0 ? parseNumber(row[rev2025Col]) : 0,
      revenue_2026: rev2026Col >= 0 ? parseNumber(row[rev2026Col]) : 0,
      revenue_2027: rev2027Col >= 0 ? parseNumber(row[rev2027Col]) : 0,
      revenue_2028: rev2028Col >= 0 ? parseNumber(row[rev2028Col]) : 0,
      total_at_risk: totalCol >= 0 ? parseNumber(row[totalCol]) : 0,
      status: statusCol >= 0 ? String(row[statusCol] || 'open').toLowerCase().trim() : 'open',
      mitigation_notes: notesCol >= 0 ? String(row[notesCol] || '').trim() : '',
      snapshot_date: new Date().toISOString().split('T')[0],
    }

    // Calculate total if not provided
    if (record.total_at_risk === 0) {
      record.total_at_risk = record.revenue_2025 + record.revenue_2026 + record.revenue_2027 + record.revenue_2028
    }

    // Validate risk_type
    if (!['Full', 'Partial'].includes(record.risk_type)) {
      record.risk_type = record.risk_type.toLowerCase().includes('partial') ? 'Partial' : 'Full'
    }

    // Validate status
    const validStatuses = ['open', 'mitigated', 'churned', 'retained']
    if (!validStatuses.includes(record.status)) {
      record.status = 'open'
    }

    attritionRecords.push(record)
  }

  console.log(`\n✅ Parsed ${attritionRecords.length} attrition records`)

  if (attritionRecords.length === 0) {
    console.log('⚠️  No records found to sync')
    return
  }

  // Preview records
  console.log('\n📊 Records to sync:')
  attritionRecords.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.client_name} (${r.risk_type}) - $${(r.total_at_risk / 1000).toFixed(0)}K at risk`)
  })

  // Delete existing records and insert fresh data
  console.log('\n💾 Syncing to Supabase...')

  // First, delete existing records for today's snapshot
  const today = new Date().toISOString().split('T')[0]
  console.log(`  🗑️  Clearing existing records for snapshot date: ${today}`)

  const { error: deleteError } = await supabase
    .from('burc_attrition_risk')
    .delete()
    .eq('snapshot_date', today)

  if (deleteError) {
    console.warn(`  ⚠️  Delete warning: ${deleteError.message}`)
  }

  // Insert new records
  const { data, error } = await supabase
    .from('burc_attrition_risk')
    .insert(attritionRecords)
    .select()

  if (error) {
    console.error('❌ Error inserting to Supabase:', error.message)

    // Try inserting one by one if bulk fails
    console.log('\n🔄 Attempting individual inserts...')
    let successCount = 0
    let failCount = 0

    for (const record of attritionRecords) {
      const { error: singleError } = await supabase
        .from('burc_attrition_risk')
        .insert(record)

      if (singleError) {
        console.error(`  ❌ Failed: ${record.client_name} - ${singleError.message}`)
        failCount++
      } else {
        console.log(`  ✅ Inserted: ${record.client_name}`)
        successCount++
      }
    }

    console.log(`\n📊 Individual sync results: ${successCount} success, ${failCount} failed`)
  } else {
    console.log(`✅ Successfully inserted ${data?.length || attritionRecords.length} records`)
  }

  // Log sync to audit table
  const { error: auditError } = await supabase
    .from('burc_sync_audit')
    .insert({
      sync_id: crypto.randomUUID(),
      table_name: 'burc_attrition_risk',
      operation: 'sync',
      record_count: attritionRecords.length,
      records_inserted: attritionRecords.length,
      metadata: { source: burcPath, sheet: attritionSheetName }
    })

  if (auditError) {
    console.warn('⚠️  Failed to log sync audit:', auditError.message)
  }

  // Summary
  console.log('\n📊 Attrition Summary:')
  const totalAtRisk = attritionRecords.reduce((sum, r) => sum + r.total_at_risk, 0)
  const rev2026 = attritionRecords.reduce((sum, r) => sum + r.revenue_2026, 0)
  console.log(`  Total records: ${attritionRecords.length}`)
  console.log(`  Total at risk: $${(totalAtRisk / 1000000).toFixed(2)}M`)
  console.log(`  2026 impact: $${(rev2026 / 1000000).toFixed(2)}M`)
  console.log(`  Open risks: ${attritionRecords.filter(r => r.status === 'open').length}`)
  console.log(`  Mitigated: ${attritionRecords.filter(r => r.status === 'mitigated').length}`)

  console.log('\n✅ BURC Attrition sync complete!')
}

syncAttritionData().catch(err => {
  console.error('❌ Fatal error:', err)
  process.exit(1)
})
