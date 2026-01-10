#!/usr/bin/env node
/**
 * Comprehensive analysis of all sheets in 2026 APAC Performance.xlsx
 */

import XLSX from 'xlsx'

const filePath = '/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth/APAC Leadership Team - General/Performance/Financials/BURC/2026/2026 APAC Performance.xlsx'

const workbook = XLSX.readFile(filePath)

console.log('='.repeat(80))
console.log('COMPLETE SHEET ANALYSIS: 2026 APAC Performance.xlsx')
console.log('='.repeat(80))
console.log('Total Sheets:', workbook.SheetNames.length)
console.log('')

// Categorize sheets
const categories = {
  pipeline: [],
  revenue: [],
  waterfall: [],
  monthly: [],
  client: [],
  other: []
}

workbook.SheetNames.forEach((name, idx) => {
  const sheet = workbook.Sheets[name]
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 })
  const nonEmptyRows = data.filter(r => r && r.some(c => c !== undefined && c !== null && c !== '')).length

  // Get first row as potential headers
  const firstRow = data[0] || []
  const headers = firstRow.slice(0, 5).map(h => String(h || '').substring(0, 15)).join(' | ')

  const nameLower = name.toLowerCase()
  let category = 'other'
  if (nameLower.includes('pipeline') || nameLower.includes('oppty') || nameLower.includes('deal')) {
    category = 'pipeline'
  } else if (nameLower.includes('revenue') || nameLower.includes('arr') || nameLower.includes('booking')) {
    category = 'revenue'
  } else if (nameLower.includes('waterfall') || nameLower.includes('bridge')) {
    category = 'waterfall'
  } else if (nameLower.includes('month') || nameLower.includes('nr comp')) {
    category = 'monthly'
  } else if (nameLower.includes('client') || nameLower.includes('customer')) {
    category = 'client'
  }

  categories[category].push({ idx: idx + 1, name, rows: nonEmptyRows, headers })

  console.log('[' + String(idx + 1).padStart(2) + '] ' + name.padEnd(40) + ' (' + nonEmptyRows + ' rows)')
  if (headers) console.log('     ' + headers)
})

console.log('\n' + '='.repeat(80))
console.log('SHEETS BY CATEGORY')
console.log('='.repeat(80))

for (const [cat, sheets] of Object.entries(categories)) {
  if (sheets.length > 0) {
    console.log('\n### ' + cat.toUpperCase() + ' (' + sheets.length + ' sheets) ###')
    sheets.forEach(s => console.log('  - ' + s.name + ' (' + s.rows + ' rows)'))
  }
}

// Now let's look at pipeline sheets in detail
console.log('\n' + '='.repeat(80))
console.log('PIPELINE DATA DETAIL')
console.log('='.repeat(80))

const pipelineSheets = workbook.SheetNames.filter(n =>
  n.toLowerCase().includes('pipeline') ||
  n.toLowerCase().includes('oppty') ||
  n.toLowerCase().includes('deal') ||
  n.toLowerCase().includes('forecast')
)

pipelineSheets.forEach(sheetName => {
  console.log('\n### ' + sheetName + ' ###')
  const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 })

  // Print first 15 rows
  data.slice(0, 15).forEach((row, i) => {
    if (row && row.length > 0) {
      const displayRow = row.slice(0, 8).map(cell => {
        if (cell === undefined || cell === null) return ''
        if (typeof cell === 'number') {
          if (Math.abs(cell) >= 1000000) return '$' + (cell/1000000).toFixed(2) + 'M'
          if (Math.abs(cell) >= 1000) return '$' + (cell/1000).toFixed(1) + 'K'
          if (Math.abs(cell) < 1 && cell !== 0) return (cell * 100).toFixed(1) + '%'
          return cell.toFixed(0)
        }
        return String(cell).substring(0, 20)
      })
      console.log('  ' + i + ': ' + displayRow.join(' | '))
    }
  })
})

// Look for any sheets with significant numeric data
console.log('\n' + '='.repeat(80))
console.log('SHEETS WITH LARGE NUMERIC VALUES (potential financial data)')
console.log('='.repeat(80))

workbook.SheetNames.forEach(sheetName => {
  const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 })
  let maxValue = 0
  let hasLargeNumbers = false

  data.forEach(row => {
    if (row) {
      row.forEach(cell => {
        if (typeof cell === 'number' && Math.abs(cell) > 100000) {
          hasLargeNumbers = true
          if (Math.abs(cell) > maxValue) maxValue = Math.abs(cell)
        }
      })
    }
  })

  if (hasLargeNumbers) {
    console.log('  ' + sheetName.padEnd(40) + ' Max: $' + (maxValue/1000000).toFixed(2) + 'M')
  }
})
