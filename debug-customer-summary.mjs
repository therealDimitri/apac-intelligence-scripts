#!/usr/bin/env node
/**
 * Debug the Customer Level Summary sheet structure
 */

import XLSX from 'xlsx'

const filePath = '/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth/APAC Leadership Team - General/Performance/Financials/BURC/APAC Revenue 2019 - 2024.xlsx'

console.log('='.repeat(80))
console.log('CUSTOMER LEVEL SUMMARY - DETAILED STRUCTURE')
console.log('='.repeat(80))

const workbook = XLSX.readFile(filePath)
const sheet = workbook.Sheets['Customer Level Summary']
const data = XLSX.utils.sheet_to_json(sheet, { header: 1 })

console.log('Total rows:', data.length)
console.log('\nFirst 50 rows (showing all columns):')
console.log('')

for (let i = 0; i < Math.min(50, data.length); i++) {
  const row = data[i]
  if (!row || row.length === 0) {
    console.log(`Row ${i}: [empty]`)
    continue
  }

  const displayRow = row.slice(0, 12).map((cell, idx) => {
    if (cell === undefined || cell === null) return ''
    if (typeof cell === 'number') {
      if (Math.abs(cell) >= 1000000) return (cell/1000000).toFixed(2) + 'M'
      if (Math.abs(cell) >= 1000) return (cell/1000).toFixed(1) + 'K'
      if (Math.abs(cell) < 10 && cell !== 0) return cell.toFixed(2)
      return String(cell).substring(0, 12)
    }
    return String(cell).substring(0, 20)
  })

  console.log(`Row ${String(i).padStart(2)}: ${displayRow.map((c, i) => `[${i}]${c}`).join(' | ')}`)
}

// Now let's look for the Sheet1 as well
console.log('\n' + '='.repeat(80))
console.log('SHEET1 - DETAILED STRUCTURE')
console.log('='.repeat(80))

const sheet1 = workbook.Sheets['Sheet1']
if (sheet1) {
  const data1 = XLSX.utils.sheet_to_json(sheet1, { header: 1 })
  console.log('Total rows:', data1.length)
  console.log('\nFirst 30 rows:')

  for (let i = 0; i < Math.min(30, data1.length); i++) {
    const row = data1[i]
    if (!row || row.length === 0) {
      console.log(`Row ${i}: [empty]`)
      continue
    }

    const displayRow = row.slice(0, 10).map((cell, idx) => {
      if (cell === undefined || cell === null) return ''
      if (typeof cell === 'number') {
        if (Math.abs(cell) >= 1000000) return '$' + (cell/1000000).toFixed(2) + 'M'
        if (Math.abs(cell) >= 1000) return '$' + (cell/1000).toFixed(1) + 'K'
        return '$' + cell.toFixed(0)
      }
      return String(cell).substring(0, 25)
    })

    console.log(`Row ${String(i).padStart(2)}: ${displayRow.join(' | ')}`)
  }
} else {
  console.log('Sheet1 not found')
}
