#!/usr/bin/env node
/**
 * Comprehensive analysis of all BURC source files
 */

import XLSX from 'xlsx'
import fs from 'fs'

const BURC_PATH = '/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth/APAC Leadership Team - General/Performance/Financials/BURC'

const files = [
  { name: '2026 APAC Performance', path: `${BURC_PATH}/2026/2026 APAC Performance.xlsx` },
  { name: '2025 APAC Performance', path: `${BURC_PATH}/2025/2025 APAC Performance.xlsx` },
  { name: '2024 APAC Performance', path: `${BURC_PATH}/2024/2024 APAC Performance.xlsx` },
  { name: '2023 12 BURC File', path: `${BURC_PATH}/2023/Dec 23/2023 12 BURC File.xlsb` },
  { name: 'APAC Revenue 2019-2024', path: `${BURC_PATH}/APAC Revenue 2019 - 2024.xlsx` }
]

const fmt = (v) => {
  if (v === undefined || v === null || isNaN(v)) return ''
  if (Math.abs(v) >= 1000000) return '$' + (v/1000000).toFixed(2) + 'M'
  if (Math.abs(v) >= 1000) return '$' + (v/1000).toFixed(1) + 'K'
  return '$' + v.toFixed(0)
}

function analyzeFile(file) {
  console.log('\n' + '█'.repeat(80))
  console.log('FILE: ' + file.name)
  console.log('█'.repeat(80))

  if (!fs.existsSync(file.path)) {
    console.log('❌ File not found: ' + file.path)
    return null
  }

  const stats = fs.statSync(file.path)
  console.log('Size: ' + (stats.size / 1024 / 1024).toFixed(2) + ' MB')

  try {
    const workbook = XLSX.readFile(file.path)
    console.log('Sheets: ' + workbook.SheetNames.length)
    console.log('')

    const analysis = {
      name: file.name,
      sheets: [],
      financialSheets: [],
      pipelineSheets: [],
      clientSheets: []
    }

    workbook.SheetNames.forEach((sheetName, idx) => {
      const sheet = workbook.Sheets[sheetName]
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 })
      const nonEmptyRows = data.filter(r => r && r.some(c => c !== undefined && c !== null && c !== '')).length

      // Check for large numbers (financial data)
      let maxValue = 0
      let hasFinancialData = false
      data.forEach(row => {
        if (row) {
          row.forEach(cell => {
            if (typeof cell === 'number' && Math.abs(cell) > 10000) {
              hasFinancialData = true
              if (Math.abs(cell) > maxValue) maxValue = Math.abs(cell)
            }
          })
        }
      })

      const nameLower = sheetName.toLowerCase()
      const isPipeline = nameLower.includes('pipeline') || nameLower.includes('dial') || nameLower.includes('forecast') || nameLower.includes('risk')
      const isClient = nameLower.includes('client') || nameLower.includes('customer') || nameLower.includes('attrition')

      const sheetInfo = {
        name: sheetName,
        rows: nonEmptyRows,
        maxValue: maxValue,
        hasFinancialData: hasFinancialData,
        isPipeline: isPipeline,
        isClient: isClient
      }

      analysis.sheets.push(sheetInfo)

      if (hasFinancialData) analysis.financialSheets.push(sheetInfo)
      if (isPipeline) analysis.pipelineSheets.push(sheetInfo)
      if (isClient) analysis.clientSheets.push(sheetInfo)

      // Print sheet info
      const marker = hasFinancialData ? '💰' : (isPipeline ? '📊' : (isClient ? '👥' : '  '))
      console.log(`[${String(idx+1).padStart(2)}] ${marker} ${sheetName.padEnd(35)} (${nonEmptyRows} rows${maxValue > 0 ? ', max: ' + fmt(maxValue) : ''})`)
    })

    console.log('\n--- Summary ---')
    console.log('Total sheets: ' + analysis.sheets.length)
    console.log('Financial sheets: ' + analysis.financialSheets.length)
    console.log('Pipeline sheets: ' + analysis.pipelineSheets.length)
    console.log('Client sheets: ' + analysis.clientSheets.length)

    return analysis
  } catch (error) {
    console.log('❌ Error reading file: ' + error.message)
    return null
  }
}

function examineKeySheets(file, sheetNames, maxRows = 20) {
  console.log('\n' + '='.repeat(80))
  console.log('EXAMINING KEY SHEETS FROM: ' + file.name)
  console.log('='.repeat(80))

  if (!fs.existsSync(file.path)) return

  const workbook = XLSX.readFile(file.path)

  sheetNames.forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) {
      console.log('\n--- ' + sheetName + ' (NOT FOUND) ---')
      return
    }

    console.log('\n--- ' + sheetName + ' ---')
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 })

    data.slice(0, maxRows).forEach((row, i) => {
      if (row && row.length > 0) {
        const displayRow = row.slice(0, 8).map(c => {
          if (c === undefined || c === null) return ''
          if (typeof c === 'number') {
            const formatted = fmt(c)
            return formatted || String(c).substring(0, 10)
          }
          return String(c).substring(0, 15)
        })
        console.log(String(i).padStart(2) + ': ' + displayRow.join(' | '))
      }
    })
  })
}

async function main() {
  console.log('='.repeat(80))
  console.log('COMPREHENSIVE BURC SOURCE FILE ANALYSIS')
  console.log('Generated: ' + new Date().toLocaleString('en-AU'))
  console.log('='.repeat(80))

  const analyses = []

  for (const file of files) {
    const analysis = analyzeFile(file)
    if (analysis) analyses.push(analysis)
  }

  // Now examine key sheets from each file
  console.log('\n\n')
  console.log('█'.repeat(80))
  console.log('DETAILED SHEET EXAMINATION')
  console.log('█'.repeat(80))

  // 2025 key sheets
  examineKeySheets(files[1], ['APAC BURC', 'Dial 2 Risk Profile Summary', 'Waterfall Data', 'Attrition', 'PS Pivot', 'Maint Pivot'], 25)

  // 2024 key sheets
  examineKeySheets(files[2], ['APAC BURC', 'Pipeline', 'Attrition', 'Summary'], 25)

  // Historical revenue
  examineKeySheets(files[4], ['Sheet1', 'Revenue', 'Data'], 30)

  console.log('\n\n')
  console.log('='.repeat(80))
  console.log('ANALYSIS COMPLETE')
  console.log('='.repeat(80))
}

main().catch(console.error)
