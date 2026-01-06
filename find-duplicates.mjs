#!/usr/bin/env node
/**
 * Find duplicate records in burc_historical_revenue_detail
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function findDuplicates() {
  console.log('🔍 Searching for Duplicate Records in burc_historical_revenue_detail')
  console.log('='.repeat(80))

  // Fetch all records
  const allRecords = []
  let page = 0
  const pageSize = 1000

  while (true) {
    const { data, error } = await supabase
      .from('burc_historical_revenue_detail')
      .select('id, client_name, fiscal_year, revenue_type, amount_usd, parent_company')
      .range(page * pageSize, (page + 1) * pageSize - 1)

    if (error || !data || data.length === 0) break
    allRecords.push(...data)
    page++
    if (data.length < pageSize) break
  }

  console.log(`Total records fetched: ${allRecords.length.toLocaleString()}`)

  // Group by potential duplicate key: client_name + fiscal_year + revenue_type + amount_usd
  const byExactMatch = {}
  const byClientYearType = {}

  allRecords.forEach(r => {
    // Exact match (including amount)
    const exactKey = `${r.client_name}|${r.fiscal_year}|${r.revenue_type}|${r.amount_usd}`
    if (!byExactMatch[exactKey]) byExactMatch[exactKey] = []
    byExactMatch[exactKey].push(r)

    // By client+year+type (might have different amounts)
    const typeKey = `${r.client_name}|${r.fiscal_year}|${r.revenue_type}`
    if (!byClientYearType[typeKey]) byClientYearType[typeKey] = []
    byClientYearType[typeKey].push(r)
  })

  // Find exact duplicates
  const exactDupes = Object.entries(byExactMatch).filter(([, records]) => records.length > 1)

  console.log(`\n📋 Exact Duplicates (same client, year, type, AND amount):`)
  console.log('-'.repeat(80))

  if (exactDupes.length === 0) {
    console.log('None found')
  } else {
    console.log(`Found ${exactDupes.length} duplicate groups`)
    let totalDupeAmount = 0

    exactDupes.slice(0, 20).forEach(([key, records]) => {
      const [client, year, type, amount] = key.split('|')
      const dupeCount = records.length - 1 // Subtract 1 for the "original"
      const dupeAmount = parseFloat(amount) * dupeCount
      totalDupeAmount += dupeAmount

      console.log(`\n  ${client} | FY${year} | ${type}`)
      console.log(`  Amount: $${parseFloat(amount).toLocaleString()} x ${records.length} = $${(parseFloat(amount) * records.length).toLocaleString()}`)
      console.log(`  Record IDs: ${records.map(r => r.id.slice(0, 8)).join(', ')}`)
    })

    if (exactDupes.length > 20) {
      console.log(`\n  ... and ${exactDupes.length - 20} more duplicate groups`)
    }

    console.log(`\n  Total over-counted amount: $${totalDupeAmount.toLocaleString()}`)
  }

  // Find records with same client+year+type but different amounts
  const typeDupes = Object.entries(byClientYearType).filter(([, records]) => records.length > 1)

  console.log(`\n\n📋 Multiple Records per Client/Year/Type (may be legitimate):`)
  console.log('-'.repeat(80))
  console.log(`Found ${typeDupes.length} groups with multiple records`)

  // Show top 20 by total value
  const sorted = typeDupes
    .map(([key, records]) => ({
      key,
      records,
      total: records.reduce((sum, r) => sum + (r.amount_usd || 0), 0),
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 20)

  sorted.forEach(({ key, records, total }) => {
    const [client, year, type] = key.split('|')
    if (records.length > 2 || total > 1000000) {
      console.log(`\n  ${client} | FY${year} | ${type}`)
      console.log(`  ${records.length} records totaling $${total.toLocaleString()}`)
      records.forEach(r => {
        console.log(`    - $${(r.amount_usd || 0).toLocaleString()}`)
      })
    }
  })

  // Summary by year
  console.log('\n\n📊 Summary by Year:')
  console.log('-'.repeat(60))

  const byYear = {}
  allRecords.forEach(r => {
    if (!byYear[r.fiscal_year]) {
      byYear[r.fiscal_year] = { count: 0, total: 0, clients: new Set() }
    }
    byYear[r.fiscal_year].count++
    byYear[r.fiscal_year].total += r.amount_usd || 0
    byYear[r.fiscal_year].clients.add(r.client_name)
  })

  console.log('Year     | Records | Unique Clients | Total Revenue')
  console.log('-'.repeat(60))
  Object.entries(byYear)
    .sort(([a], [b]) => parseInt(a) - parseInt(b))
    .forEach(([year, data]) => {
      console.log(
        `FY${year}  | ${data.count.toString().padStart(7)} | ${data.clients.size.toString().padStart(14)} | $${data.total.toLocaleString().padStart(15)}`
      )
    })
}

findDuplicates().catch(console.error)
