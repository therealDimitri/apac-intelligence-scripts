#!/usr/bin/env node
/**
 * Deep extraction of FY2024 revenue data from 2024 APAC Performance.xlsx
 */

import XLSX from 'xlsx'

const FILE_PATH =
  '/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth/APAC Leadership Team - General/Performance/Financials/BURC/2024/2024 APAC Performance.xlsx'

async function extract() {
  console.log('📊 Deep Extraction - FY2024 Revenue Data')
  console.log('='.repeat(70))

  try {
    const workbook = XLSX.readFile(FILE_PATH)

    // Look at APAC BURC - Monthly GR Comp sheet (GR = Gross Revenue)
    const grSheet = workbook.Sheets['APAC BURC - Monthly GR Comp']
    if (grSheet) {
      console.log('\n📋 APAC BURC - Monthly GR Comp:')
      console.log('-'.repeat(70))

      const data = XLSX.utils.sheet_to_json(grSheet, { header: 1, defval: '' })

      // Show first 30 rows
      for (let i = 0; i < Math.min(30, data.length); i++) {
        const row = data[i]
        if (!row || row.every(c => c === '')) continue

        // Format row nicely
        const formatted = row
          .slice(0, 15)
          .map(c => {
            if (typeof c === 'number') {
              return c > 1000 ? '$' + Math.round(c).toLocaleString() : c.toString()
            }
            return String(c || '').slice(0, 20)
          })
          .join(' | ')

        console.log(`Row ${(i + 1).toString().padStart(2)}: ${formatted}`)
      }
    }

    // Look at APAC BURC sheet
    const burcSheet = workbook.Sheets['APAC BURC']
    if (burcSheet) {
      console.log('\n\n📋 APAC BURC (First 40 rows):')
      console.log('-'.repeat(70))

      const data = XLSX.utils.sheet_to_json(burcSheet, { header: 1, defval: '' })

      for (let i = 0; i < Math.min(40, data.length); i++) {
        const row = data[i]
        if (!row || row.every(c => c === '')) continue

        // Check if row has any large numbers (potential revenue)
        const hasRevenue = row.some(c => typeof c === 'number' && Math.abs(c) > 100000)

        const formatted = row
          .slice(0, 15)
          .map(c => {
            if (typeof c === 'number') {
              return c > 1000 ? '$' + Math.round(c).toLocaleString() : c.toString()
            }
            return String(c || '').slice(0, 18)
          })
          .join(' | ')

        if (hasRevenue || i < 10) {
          console.log(`Row ${(i + 1).toString().padStart(2)}: ${formatted}`)
        }
      }
    }

    // Look for FY24 Full Year column
    console.log('\n\n📋 Searching all sheets for FY24 Full Year totals:')
    console.log('-'.repeat(70))

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })

      // Find header row with FY columns
      let headerRow = -1
      let fyColIndex = -1

      for (let i = 0; i < Math.min(10, data.length); i++) {
        const row = data[i]
        if (!row) continue

        for (let j = 0; j < row.length; j++) {
          const cell = String(row[j] || '').toLowerCase()
          if (
            cell.includes('fy24 full') ||
            cell.includes('fy 24 full') ||
            cell.includes('full year') ||
            cell.includes('fy24 total')
          ) {
            headerRow = i
            fyColIndex = j
            break
          }
        }
        if (headerRow >= 0) break
      }

      if (headerRow >= 0 && fyColIndex >= 0) {
        console.log(`\n${sheetName}: Found FY24 column at row ${headerRow + 1}, col ${fyColIndex + 1}`)

        // Get values from that column
        for (let i = headerRow + 1; i < Math.min(headerRow + 30, data.length); i++) {
          const row = data[i]
          if (!row) continue

          const label = String(row[0] || '')
          const value = row[fyColIndex]

          if (typeof value === 'number' && Math.abs(value) > 100000) {
            console.log(`  ${label.slice(0, 40).padEnd(42)}: $${value.toLocaleString()}`)
          }
        }
      }
    }
  } catch (error) {
    console.error('Error:', error.message)
  }
}

extract().catch(console.error)
