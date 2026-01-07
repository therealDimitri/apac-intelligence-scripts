#!/usr/bin/env node
/**
 * Check for revenue data duplications and reconcile with 2026 Performance files
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function checkRevenueDuplications() {
  console.log('🔍 Revenue Data Reconciliation Check\n')
  console.log('='.repeat(60))

  // 1. Check burc_historical_revenue_detail summary by year
  console.log('\n📊 1. burc_historical_revenue_detail Summary by Year:')

  const { data: detailByYear, error: detailError } = await supabase.rpc('exec', {
    query: `
      SELECT
        fiscal_year,
        COUNT(*) as record_count,
        COUNT(DISTINCT client_name) as unique_clients,
        SUM(amount_usd) as total_revenue,
        COUNT(DISTINCT revenue_type) as revenue_types
      FROM burc_historical_revenue_detail
      WHERE fiscal_year BETWEEN 2019 AND 2026
      GROUP BY fiscal_year
      ORDER BY fiscal_year
    `
  })

  if (detailError) {
    console.error('Error fetching detail summary:', detailError.message)

    // Fallback: Direct query
    const { data: yearTotals } = await supabase
      .from('burc_historical_revenue_detail')
      .select('fiscal_year, amount_usd')

    if (yearTotals) {
      const byYear = {}
      yearTotals.forEach(row => {
        const year = row.fiscal_year
        if (!byYear[year]) {
          byYear[year] = { count: 0, total: 0 }
        }
        byYear[year].count++
        byYear[year].total += row.amount_usd || 0
      })

      console.log('\nYear     | Records | Total Revenue')
      console.log('-'.repeat(45))
      Object.entries(byYear)
        .sort(([a], [b]) => a - b)
        .forEach(([year, data]) => {
          console.log(`FY${year}  | ${data.count.toLocaleString().padStart(7)} | $${data.total.toLocaleString().padStart(12)}`)
        })
    }
  } else if (detailByYear) {
    console.log('\nYear     | Records | Clients | Revenue Types | Total Revenue')
    console.log('-'.repeat(65))
    detailByYear.forEach(row => {
      console.log(`FY${row.fiscal_year}  | ${row.record_count.toLocaleString().padStart(7)} | ${row.unique_clients.toLocaleString().padStart(7)} | ${row.revenue_types.toString().padStart(13)} | $${row.total_revenue?.toLocaleString().padStart(12) || 'N/A'}`)
    })
  }

  // 2. Check burc_annual_financials
  console.log('\n📊 2. burc_annual_financials (Forecast Source):')

  const { data: annualData, error: annualError } = await supabase
    .from('burc_annual_financials')
    .select('*')
    .order('fiscal_year')

  if (annualError) {
    console.error('Error:', annualError.message)
  } else if (annualData && annualData.length > 0) {
    console.log('\nYear     | Gross Revenue | EBITA | Source')
    console.log('-'.repeat(65))
    annualData.forEach(row => {
      console.log(`FY${row.fiscal_year}  | $${row.gross_revenue?.toLocaleString().padStart(12) || 'N/A'} | $${row.ebita?.toLocaleString().padStart(10) || 'N/A'} | ${row.source_file || 'Unknown'}`)
    })
  } else {
    console.log('No data in burc_annual_financials')
  }

  // 3. Check for duplicate records in burc_historical_revenue_detail
  console.log('\n📊 3. Checking for Duplicate Records:')

  // Get all records for 2025-2026 to check
  const { data: allRecords } = await supabase
    .from('burc_historical_revenue_detail')
    .select('id, client_name, fiscal_year, revenue_type, amount_usd, import_batch_id, source_file')
    .in('fiscal_year', [2025, 2026])
    .order('fiscal_year')
    .order('client_name')
    .limit(500)

  if (allRecords) {
    // Group by client + year + revenue_type to find potential duplicates
    const grouped = {}
    allRecords.forEach(row => {
      const key = `${row.client_name}|${row.fiscal_year}|${row.revenue_type}`
      if (!grouped[key]) {
        grouped[key] = []
      }
      grouped[key].push(row)
    })

    // Find duplicates
    const duplicates = Object.entries(grouped)
      .filter(([, rows]) => rows.length > 1)

    if (duplicates.length > 0) {
      console.log(`\n⚠️  Found ${duplicates.length} potential duplicate groups:`)
      duplicates.slice(0, 10).forEach(([key, rows]) => {
        const [client, year, type] = key.split('|')
        console.log(`\n  Client: ${client}`)
        console.log(`  Year: FY${year}, Type: ${type}`)
        console.log(`  Records (${rows.length}):`)
        rows.forEach(r => {
          console.log(`    - ID: ${r.id.slice(0, 8)}... Amount: $${r.amount_usd?.toLocaleString() || 0} Source: ${r.source_file || 'Unknown'}`)
        })
      })

      if (duplicates.length > 10) {
        console.log(`\n  ... and ${duplicates.length - 10} more duplicate groups`)
      }
    } else {
      console.log('✅ No duplicate client+year+type combinations found')
    }
  }

  // 4. Check import batches
  console.log('\n📊 4. Import Batch Analysis:')

  const { data: batches } = await supabase
    .from('burc_historical_revenue_detail')
    .select('import_batch_id, source_file, fiscal_year')

  if (batches) {
    const batchSummary = {}
    batches.forEach(row => {
      const key = `${row.import_batch_id || 'null'}|${row.source_file || 'unknown'}`
      if (!batchSummary[key]) {
        batchSummary[key] = { count: 0, years: new Set() }
      }
      batchSummary[key].count++
      batchSummary[key].years.add(row.fiscal_year)
    })

    console.log('\nBatch ID | Source File | Records | Years')
    console.log('-'.repeat(80))
    Object.entries(batchSummary)
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 15)
      .forEach(([key, data]) => {
        const [batch, source] = key.split('|')
        const years = Array.from(data.years).sort().join(', ')
        console.log(`${(batch || 'N/A').slice(0, 8).padEnd(10)} | ${source.slice(0, 35).padEnd(37)} | ${data.count.toString().padStart(7)} | ${years}`)
      })
  }

  // 5. Sample records for FY2025 and FY2026
  console.log('\n📊 5. Sample Records for FY2025 & FY2026:')

  for (const year of [2025, 2026]) {
    const { data: samples } = await supabase
      .from('burc_historical_revenue_detail')
      .select('client_name, revenue_type, amount_usd, source_file')
      .eq('fiscal_year', year)
      .limit(5)

    if (samples && samples.length > 0) {
      console.log(`\n  FY${year} (first 5 records):`)
      samples.forEach(r => {
        console.log(`    ${r.client_name?.slice(0, 25).padEnd(27)} | ${(r.revenue_type || 'N/A').slice(0, 20).padEnd(22)} | $${r.amount_usd?.toLocaleString().padStart(10) || '0'}`)
      })
    } else {
      console.log(`\n  FY${year}: No records found`)
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log('✅ Reconciliation check complete')
}

checkRevenueDuplications().catch(console.error)
