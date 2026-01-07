#!/usr/bin/env node
/**
 * Analyze FY2025 records in detail
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function analyzeFY2025() {
  // Get all FY2025 records
  const { data: records } = await supabase
    .from('burc_historical_revenue_detail')
    .select('*')
    .eq('fiscal_year', 2025)
    .order('amount_usd', { ascending: false })

  if (!records) {
    console.log('No FY2025 records found')
    return
  }

  console.log('📊 FY2025 Records Analysis')
  console.log('='.repeat(80))
  console.log('Total records:', records.length)
  console.log('')

  // Show all records
  console.log('All FY2025 Records:')
  console.log('-'.repeat(80))
  console.log(
    'Client Name'.padEnd(35) +
      ' | ' +
      'Revenue Type'.padEnd(25) +
      ' | ' +
      'Amount (USD)'.padStart(15)
  )
  console.log('-'.repeat(80))

  let total = 0
  records.forEach(r => {
    const amount = r.amount_usd || 0
    total += amount
    console.log(
      (r.client_name || 'Unknown').slice(0, 33).padEnd(35) +
        ' | ' +
        (r.revenue_type || 'Unknown').slice(0, 23).padEnd(25) +
        ' | ' +
        '$' +
        amount.toLocaleString().padStart(14)
    )
  })

  console.log('-'.repeat(80))
  console.log(
    'TOTAL'.padEnd(35) +
      ' | ' +
      ''.padEnd(25) +
      ' | $' +
      total.toLocaleString().padStart(14)
  )

  // Check source files
  console.log('\n\nSource Files:')
  const sources = [...new Set(records.map(r => r.source_file).filter(Boolean))]
  if (sources.length > 0) {
    sources.forEach(s => console.log('  -', s))
  } else {
    console.log('  (No source files recorded)')
  }

  // Check import batches
  console.log('\nImport Batch IDs:')
  const batches = [...new Set(records.map(r => r.import_batch_id).filter(Boolean))]
  if (batches.length > 0) {
    batches.forEach(b => console.log('  -', b))
  } else {
    console.log('  (No import batch IDs recorded)')
  }

  // Compare with burc_annual_financials
  console.log('\n\n📊 Comparison with burc_annual_financials:')
  console.log('-'.repeat(80))

  const { data: annualData } = await supabase
    .from('burc_annual_financials')
    .select('*')
    .in('fiscal_year', [2024, 2025, 2026])
    .order('fiscal_year')

  if (annualData && annualData.length > 0) {
    console.log('Year     | Gross Revenue (Annual) | Detail Total   | Difference')
    console.log('-'.repeat(80))
    for (const annual of annualData) {
      // Get detail total for this year
      const { data: detailData } = await supabase
        .from('burc_historical_revenue_detail')
        .select('amount_usd')
        .eq('fiscal_year', annual.fiscal_year)

      const detailTotal = detailData?.reduce((sum, r) => sum + (r.amount_usd || 0), 0) || 0
      const diff = annual.gross_revenue - detailTotal
      const pctDiff = annual.gross_revenue > 0 ? ((diff / annual.gross_revenue) * 100).toFixed(1) : 'N/A'

      console.log(
        `FY${annual.fiscal_year}  | $${annual.gross_revenue?.toLocaleString().padStart(18)} | $${detailTotal.toLocaleString().padStart(12)} | $${diff.toLocaleString().padStart(12)} (${pctDiff}%)`
      )
    }
  }
}

analyzeFY2025().catch(console.error)
