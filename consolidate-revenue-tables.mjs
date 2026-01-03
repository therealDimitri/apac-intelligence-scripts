#!/usr/bin/env node
/**
 * Consolidate burc_historical_revenue from burc_historical_revenue_detail
 * Aggregates all client revenue by revenue_type and fiscal_year
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function main() {
  console.log('=== Consolidating Revenue Tables ===\n')

  // Get all data from detail table
  const { data: allData, error } = await supabase
    .from('burc_historical_revenue_detail')
    .select('client_name, revenue_type, fiscal_year, amount_usd')

  if (error) {
    console.log('Error fetching detail data:', error.message)
    return
  }

  console.log('Total detail records:', allData?.length || 0)

  // Aggregate by client, revenue_type, and year
  const aggregated = {}
  for (const r of allData || []) {
    const key = `${r.client_name}|${r.revenue_type}`
    if (!aggregated[key]) {
      aggregated[key] = {
        client_name: r.client_name,
        revenue_type: r.revenue_type,
        year_2019: 0,
        year_2020: 0,
        year_2021: 0,
        year_2022: 0,
        year_2023: 0,
        year_2024: 0,
        year_2025: 0,
        year_2026: 0
      }
    }
    const yearCol = `year_${r.fiscal_year}`
    if (aggregated[key][yearCol] !== undefined) {
      aggregated[key][yearCol] += r.amount_usd || 0
    }
  }

  const records = Object.values(aggregated)
  console.log('Aggregated records:', records.length)

  // Get unique clients
  const clients = [...new Set(records.map(r => r.client_name))]
  console.log('Unique clients:', clients.length)
  console.log('Clients:', clients.slice(0, 15).join(', '))

  // Show top records by 2024 revenue
  const sorted = [...records].sort((a, b) => b.year_2024 - a.year_2024)
  console.log('\nTop 10 by 2024 Revenue:')
  sorted.slice(0, 10).forEach(r => {
    console.log(`  ${r.client_name} (${r.revenue_type}): $${(r.year_2024/1000).toFixed(0)}K`)
  })

  // Total by year
  const totals = { 2023: 0, 2024: 0, 2025: 0 }
  records.forEach(r => {
    totals[2023] += r.year_2023
    totals[2024] += r.year_2024
    totals[2025] += r.year_2025
  })
  console.log('\nTotals from detail table:')
  console.log(`  2023: $${(totals[2023]/1000000).toFixed(2)}M`)
  console.log(`  2024: $${(totals[2024]/1000000).toFixed(2)}M`)
  console.log(`  2025: $${(totals[2025]/1000000).toFixed(2)}M`)

  // Compare with current burc_historical_revenue
  console.log('\n=== Current burc_historical_revenue ===')
  const { data: current } = await supabase
    .from('burc_historical_revenue')
    .select('*')

  console.log('Records:', current?.length || 0)
  let currentTotal2024 = 0
  current?.forEach(r => {
    console.log(`  ${r.customer_name} (${r.revenue_type}): 2024=$${(r.year_2024/1000000).toFixed(2)}M`)
    currentTotal2024 += r.year_2024 || 0
  })
  console.log(`  Current Total 2024: $${(currentTotal2024/1000000).toFixed(2)}M`)

  // The detail table has much less data than the current table
  // This suggests the detail table is not the full source
  console.log('\n=== Analysis ===')
  console.log(`Detail table 2024 total: $${(totals[2024]/1000000).toFixed(2)}M`)
  console.log(`Historical revenue 2024: $${(currentTotal2024/1000000).toFixed(2)}M`)
  console.log(`Difference: $${((currentTotal2024 - totals[2024])/1000000).toFixed(2)}M`)

  if (totals[2024] < currentTotal2024 * 0.5) {
    console.log('\n⚠️  Detail table has significantly less data than current table.')
    console.log('   The detail table appears to be a subset, not the full source.')
    console.log('   Keeping current burc_historical_revenue data.')
  }
}

main().catch(console.error)
