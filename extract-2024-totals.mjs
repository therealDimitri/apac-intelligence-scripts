#!/usr/bin/env node
/**
 * Extract FY2024 revenue totals from 2024 APAC Performance.xlsx source file
 */

import XLSX from 'xlsx'
import { burcFile, requireOneDrive } from './lib/onedrive-paths.mjs'

requireOneDrive()

const FILE_PATH =
  burcFile(2024, '2024 APAC Performance.xlsx')

async function extract() {
  console.log('📊 Extracting FY2024 Totals from Source File')
  console.log('='.repeat(70))
  console.log('File:', FILE_PATH.split('/').pop())
  console.log('')

  try {
    const workbook = XLSX.readFile(FILE_PATH)

    // Focus on the APAC BURC sheet which likely has the summary
    const targetSheets = ['APAC BURC', 'Summary', 'Total']
    const burcSheet = workbook.SheetNames.find(
      s => targetSheets.some(t => s.toLowerCase().includes(t.toLowerCase())) || s === 'APAC BURC'
    )

    console.log('Available sheets:', workbook.SheetNames.length)
    console.log('Target sheet:', burcSheet || 'Not found, will scan all')

    // Scan for revenue data
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })

      // Look for Total Gross Revenue row
      for (let i = 0; i < data.length; i++) {
        const row = data[i]
        if (!row) continue

        const rowStr = row.join(' ').toLowerCase()

        // Look for total gross revenue
        if (rowStr.includes('total gross revenue') || rowStr.includes('total revenue')) {
          console.log(`\n📋 Sheet: ${sheetName}, Row ${i + 1}:`)
          console.log('   Raw:', row.slice(0, 15).join(' | '))

          // Extract numeric values
          const values = row
            .filter(cell => typeof cell === 'number' && cell > 100000)
            .map(v => ({ value: v, formatted: '$' + v.toLocaleString() }))

          if (values.length > 0) {
            console.log('   Numeric values found:')
            values.forEach(v => console.log('     ' + v.formatted))
          }
        }

        // Also look for FY24 or 2024 columns with values
        if (
          rowStr.includes('fy24') ||
          rowStr.includes('fy 24') ||
          rowStr.includes('2024') ||
          rowStr.includes('full year')
        ) {
          const hasLargeValue = row.some(cell => typeof cell === 'number' && cell > 10000000)
          if (hasLargeValue) {
            console.log(`\n📋 Sheet: ${sheetName}, Row ${i + 1} (FY24 data):`)
            console.log('   Raw:', row.slice(0, 10).join(' | '))
          }
        }
      }
    }

    // Try to find specific revenue categories
    console.log('\n\n📊 Looking for revenue breakdown:')
    console.log('-'.repeat(70))

    const revenueCategories = [
      'licence',
      'license',
      'professional services',
      'maintenance',
      'hardware',
      'subscription',
    ]

    for (const sheetName of workbook.SheetNames.slice(0, 5)) {
      const sheet = workbook.Sheets[sheetName]
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })

      for (let i = 0; i < Math.min(50, data.length); i++) {
        const row = data[i]
        if (!row) continue

        const firstCell = String(row[0] || '').toLowerCase()
        if (revenueCategories.some(cat => firstCell.includes(cat))) {
          const values = row.filter(cell => typeof cell === 'number' && Math.abs(cell) > 100000)
          if (values.length > 0) {
            console.log(`${sheetName} Row ${i + 1}: ${row[0]} = $${values[0]?.toLocaleString() || 'N/A'}`)
          }
        }
      }
    }
  } catch (error) {
    console.error('Error:', error.message)
  }
}

extract().catch(console.error)
