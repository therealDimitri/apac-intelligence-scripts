#!/usr/bin/env node
/**
 * Analyze 2026 APAC Performance Excel file to understand data structure
 */

import XLSX from 'xlsx'
import path from 'path'
import { burcFile, requireOneDrive } from './lib/onedrive-paths.mjs'

requireOneDrive()

const filePath =
  burcFile(2026, 'Budget Planning/2026 APAC Performance.xlsx')

async function analyzeFile() {
  console.log('📊 Analyzing 2026 APAC Performance.xlsx')
  console.log('='.repeat(80))

  try {
    const workbook = XLSX.readFile(filePath)

    console.log('\nSheet Names:')
    workbook.SheetNames.forEach((name, idx) => {
      console.log(`  ${idx + 1}. ${name}`)
    })

    // Check for a summary or totals sheet
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 })

      if (data.length === 0) continue

      console.log(`\n\n📋 Sheet: "${sheetName}"`)
      console.log('-'.repeat(60))
      console.log(`Rows: ${data.length}`)

      // Show first 10 rows to understand structure
      console.log('\nFirst 10 rows:')
      data.slice(0, 10).forEach((row, idx) => {
        if (row && row.length > 0) {
          const preview = row
            .slice(0, 6)
            .map(cell => {
              if (cell === null || cell === undefined) return ''
              if (typeof cell === 'number') return cell.toLocaleString()
              return String(cell).slice(0, 25)
            })
            .join(' | ')
          console.log(`  ${idx}: ${preview}`)
        }
      })

      // Look for FY2025 or FY2026 data
      const jsonData = XLSX.utils.sheet_to_json(sheet)
      if (jsonData.length > 0) {
        console.log('\nColumn Headers:')
        const headers = Object.keys(jsonData[0])
        headers.forEach(h => console.log(`  - ${h}`))

        // Look for revenue totals
        const revenueColumns = headers.filter(
          h =>
            h.toLowerCase().includes('revenue') ||
            h.toLowerCase().includes('total') ||
            h.toLowerCase().includes('gross')
        )
        if (revenueColumns.length > 0) {
          console.log('\nRevenue-related columns found:')
          revenueColumns.forEach(col => {
            const total = jsonData.reduce((sum, row) => {
              const val = parseFloat(row[col]) || 0
              return sum + val
            }, 0)
            console.log(`  ${col}: $${total.toLocaleString()}`)
          })
        }
      }
    }
  } catch (error) {
    console.error('Error reading file:', error.message)
  }
}

analyzeFile().catch(console.error)
