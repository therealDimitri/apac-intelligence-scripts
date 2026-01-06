#!/usr/bin/env node
/**
 * Verify database data against source of truth files:
 * - 2024: 2024 APAC Performance.xlsx
 * - 2023: 2023 12 BURC File.xlsb
 * - 2025/2026: 2026 APAC Performance.xlsx
 */

import XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const SOURCE_FILES = {
  2023: '/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth/APAC Leadership Team - General/Performance/Financials/BURC/2023/Dec 23/2023 12 BURC File.xlsb',
  2024: '/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth/APAC Leadership Team - General/Performance/Financials/BURC/2024/2024 APAC Performance.xlsx',
  2025: '/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth/APAC Leadership Team - General/Performance/Financials/BURC/2026/Budget Planning/2026 APAC Performance.xlsx',
  2026: '/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth/APAC Leadership Team - General/Performance/Financials/BURC/2026/Budget Planning/2026 APAC Performance.xlsx',
}

async function analyzeSourceFile(year, filePath) {
  console.log(`\n📁 Analyzing FY${year} Source: ${filePath.split('/').pop()}`)
  console.log('-'.repeat(70))

  try {
    const workbook = XLSX.readFile(filePath)

    console.log('Sheets:', workbook.SheetNames.join(', '))

    // Look for summary/total data
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 })

      if (data.length === 0) continue

      // Look for revenue totals in first 50 rows
      for (let i = 0; i < Math.min(50, data.length); i++) {
        const row = data[i]
        if (!row) continue

        for (let j = 0; j < row.length; j++) {
          const cell = row[j]
          if (typeof cell === 'string') {
            const lower = cell.toLowerCase()
            if (
              lower.includes('total revenue') ||
              lower.includes('gross revenue') ||
              lower.includes('total gross') ||
              (lower.includes('fy') && lower.includes(year.toString()))
            ) {
              // Found a potential header, check adjacent cells for values
              const nextCell = row[j + 1]
              const belowCell = data[i + 1]?.[j]
              console.log(
                `  Found "${cell}" at row ${i + 1}, col ${j + 1}: next=${nextCell}, below=${belowCell}`
              )
            }
          }
        }
      }

      // Try to find year-specific data
      const jsonData = XLSX.utils.sheet_to_json(sheet)
      if (jsonData.length > 0) {
        const headers = Object.keys(jsonData[0])
        const yearCol = headers.find(h => h.includes(year.toString()) || h.includes(`FY${year}`))
        if (yearCol) {
          const total = jsonData.reduce((sum, row) => {
            const val = parseFloat(row[yearCol]) || 0
            return sum + val
          }, 0)
          if (total > 1000000) {
            console.log(`  ${sheetName} - ${yearCol}: $${total.toLocaleString()}`)
          }
        }
      }
    }
  } catch (error) {
    console.log(`  Error reading file: ${error.message}`)
  }
}

async function getDatabaseTotals() {
  console.log('\n📊 Database Totals (burc_historical_revenue_detail):')
  console.log('-'.repeat(70))

  const { data: records } = await supabase
    .from('burc_historical_revenue_detail')
    .select('fiscal_year, amount_usd')

  const byYear = {}
  records?.forEach(r => {
    if (!byYear[r.fiscal_year]) byYear[r.fiscal_year] = { count: 0, total: 0 }
    byYear[r.fiscal_year].count++
    byYear[r.fiscal_year].total += r.amount_usd || 0
  })

  console.log('Year     | Records | Detail Total')
  console.log('-'.repeat(50))
  Object.entries(byYear)
    .sort(([a], [b]) => parseInt(a) - parseInt(b))
    .forEach(([year, data]) => {
      console.log(
        `FY${year}  | ${data.count.toString().padStart(7)} | $${data.total.toLocaleString().padStart(15)}`
      )
    })

  // Also show burc_annual_financials
  console.log('\n📊 burc_annual_financials (Annual Totals):')
  console.log('-'.repeat(70))

  const { data: annuals } = await supabase
    .from('burc_annual_financials')
    .select('*')
    .order('fiscal_year')

  if (annuals && annuals.length > 0) {
    console.log('Year     | Gross Revenue    | Source File')
    console.log('-'.repeat(70))
    annuals.forEach(row => {
      console.log(
        `FY${row.fiscal_year}  | $${row.gross_revenue?.toLocaleString().padStart(15)} | ${row.source_file || 'N/A'}`
      )
    })
  }

  return { byYear, annuals }
}

async function main() {
  console.log('🔍 Source of Truth Verification')
  console.log('='.repeat(70))

  // Get database totals first
  const dbData = await getDatabaseTotals()

  // Analyze each source file
  for (const [year, path] of Object.entries(SOURCE_FILES)) {
    await analyzeSourceFile(parseInt(year), path)
  }

  console.log('\n\n📋 Summary & Recommendations:')
  console.log('='.repeat(70))

  const { byYear, annuals } = dbData

  for (const year of [2023, 2024, 2025, 2026]) {
    const detail = byYear[year]
    const annual = annuals?.find(a => a.fiscal_year === year)

    console.log(`\nFY${year}:`)
    console.log(`  Detail records: ${detail?.count || 0} totaling $${(detail?.total || 0).toLocaleString()}`)
    console.log(`  Annual record:  $${(annual?.gross_revenue || 0).toLocaleString()}`)

    if (detail && annual) {
      const diff = detail.total - annual.gross_revenue
      const pct = ((diff / annual.gross_revenue) * 100).toFixed(1)
      if (Math.abs(diff) < 100) {
        console.log(`  Status: ✅ Reconciled`)
      } else {
        console.log(`  Status: ❌ Discrepancy of $${diff.toLocaleString()} (${pct}%)`)
      }
    } else if (!detail || detail.count === 0) {
      console.log(`  Status: ⚠️  No detail records`)
    } else if (!annual) {
      console.log(`  Status: ⚠️  No annual record`)
    }
  }
}

main().catch(console.error)
