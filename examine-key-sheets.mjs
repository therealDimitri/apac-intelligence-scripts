#!/usr/bin/env node
/**
 * Examine key financial sheets in 2026 APAC Performance.xlsx
 */

import XLSX from 'xlsx'

const filePath = '/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth/APAC Leadership Team - General/Performance/Financials/BURC/2026/2026 APAC Performance.xlsx'
const workbook = XLSX.readFile(filePath)

const fmt = (v) => {
  if (v === undefined || v === null || isNaN(v)) return ''
  if (Math.abs(v) >= 1000000) return '$' + (v/1000000).toFixed(2) + 'M'
  if (Math.abs(v) >= 1000) return '$' + (v/1000).toFixed(1) + 'K'
  return '$' + v.toFixed(0)
}

function printSheet(name, maxRows = 30) {
  console.log('\n' + '='.repeat(80))
  console.log(name)
  console.log('='.repeat(80))

  const sheet = workbook.Sheets[name]
  if (!sheet) {
    console.log('Sheet not found!')
    return
  }

  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 })
  data.slice(0, maxRows).forEach((row, i) => {
    if (row && row.length > 0) {
      const displayRow = row.slice(0, 10).map(c => {
        if (c === undefined || c === null) return ''
        if (typeof c === 'number') {
          const formatted = fmt(c)
          return formatted || String(c).substring(0, 12)
        }
        return String(c).substring(0, 18)
      })
      console.log(String(i).padStart(2) + ': ' + displayRow.join(' | '))
    }
  })
}

// Main summary sheet
printSheet('APAC BURC', 40)

// Pipeline/Risk data
printSheet('Dial 2 Risk Profile Summary', 30)

// Pivot summaries
printSheet('SW Pivot', 20)
printSheet('PS Pivot', 20)
printSheet('Maint Pivot', 20)

// Quarterly comparison
printSheet('26 vs 25 Q Comparison', 30)

// Attrition details
printSheet('Attrition', 20)

// Look at Rats and Mice (often contains pipeline detail)
printSheet('Rats and Mice Only', 30)
