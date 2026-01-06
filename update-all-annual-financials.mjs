#!/usr/bin/env node
/**
 * Update burc_annual_financials with all years
 * - FY2024-2026: Use source of truth values
 * - FY2019-2023: Use detail record totals (already deduplicated)
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
  2024: { gross_revenue: 29351719, source_file: '2024 APAC Performance.xlsx' },
  2025: { gross_revenue: 26344602.19, source_file: '2026 APAC Performance.xlsx' },
  2026: { gross_revenue: 33738278.35, source_file: '2026 APAC Performance.xlsx' },
}

async function updateAnnualFinancials() {
  console.log('📊 Updating burc_annual_financials with All Years')
  console.log('='.repeat(70))

  // Fetch detail totals for historical years
  const allRecords = []
  let page = 0
  const pageSize = 1000

  console.log('\n📥 Fetching detail records...')
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
  allRecords.forEach(r => {
    if (!detailTotals[r.fiscal_year]) detailTotals[r.fiscal_year] = 0
    detailTotals[r.fiscal_year] += r.amount_usd || 0
  })

  console.log('\n📊 Detail totals by year:')
  Object.entries(detailTotals)
    .sort(([a], [b]) => parseInt(a) - parseInt(b))
    .forEach(([year, total]) => {
      console.log(`  FY${year}: $${total.toLocaleString()}`)
    })

  // Build records to upsert
  const records = []

  // Historical years from detail data (FY2019-2023)
  for (const year of [2019, 2020, 2021, 2022, 2023]) {
    if (detailTotals[year]) {
      records.push({
        fiscal_year: year,
        gross_revenue: Math.round(detailTotals[year] * 100) / 100, // Round to 2 decimals
        source_file: 'burc_historical_revenue_detail (aggregated)',
      })
    }
  }

  // Source of truth years (FY2024-2026)
  for (const [year, data] of Object.entries(SOURCE_OF_TRUTH)) {
    records.push({
      fiscal_year: parseInt(year),
      gross_revenue: data.gross_revenue,
      source_file: data.source_file,
    })
  }

  console.log('\n📝 Upserting annual financials...')
  console.log('-'.repeat(70))

  for (const record of records) {
    const { error } = await supabase
      .from('burc_annual_financials')
      .upsert({
        ...record,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'fiscal_year' })

    if (error) {
      console.log(`  ❌ FY${record.fiscal_year}: ${error.message}`)
    } else {
      console.log(`  ✅ FY${record.fiscal_year}: $${record.gross_revenue.toLocaleString()} (${record.source_file})`)
    }
  }

  // Verify final state
  console.log('\n📊 Final burc_annual_financials:')
  console.log('-'.repeat(70))

  const { data: final } = await supabase
    .from('burc_annual_financials')
    .select('*')
    .order('fiscal_year')

  console.log('Year     | Gross Revenue        | Source')
  console.log('-'.repeat(70))
  final?.forEach(row => {
    console.log(
      `FY${row.fiscal_year}  | $${row.gross_revenue?.toLocaleString().padStart(18)} | ${row.source_file || 'N/A'}`
    )
  })

  // Calculate growth rates
  console.log('\n📈 Year-over-Year Growth:')
  console.log('-'.repeat(50))

  const sorted = final?.sort((a, b) => a.fiscal_year - b.fiscal_year) || []
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]
    const curr = sorted[i]
    if (prev.gross_revenue && curr.gross_revenue) {
      const growth = ((curr.gross_revenue - prev.gross_revenue) / prev.gross_revenue) * 100
      const arrow = growth >= 0 ? '📈' : '📉'
      console.log(`  FY${prev.fiscal_year} → FY${curr.fiscal_year}: ${arrow} ${growth >= 0 ? '+' : ''}${growth.toFixed(1)}%`)
    }
  }
}

updateAnnualFinancials().catch(console.error)
