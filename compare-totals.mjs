#!/usr/bin/env node
/**
 * Compare detail totals vs annual financials vs source files
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Source of truth values from Excel files
const SOURCE_OF_TRUTH = {
  2024: { value: 29351719, file: '2024 APAC Performance.xlsx' },
  2025: { value: 26344602.19, file: '2026 APAC Performance.xlsx' },
  2026: { value: 33738278.35, file: '2026 APAC Performance.xlsx' },
}

async function compare() {
  console.log('📊 Revenue Data Comparison: Detail vs Annual vs Source')
  console.log('='.repeat(80))

  // Fetch ALL detail records with pagination
  const allRecords = []
  let page = 0
  const pageSize = 1000

  while (true) {
    const { data, error } = await supabase
      .from('burc_historical_revenue_detail')
      .select('fiscal_year, amount_usd')
      .range(page * pageSize, (page + 1) * pageSize - 1)

    if (error || !data || data.length === 0) break
    allRecords.push(...data)
    page++
    if (data.length < pageSize) break
  }

  // Sum by year
  const detailTotals = {}
  const detailCounts = {}
  allRecords.forEach(r => {
    if (!detailTotals[r.fiscal_year]) {
      detailTotals[r.fiscal_year] = 0
      detailCounts[r.fiscal_year] = 0
    }
    detailTotals[r.fiscal_year] += r.amount_usd || 0
    detailCounts[r.fiscal_year]++
  })

  // Fetch annual financials
  const { data: annuals } = await supabase
    .from('burc_annual_financials')
    .select('*')
    .order('fiscal_year')

  const annualMap = {}
  annuals?.forEach(a => {
    annualMap[a.fiscal_year] = a.gross_revenue
  })

  // Build comparison table
  console.log('\n📋 Year-by-Year Comparison:')
  console.log('-'.repeat(100))
  console.log('Year     | Detail Records | Detail Total      | Annual Record     | Source Truth      | Status')
  console.log('-'.repeat(100))

  const allYears = [...new Set([
    ...Object.keys(detailTotals).map(Number),
    ...Object.keys(annualMap).map(Number),
    ...Object.keys(SOURCE_OF_TRUTH).map(Number)
  ])].sort((a, b) => a - b)

  allYears.forEach(year => {
    const detail = detailTotals[year] || 0
    const count = detailCounts[year] || 0
    const annual = annualMap[year] || 0
    const source = SOURCE_OF_TRUTH[year]?.value || 0

    let status = '✅ OK'
    if (source > 0 && Math.abs(detail - source) > 1000) {
      const pct = ((detail / source) * 100).toFixed(1)
      status = `❌ Detail=${pct}%`
    } else if (annual > 0 && Math.abs(detail - annual) > 1000) {
      const pct = ((detail / annual) * 100).toFixed(1)
      status = `⚠️  Detail=${pct}%`
    }

    console.log(
      `FY${year}  | ${count.toString().padStart(14)} | $${detail.toLocaleString().padStart(15)} | $${annual.toLocaleString().padStart(15)} | $${source.toLocaleString().padStart(15)} | ${status}`
    )
  })

  // Summary
  console.log('\n📋 Summary:')
  console.log('-'.repeat(80))

  const totalDetail = Object.values(detailTotals).reduce((a, b) => a + b, 0)
  const totalRecords = Object.values(detailCounts).reduce((a, b) => a + b, 0)
  console.log(`Total detail records: ${totalRecords.toLocaleString()}`)
  console.log(`Total detail revenue: $${totalDetail.toLocaleString()}`)

  console.log('\n📋 Key Issues:')
  allYears.forEach(year => {
    const detail = detailTotals[year] || 0
    const source = SOURCE_OF_TRUTH[year]?.value || 0
    const annual = annualMap[year] || 0

    if (source > 0) {
      const diff = source - detail
      if (Math.abs(diff) > 1000) {
        console.log(`  FY${year}: Detail records are $${diff.toLocaleString()} LESS than source (${SOURCE_OF_TRUTH[year].file})`)
      }
    } else if (annual > 0) {
      const diff = annual - detail
      if (Math.abs(diff) > 1000) {
        console.log(`  FY${year}: Detail records are $${diff.toLocaleString()} LESS than annual figure`)
      }
    }
  })
}

compare().catch(console.error)
