#!/usr/bin/env node
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
  console.log('Checking burc_historical_revenue_detail table...\n')

  // Check burc_historical_revenue_detail
  const { count, error } = await supabase
    .from('burc_historical_revenue_detail')
    .select('*', { count: 'exact', head: true })

  if (error) {
    console.log('Error:', error.message)
  } else {
    console.log('burc_historical_revenue_detail count:', count)

    // Get year breakdown
    const { data: allData } = await supabase
      .from('burc_historical_revenue_detail')
      .select('fiscal_year, amount_usd')

    if (allData) {
      const byYear = {}
      allData.forEach(r => {
        const year = r.fiscal_year
        if (byYear[year] === undefined) byYear[year] = 0
        byYear[year] += r.amount_usd || 0
      })
      console.log('\nRevenue by Year:')
      Object.keys(byYear).sort().forEach(year => {
        const amt = byYear[year]
        console.log(`  ${year}: $${(amt / 1000000).toFixed(2)}M`)
      })

      // Total
      const total = Object.values(byYear).reduce((sum, val) => sum + val, 0)
      console.log(`  Total: $${(total / 1000000).toFixed(2)}M`)
    }

    // Sample data
    const { data: sample } = await supabase
      .from('burc_historical_revenue_detail')
      .select('*')
      .limit(3)

    console.log('\nSample data:')
    sample?.forEach(r => {
      console.log(`  ${r.client_name || r.customer_name || 'Unknown'} (${r.fiscal_year}): $${(r.amount_usd / 1000).toFixed(1)}K`)
    })
  }

  // Check client revenue table
  console.log('\n--- Checking burc_client_revenue ---')
  const { data: clientRev, error: clientRevError } = await supabase
    .from('burc_client_revenue')
    .select('*')
    .limit(5)

  if (clientRevError) {
    console.log('Error:', clientRevError.message)
  } else {
    console.log('Columns:', clientRev && clientRev.length > 0 ? Object.keys(clientRev[0]).join(', ') : 'none')
    console.log('Records:', clientRev?.length || 0)

    if (clientRev && clientRev.length > 0) {
      console.log('\nSample client revenue:')
      clientRev.forEach(c => {
        console.log(`  ${c.client_name}: 2024=$${((c.year_2024 || 0) / 1000).toFixed(1)}K, 2025=$${((c.year_2025 || 0) / 1000).toFixed(1)}K`)
      })
    }
  }
}

main().catch(console.error)
