#!/usr/bin/env node
/**
 * BURC Source File Reconciliation Script
 * Reads Excel source files and compares with database
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import XLSX from 'xlsx'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const BURC_PATH = '/tmp/burc-source/BURC'

const formatCurrency = (value) => {
  if (!value || isNaN(value)) return '$0'
  if (Math.abs(value) >= 1000000) return `$${(value / 1000000).toFixed(2)}M`
  if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(1)}K`
  return `$${value.toFixed(0)}`
}

function readExcelFile(filePath) {
  try {
    const workbook = XLSX.readFile(filePath)
    return workbook
  } catch (error) {
    console.log(`❌ Error reading ${filePath}: ${error.message}`)
    return null
  }
}

function getSheetData(workbook, sheetName) {
  if (!workbook || !workbook.SheetNames.includes(sheetName)) {
    return null
  }
  const sheet = workbook.Sheets[sheetName]
  return XLSX.utils.sheet_to_json(sheet, { header: 1 })
}

async function reconcile2025Performance() {
  console.log('\n' + '='.repeat(80))
  console.log('2025 APAC PERFORMANCE RECONCILIATION')
  console.log('='.repeat(80))

  const filePath = join(BURC_PATH, '2025', '2025 APAC Performance.xlsx')
  const workbook = readExcelFile(filePath)

  if (!workbook) return

  console.log('\n📊 Sheet Names:', workbook.SheetNames.join(', '))

  // Look for key sheets
  const keySheets = ['Summary', 'P&L', 'Revenue', 'EBITA', 'Waterfall', 'NRR', 'Pipeline']

  for (const sheetName of workbook.SheetNames) {
    const matchesKey = keySheets.some(k => sheetName.toLowerCase().includes(k.toLowerCase()))
    if (matchesKey || workbook.SheetNames.indexOf(sheetName) < 5) {
      console.log(`\n--- Sheet: ${sheetName} ---`)
      const data = getSheetData(workbook, sheetName)
      if (data && data.length > 0) {
        // Show first 10 rows
        data.slice(0, 10).forEach((row, i) => {
          if (row && row.length > 0) {
            const displayRow = row.slice(0, 8).map(cell => {
              if (cell === undefined || cell === null) return ''
              if (typeof cell === 'number') {
                if (Math.abs(cell) > 10000) return formatCurrency(cell)
                return cell.toFixed(2)
              }
              return String(cell).substring(0, 20)
            })
            console.log(`  ${i}: ${displayRow.join(' | ')}`)
          }
        })
      }
    }
  }

  // Try to find specific data points
  console.log('\n📊 Searching for Key Metrics...')

  // Search all sheets for NRR/GRR
  for (const sheetName of workbook.SheetNames) {
    const data = getSheetData(workbook, sheetName)
    if (!data) continue

    for (let rowIdx = 0; rowIdx < Math.min(data.length, 100); rowIdx++) {
      const row = data[rowIdx]
      if (!row) continue

      for (let colIdx = 0; colIdx < row.length; colIdx++) {
        const cell = row[colIdx]
        if (typeof cell === 'string') {
          const cellLower = cell.toLowerCase()
          if (cellLower.includes('nrr') || cellLower.includes('net revenue retention')) {
            const valueCell = row[colIdx + 1] || data[rowIdx + 1]?.[colIdx]
            console.log(`  Found NRR in ${sheetName} row ${rowIdx}: ${cell} = ${valueCell}`)
          }
          if (cellLower.includes('grr') || cellLower.includes('gross revenue retention')) {
            const valueCell = row[colIdx + 1] || data[rowIdx + 1]?.[colIdx]
            console.log(`  Found GRR in ${sheetName} row ${rowIdx}: ${cell} = ${valueCell}`)
          }
          if (cellLower === 'ebita' || cellLower.includes('ebita %')) {
            const valueCell = row[colIdx + 1] || data[rowIdx + 1]?.[colIdx]
            console.log(`  Found EBITA in ${sheetName} row ${rowIdx}: ${cell} = ${valueCell}`)
          }
        }
      }
    }
  }
}

async function reconcile2026Performance() {
  console.log('\n' + '='.repeat(80))
  console.log('2026 APAC PERFORMANCE RECONCILIATION')
  console.log('='.repeat(80))

  const filePath = join(BURC_PATH, '2026', '2026 APAC Performance.xlsx')
  const workbook = readExcelFile(filePath)

  if (!workbook) return

  console.log('\n📊 Sheet Names:', workbook.SheetNames.join(', '))

  // Show first sheet structure
  const firstSheet = workbook.SheetNames[0]
  const data = getSheetData(workbook, firstSheet)

  if (data && data.length > 0) {
    console.log(`\n--- Sheet: ${firstSheet} (first 15 rows) ---`)
    data.slice(0, 15).forEach((row, i) => {
      if (row && row.length > 0) {
        const displayRow = row.slice(0, 10).map(cell => {
          if (cell === undefined || cell === null) return ''
          if (typeof cell === 'number') {
            if (Math.abs(cell) > 10000) return formatCurrency(cell)
            return cell.toFixed(2)
          }
          return String(cell).substring(0, 15)
        })
        console.log(`  ${i}: ${displayRow.join(' | ')}`)
      }
    })
  }
}

async function reconcileHistoricalRevenue() {
  console.log('\n' + '='.repeat(80))
  console.log('HISTORICAL REVENUE (2019-2024) RECONCILIATION')
  console.log('='.repeat(80))

  const filePath = join(BURC_PATH, 'APAC Revenue 2019 - 2024.xlsx')
  const workbook = readExcelFile(filePath)

  if (!workbook) return

  console.log('\n📊 Sheet Names:', workbook.SheetNames.join(', '))

  // Check each sheet for revenue data
  for (const sheetName of workbook.SheetNames.slice(0, 3)) {
    console.log(`\n--- Sheet: ${sheetName} ---`)
    const data = getSheetData(workbook, sheetName)

    if (data && data.length > 0) {
      // Look for year columns
      const headerRow = data.find(row => row && row.some(cell =>
        typeof cell === 'string' && (cell.includes('2024') || cell.includes('2025'))
      )) || data[0]

      if (headerRow) {
        console.log('  Headers:', headerRow.slice(0, 10).join(' | '))
      }

      // Show sample data
      data.slice(1, 8).forEach((row, i) => {
        if (row && row.length > 0) {
          const displayRow = row.slice(0, 8).map(cell => {
            if (cell === undefined || cell === null) return ''
            if (typeof cell === 'number') return formatCurrency(cell)
            return String(cell).substring(0, 20)
          })
          console.log(`  ${i + 1}: ${displayRow.join(' | ')}`)
        }
      })
    }
  }

  // Calculate totals by year
  console.log('\n📊 Calculating Year Totals from Source...')

  const summarySheet = workbook.SheetNames.find(s =>
    s.toLowerCase().includes('summary') || s.toLowerCase().includes('total')
  ) || workbook.SheetNames[0]

  const data = getSheetData(workbook, summarySheet)
  if (data) {
    // Find total row
    for (let i = 0; i < data.length; i++) {
      const row = data[i]
      if (row && row[0] && typeof row[0] === 'string') {
        if (row[0].toLowerCase().includes('total') || row[0].toLowerCase().includes('grand')) {
          console.log(`  Total row found at ${i}: ${row.slice(0, 8).join(' | ')}`)
        }
      }
    }
  }
}

async function reconcileCriticalSuppliers() {
  console.log('\n' + '='.repeat(80))
  console.log('CRITICAL SUPPLIERS RECONCILIATION')
  console.log('='.repeat(80))

  const filePath = join(BURC_PATH, '2025', 'Critical Supplier List APAC.xlsx')
  const workbook = readExcelFile(filePath)

  if (!workbook) return

  console.log('\n📊 Sheet Names:', workbook.SheetNames.join(', '))

  const data = getSheetData(workbook, workbook.SheetNames[0])
  if (data && data.length > 0) {
    console.log('\n--- Suppliers ---')
    console.log('  Headers:', data[0]?.slice(0, 6).join(' | '))

    data.slice(1, 15).forEach((row, i) => {
      if (row && row.length > 0) {
        const displayRow = row.slice(0, 6).map(cell => {
          if (cell === undefined || cell === null) return ''
          if (typeof cell === 'number') return formatCurrency(cell)
          return String(cell).substring(0, 25)
        })
        console.log(`  ${i + 1}: ${displayRow.join(' | ')}`)
      }
    })
  }

  // Compare with database
  const { data: dbSuppliers } = await supabase
    .from('burc_suppliers')
    .select('*')
    .limit(10)

  console.log(`\n📊 Database Suppliers: ${dbSuppliers?.length || 0} records`)
  if (dbSuppliers && dbSuppliers.length > 0) {
    dbSuppliers.forEach(s => {
      console.log(`  - ${s.vendor_name}: ${formatCurrency(s.annual_spend)} (${s.criticality})`)
    })
  }
}

async function compareWithDatabase() {
  console.log('\n' + '='.repeat(80))
  console.log('DATABASE COMPARISON SUMMARY')
  console.log('='.repeat(80))

  // Get database summary
  const { data: summary } = await supabase
    .from('burc_executive_summary')
    .select('*')
    .single()

  console.log('\n📊 Database Executive Summary:')
  console.log(`  NRR: ${summary?.nrr_percent}% (expected: 92.8%)`)
  console.log(`  GRR: ${summary?.grr_percent}% (expected: 72.2%)`)
  console.log(`  Total ARR: ${formatCurrency(summary?.total_arr)}`)
  console.log(`  Total Pipeline: ${formatCurrency(summary?.total_pipeline)}`)
  console.log(`  Weighted Pipeline: ${formatCurrency(summary?.weighted_pipeline)}`)
  console.log(`  Total At Risk: ${formatCurrency(summary?.total_at_risk)}`)
  console.log(`  EBITA Margin: ${summary?.ebita_margin_percent}%`)
  console.log(`  Rule of 40: ${summary?.rule_of_40_score} (${summary?.rule_of_40_status})`)

  // Get waterfall data
  const { data: waterfall } = await supabase
    .from('burc_waterfall')
    .select('category, amount')
    .order('sort_order')

  console.log('\n📊 Database Waterfall:')
  waterfall?.forEach(w => {
    console.log(`  ${w.category}: ${formatCurrency(w.amount)}`)
  })
}

async function main() {
  console.log('🔍'.repeat(40))
  console.log('BURC SOURCE FILE RECONCILIATION')
  console.log('Generated: ' + new Date().toLocaleString('en-AU'))
  console.log('🔍'.repeat(40))

  // Check if source files exist
  if (!fs.existsSync(BURC_PATH)) {
    console.log('❌ BURC source directory not found at:', BURC_PATH)
    console.log('   Please extract the BURC zip file first.')
    process.exit(1)
  }

  try {
    await reconcile2025Performance()
    await reconcile2026Performance()
    await reconcileHistoricalRevenue()
    await reconcileCriticalSuppliers()
    await compareWithDatabase()

    console.log('\n' + '='.repeat(80))
    console.log('RECONCILIATION COMPLETE')
    console.log('='.repeat(80))

  } catch (error) {
    console.error('\n❌ Reconciliation failed:', error.message)
    process.exit(1)
  }
}

main()
