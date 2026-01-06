#!/usr/bin/env node
/**
 * Clean up duplicate records in burc_historical_revenue_detail
 * Keep only ONE record per (client_name, fiscal_year, revenue_type, amount_usd) combination
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function cleanupDuplicates() {
  console.log('🧹 Cleaning Up Duplicate Records in burc_historical_revenue_detail')
  console.log('='.repeat(80))

  // Fetch all records
  const allRecords = []
  let page = 0
  const pageSize = 1000

  console.log('\n📥 Fetching all records...')
  while (true) {
    const { data, error } = await supabase
      .from('burc_historical_revenue_detail')
      .select('id, client_name, fiscal_year, revenue_type, amount_usd, parent_company')
      .range(page * pageSize, (page + 1) * pageSize - 1)

    if (error || !data || data.length === 0) break
    allRecords.push(...data)
    page++
    process.stdout.write(`\r  Fetched ${allRecords.length.toLocaleString()} records...`)
    if (data.length < pageSize) break
  }
  console.log(`\n  Total records: ${allRecords.length.toLocaleString()}`)

  // Group by (client_name, fiscal_year, revenue_type, amount_usd)
  const groups = {}
  allRecords.forEach(r => {
    const key = `${r.client_name}|${r.fiscal_year}|${r.revenue_type}|${r.amount_usd}`
    if (!groups[key]) groups[key] = []
    groups[key].push(r)
  })

  // Identify duplicates to delete (keep first, delete rest)
  const idsToDelete = []
  let duplicateGroups = 0

  Object.entries(groups).forEach(([key, records]) => {
    if (records.length > 1) {
      duplicateGroups++
      // Keep the first record, mark the rest for deletion
      records.slice(1).forEach(r => idsToDelete.push(r.id))
    }
  })

  console.log(`\n📊 Analysis:`)
  console.log(`  Unique combinations: ${Object.keys(groups).length.toLocaleString()}`)
  console.log(`  Duplicate groups: ${duplicateGroups.toLocaleString()}`)
  console.log(`  Records to delete: ${idsToDelete.length.toLocaleString()}`)
  console.log(`  Records to keep: ${(allRecords.length - idsToDelete.length).toLocaleString()}`)

  if (idsToDelete.length === 0) {
    console.log('\n✅ No duplicates found!')
    return
  }

  // Calculate totals before cleanup
  const totalsBefore = {}
  allRecords.forEach(r => {
    if (!totalsBefore[r.fiscal_year]) totalsBefore[r.fiscal_year] = 0
    totalsBefore[r.fiscal_year] += r.amount_usd || 0
  })

  // Calculate totals after cleanup (simulated)
  const keptRecords = allRecords.filter(r => !idsToDelete.includes(r.id))
  const totalsAfter = {}
  keptRecords.forEach(r => {
    if (!totalsAfter[r.fiscal_year]) totalsAfter[r.fiscal_year] = 0
    totalsAfter[r.fiscal_year] += r.amount_usd || 0
  })

  console.log('\n📊 Impact on Totals by Year:')
  console.log('-'.repeat(70))
  console.log('Year     | Before Cleanup    | After Cleanup     | Difference')
  console.log('-'.repeat(70))

  const years = [...new Set([...Object.keys(totalsBefore), ...Object.keys(totalsAfter)])].sort()
  years.forEach(year => {
    const before = totalsBefore[year] || 0
    const after = totalsAfter[year] || 0
    const diff = before - after
    console.log(
      `FY${year}  | $${before.toLocaleString().padStart(15)} | $${after.toLocaleString().padStart(15)} | $${diff.toLocaleString().padStart(15)}`
    )
  })

  // Delete in batches
  console.log(`\n🗑️  Deleting ${idsToDelete.length.toLocaleString()} duplicate records...`)
  const batchSize = 100
  let deleted = 0

  for (let i = 0; i < idsToDelete.length; i += batchSize) {
    const batch = idsToDelete.slice(i, i + batchSize)
    const { error } = await supabase
      .from('burc_historical_revenue_detail')
      .delete()
      .in('id', batch)

    if (error) {
      console.error(`Error deleting batch ${i}:`, error.message)
    } else {
      deleted += batch.length
      process.stdout.write(`\r  Deleted ${deleted.toLocaleString()} of ${idsToDelete.length.toLocaleString()} records...`)
    }
  }

  console.log(`\n\n✅ Cleanup complete!`)
  console.log(`  Deleted: ${deleted.toLocaleString()} duplicate records`)
  console.log(`  Remaining: ${(allRecords.length - deleted).toLocaleString()} unique records`)

  // Verify final totals
  console.log('\n📊 Verifying Final Totals by Year:')
  console.log('-'.repeat(60))

  const { data: remaining } = await supabase
    .from('burc_historical_revenue_detail')
    .select('fiscal_year, amount_usd')

  const finalTotals = {}
  const finalCounts = {}
  remaining?.forEach(r => {
    if (!finalTotals[r.fiscal_year]) {
      finalTotals[r.fiscal_year] = 0
      finalCounts[r.fiscal_year] = 0
    }
    finalTotals[r.fiscal_year] += r.amount_usd || 0
    finalCounts[r.fiscal_year]++
  })

  console.log('Year     | Records | Total Revenue')
  console.log('-'.repeat(60))
  Object.entries(finalTotals)
    .sort(([a], [b]) => parseInt(a) - parseInt(b))
    .forEach(([year, total]) => {
      console.log(
        `FY${year}  | ${finalCounts[year].toString().padStart(7)} | $${total.toLocaleString().padStart(15)}`
      )
    })
}

cleanupDuplicates().catch(console.error)
