#!/usr/bin/env node
/**
 * Read Critical BURC Source Files
 * Extracts key data from the most important BURC source files
 */

import XLSX from 'xlsx'
import fs from 'fs'
import { join } from 'path'

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

function printSheetSummary(workbook, sheetName, maxRows = 20) {
  const data = getSheetData(workbook, sheetName)
  if (!data || data.length === 0) {
    console.log(`  (Sheet "${sheetName}" is empty)`)
    return
  }

  console.log(`\n--- ${sheetName} (${data.length} rows) ---`)
  data.slice(0, maxRows).forEach((row, i) => {
    if (row && row.length > 0) {
      const displayRow = row.slice(0, 10).map(cell => {
        if (cell === undefined || cell === null) return ''
        if (typeof cell === 'number') {
          if (Math.abs(cell) > 10000) return formatCurrency(cell)
          if (Math.abs(cell) < 1) return (cell * 100).toFixed(1) + '%'
          return cell.toFixed(2)
        }
        return String(cell).substring(0, 25)
      })
      console.log(`  ${i}: ${displayRow.join(' | ')}`)
    }
  })
}

async function read2024EOYSummary() {
  console.log('\n' + '='.repeat(80))
  console.log('📊 2024 DEC EOY SUMMARY')
  console.log('='.repeat(80))

  const filePath = join(BURC_PATH, '2024', 'Dec', '2024 Dec EOY Summary.xlsx')
  const workbook = readExcelFile(filePath)
  if (!workbook) return

  console.log('Sheets:', workbook.SheetNames.join(', '))

  // Read first few sheets
  workbook.SheetNames.slice(0, 5).forEach(sheet => {
    printSheetSummary(workbook, sheet, 15)
  })
}

async function read2024RevAndCOGS() {
  console.log('\n' + '='.repeat(80))
  console.log('📊 2024 12 REV AND COGS ACTUALS')
  console.log('='.repeat(80))

  const filePath = join(BURC_PATH, '2024', 'Dec', '2024 12 Rev and COGS Actuals.xlsx')
  const workbook = readExcelFile(filePath)
  if (!workbook) return

  console.log('Sheets:', workbook.SheetNames.join(', '))

  // Read key sheets
  workbook.SheetNames.slice(0, 5).forEach(sheet => {
    printSheetSummary(workbook, sheet, 15)
  })
}

async function readARRTarget2025() {
  console.log('\n' + '='.repeat(80))
  console.log('📊 ARR TARGET 2025')
  console.log('='.repeat(80))

  const filePath = join(BURC_PATH, '2025', 'ARR Target 2025.xlsx')
  const workbook = readExcelFile(filePath)
  if (!workbook) return

  console.log('Sheets:', workbook.SheetNames.join(', '))

  workbook.SheetNames.forEach(sheet => {
    printSheetSummary(workbook, sheet, 20)
  })
}

async function read2025FinancialPlan() {
  console.log('\n' + '='.repeat(80))
  console.log('📊 2025 FINANCIAL PLAN')
  console.log('='.repeat(80))

  const filePath = join(BURC_PATH, '2025', '2025 Financial Plan.xlsx')
  const workbook = readExcelFile(filePath)
  if (!workbook) return

  console.log('Sheets:', workbook.SheetNames.join(', '))

  workbook.SheetNames.slice(0, 5).forEach(sheet => {
    printSheetSummary(workbook, sheet, 15)
  })
}

async function readEBITAGAPAnalysis() {
  console.log('\n' + '='.repeat(80))
  console.log('📊 APAC 3 YRS EBITA GAP ANALYSIS')
  console.log('='.repeat(80))

  const filePath = join(BURC_PATH, '2026', 'Budget Planning', 'APAC 3 yrs EBITA GAP Analysis.xlsx')
  const workbook = readExcelFile(filePath)
  if (!workbook) return

  console.log('Sheets:', workbook.SheetNames.join(', '))

  workbook.SheetNames.forEach(sheet => {
    printSheetSummary(workbook, sheet, 25)
  })
}

async function read2026BudgetGAP() {
  console.log('\n' + '='.repeat(80))
  console.log('📊 APAC 2026 BUDGET GAP VER3')
  console.log('='.repeat(80))

  const filePath = join(BURC_PATH, '2026', 'Budget Planning', 'APAC 2026 Budget GAP_ver3.xlsx')
  const workbook = readExcelFile(filePath)
  if (!workbook) return

  console.log('Sheets:', workbook.SheetNames.join(', '))

  workbook.SheetNames.slice(0, 5).forEach(sheet => {
    printSheetSummary(workbook, sheet, 20)
  })
}

async function readAUDRevenueSplit2025() {
  console.log('\n' + '='.repeat(80))
  console.log('📊 AUD REVENUE SPLIT 2025')
  console.log('='.repeat(80))

  const filePath = join(BURC_PATH, '2025', 'AUD Revenue Split 2025.xlsx')
  const workbook = readExcelFile(filePath)
  if (!workbook) return

  console.log('Sheets:', workbook.SheetNames.join(', '))

  workbook.SheetNames.forEach(sheet => {
    printSheetSummary(workbook, sheet, 20)
  })
}

async function readLatestBURCFile() {
  console.log('\n' + '='.repeat(80))
  console.log('📊 2025 11 BURC FILE FINAL (LATEST)')
  console.log('='.repeat(80))

  const filePath = join(BURC_PATH, '2025', 'Nov', '2025 11 BURC File FINAL.xlsb')
  const workbook = readExcelFile(filePath)
  if (!workbook) return

  console.log('Sheets:', workbook.SheetNames.slice(0, 30).join(', '))

  // Look for key sheets
  const keySheets = ['Summary', 'APAC', 'P&L', 'Revenue', 'EBITA', 'Waterfall', 'NRR', 'GRR', 'Pipeline', 'Attrition']

  for (const sheetName of workbook.SheetNames) {
    const matchesKey = keySheets.some(k => sheetName.toLowerCase().includes(k.toLowerCase()))
    if (matchesKey) {
      printSheetSummary(workbook, sheetName, 25)
    }
  }
}

async function readHistoricalProfitPL() {
  console.log('\n' + '='.repeat(80))
  console.log('📊 APAC 2021-2023 PROFIT P&L AND 2024 3Y PLAN')
  console.log('='.repeat(80))

  const filePath = join(BURC_PATH, '2026', 'Budget Planning', 'APAC 2021 - 2023 Profit PL and 2024 3YPlan_Draft4.xlsx')
  const workbook = readExcelFile(filePath)
  if (!workbook) return

  console.log('Sheets:', workbook.SheetNames.join(', '))

  workbook.SheetNames.forEach(sheet => {
    printSheetSummary(workbook, sheet, 20)
  })
}

async function read2024BURCFile() {
  console.log('\n' + '='.repeat(80))
  console.log('📊 2024 12 BURC FILE (DECEMBER 2024)')
  console.log('='.repeat(80))

  const filePath = join(BURC_PATH, '2024', 'Dec', '2024 12 BURC File.xlsb')
  const workbook = readExcelFile(filePath)
  if (!workbook) return

  console.log('Sheets:', workbook.SheetNames.slice(0, 30).join(', '))

  // Look for key sheets
  const keySheets = ['Summary', 'APAC', 'P&L', 'Revenue', 'EBITA', 'Waterfall', 'NRR', 'GRR', 'Pipeline', 'Dial', 'Risk']

  for (const sheetName of workbook.SheetNames) {
    const matchesKey = keySheets.some(k => sheetName.toLowerCase().includes(k.toLowerCase()))
    if (matchesKey) {
      printSheetSummary(workbook, sheetName, 20)
    }
  }
}

async function main() {
  console.log('🔍'.repeat(40))
  console.log('CRITICAL BURC SOURCE FILE ANALYSIS')
  console.log('Generated: ' + new Date().toLocaleString('en-AU'))
  console.log('🔍'.repeat(40))

  if (!fs.existsSync(BURC_PATH)) {
    console.log('❌ BURC source directory not found at:', BURC_PATH)
    process.exit(1)
  }

  try {
    await read2024EOYSummary()
    await read2024RevAndCOGS()
    await readARRTarget2025()
    await read2025FinancialPlan()
    await readAUDRevenueSplit2025()
    await readEBITAGAPAnalysis()
    await read2026BudgetGAP()
    await readHistoricalProfitPL()
    await read2024BURCFile()
    await readLatestBURCFile()

    console.log('\n' + '='.repeat(80))
    console.log('ANALYSIS COMPLETE')
    console.log('='.repeat(80))

  } catch (error) {
    console.error('\n❌ Analysis failed:', error.message)
    process.exit(1)
  }
}

main()
