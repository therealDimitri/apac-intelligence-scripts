#!/usr/bin/env node
/**
 * Check for duplicate records in FY2025 and verify against source data
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function checkDuplicates() {
  console.log('📊 FY2025 Duplicate Check & Data Verification')
  console.log('='.repeat(80))

  // Get all FY2025 records grouped by client_name and revenue_type
  const { data: records } = await supabase
    .from('burc_historical_revenue_detail')
    .select('client_name, revenue_type, amount_usd')
    .eq('fiscal_year', 2025)

  if (!records) {
    console.log('No records found')
    return
  }

  // Group by client + type
  const grouped = {}
  records.forEach(r => {
    const key = `${r.client_name}|${r.revenue_type}`
    if (!grouped[key]) {
      grouped[key] = []
    }
    grouped[key].push(r.amount_usd)
  })

  // Check for duplicates
  const duplicates = Object.entries(grouped).filter(([, amounts]) => amounts.length > 1)

  if (duplicates.length > 0) {
    console.log('\n⚠️  DUPLICATES FOUND:')
    duplicates.forEach(([key, amounts]) => {
      const [client, type] = key.split('|')
      console.log(`  ${client} - ${type}: ${amounts.length} records totaling $${amounts.reduce((a, b) => a + b, 0).toLocaleString()}`)
    })
  } else {
    console.log('\n✅ No duplicates found in FY2025')
  }

  // Summary by revenue type
  console.log('\n📊 FY2025 Summary by Revenue Type:')
  console.log('-'.repeat(60))

  const byType = {}
  records.forEach(r => {
    const type = r.revenue_type || 'Unknown'
    if (!byType[type]) {
      byType[type] = { count: 0, total: 0 }
    }
    byType[type].count++
    byType[type].total += r.amount_usd || 0
  })

  let grandTotal = 0
  Object.entries(byType)
    .sort(([, a], [, b]) => b.total - a.total)
    .forEach(([type, data]) => {
      console.log(`${type.padEnd(30)} | ${data.count.toString().padStart(3)} records | $${data.total.toLocaleString().padStart(15)}`)
      grandTotal += data.total
    })

  console.log('-'.repeat(60))
  console.log(`${'TOTAL'.padEnd(30)} | ${records.length.toString().padStart(3)} records | $${grandTotal.toLocaleString().padStart(15)}`)

  // Compare with burc_annual_financials
  console.log('\n\n📊 Annual Financials Comparison:')
  console.log('-'.repeat(60))

  const { data: annual } = await supabase
    .from('burc_annual_financials')
    .select('*')
    .eq('fiscal_year', 2025)
    .single()

  if (annual) {
    const diff = grandTotal - annual.gross_revenue
    console.log(`FY2025 Detail Total:     $${grandTotal.toLocaleString().padStart(15)}`)
    console.log(`FY2025 Annual Revenue:   $${annual.gross_revenue.toLocaleString().padStart(15)}`)
    console.log(`Difference:              $${diff.toLocaleString().padStart(15)} (${((diff / annual.gross_revenue) * 100).toFixed(1)}%)`)
    console.log(`Source File:             ${annual.source_file}`)

    if (Math.abs(diff) > 1000) {
      console.log('\n⚠️  WARNING: Significant discrepancy between detail and annual figures!')
      console.log('   Detail records are $' + Math.abs(diff).toLocaleString() + ' ' + (diff > 0 ? 'HIGHER' : 'LOWER'))
    }
  }

  // Check where FY2025 data came from by looking at similar patterns in other years
  console.log('\n\n📊 Cross-Year Client Comparison (same clients as FY2025):')
  console.log('-'.repeat(80))

  const fy2025Clients = [...new Set(records.map(r => r.client_name))]

  for (const client of fy2025Clients.slice(0, 5)) {
    console.log(`\n  ${client}:`)

    const { data: clientHistory } = await supabase
      .from('burc_historical_revenue_detail')
      .select('fiscal_year, revenue_type, amount_usd')
      .eq('client_name', client)
      .order('fiscal_year')

    if (clientHistory) {
      const byYear = {}
      clientHistory.forEach(r => {
        if (!byYear[r.fiscal_year]) {
          byYear[r.fiscal_year] = 0
        }
        byYear[r.fiscal_year] += r.amount_usd || 0
      })

      Object.entries(byYear)
        .sort(([a], [b]) => parseInt(a) - parseInt(b))
        .forEach(([year, total]) => {
          console.log(`    FY${year}: $${total.toLocaleString()}`)
        })
    }
  }
}

checkDuplicates().catch(console.error)
