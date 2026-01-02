#!/usr/bin/env node

/**
 * Refresh BURC Historical Cache
 *
 * Aggregates 85k+ historical revenue records into fast cache tables.
 * Run this after syncing new data or on a daily schedule.
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const PAGE_SIZE = 1000

/**
 * Fetch all records with pagination
 */
async function fetchAllRecords() {
  console.log('Fetching all historical records...')
  const allRecords = []
  let page = 0
  let hasMore = true

  while (hasMore) {
    const { data, error } = await supabase
      .from('burc_historical_revenue_detail')
      .select('fiscal_year, client_name, parent_company, revenue_type, amount_usd')
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (error) {
      console.error('Fetch error:', error.message)
      break
    }

    if (!data || data.length === 0) {
      hasMore = false
    } else {
      allRecords.push(...data)
      process.stdout.write(`\r  Fetched ${allRecords.length} records...`)
      if (data.length < PAGE_SIZE) hasMore = false
      else page++
    }
  }

  console.log(`\n  Total records: ${allRecords.length}`)
  return allRecords
}

/**
 * Aggregate and cache revenue trends
 */
async function cacheRevenueTrend(records) {
  console.log('\n📊 Caching revenue trends...')

  const yearlyData = {}

  records.forEach(row => {
    const year = row.fiscal_year
    if (!year) return

    if (!yearlyData[year]) {
      yearlyData[year] = { sw: 0, ps: 0, maint: 0, hw: 0, total: 0 }
    }

    const amount = row.amount_usd || 0
    const type = (row.revenue_type || '').toLowerCase()

    if (type.includes('sw') || type.includes('software') || type.includes('license')) {
      yearlyData[year].sw += amount
    } else if (type.includes('ps') || type.includes('professional') || type.includes('services')) {
      yearlyData[year].ps += amount
    } else if (type.includes('maint') || type.includes('support') || type.includes('subscription')) {
      yearlyData[year].maint += amount
    } else if (type.includes('hw') || type.includes('hardware')) {
      yearlyData[year].hw += amount
    }
    yearlyData[year].total += amount
  })

  // Calculate YoY growth
  const years = Object.keys(yearlyData).map(Number).sort()
  const cacheRecords = years.map((year, i) => {
    const data = yearlyData[year]
    const prevTotal = i > 0 ? yearlyData[years[i - 1]]?.total || 0 : 0
    const yoyGrowth = prevTotal > 0 ? ((data.total - prevTotal) / prevTotal) * 100 : 0

    return {
      fiscal_year: year,
      sw_revenue: Math.round(data.sw * 100) / 100,
      ps_revenue: Math.round(data.ps * 100) / 100,
      maint_revenue: Math.round(data.maint * 100) / 100,
      hw_revenue: Math.round(data.hw * 100) / 100,
      total_revenue: Math.round(data.total * 100) / 100,
      yoy_growth: Math.round(yoyGrowth * 10) / 10,
      cached_at: new Date().toISOString()
    }
  })

  // Clear and insert
  await supabase.from('burc_cache_revenue_trend').delete().neq('fiscal_year', 0)
  const { error } = await supabase.from('burc_cache_revenue_trend').insert(cacheRecords)

  if (error) {
    console.error('  Error caching trends:', error.message)
    return 0
  }

  console.log(`  ✓ Cached ${cacheRecords.length} year records`)
  cacheRecords.forEach(r => {
    console.log(`    ${r.fiscal_year}: $${(r.total_revenue / 1000000).toFixed(2)}M (${r.yoy_growth > 0 ? '+' : ''}${r.yoy_growth}%)`)
  })

  return cacheRecords.length
}

/**
 * Aggregate and cache client lifetime values
 */
async function cacheClientLifetime(records) {
  console.log('\n👥 Caching client lifetime values...')

  const clientData = {}

  records.forEach(row => {
    const client = row.client_name
    if (!client) return

    if (!clientData[client]) {
      clientData[client] = {
        parentCompany: row.parent_company,
        yearsActive: new Set(),
        totalRevenue: 0,
        byYear: {}
      }
    }

    const year = row.fiscal_year
    const amount = row.amount_usd || 0

    clientData[client].yearsActive.add(year)
    clientData[client].totalRevenue += amount
    clientData[client].byYear[year] = (clientData[client].byYear[year] || 0) + amount
  })

  const cacheRecords = Object.entries(clientData)
    .map(([name, data]) => ({
      client_name: name,
      parent_company: data.parentCompany,
      years_active: data.yearsActive.size,
      lifetime_revenue: Math.round(data.totalRevenue * 100) / 100,
      revenue_2019: Math.round((data.byYear[2019] || 0) * 100) / 100,
      revenue_2020: Math.round((data.byYear[2020] || 0) * 100) / 100,
      revenue_2021: Math.round((data.byYear[2021] || 0) * 100) / 100,
      revenue_2022: Math.round((data.byYear[2022] || 0) * 100) / 100,
      revenue_2023: Math.round((data.byYear[2023] || 0) * 100) / 100,
      revenue_2024: Math.round((data.byYear[2024] || 0) * 100) / 100,
      revenue_2025: Math.round((data.byYear[2025] || 0) * 100) / 100,
      yoy_growth: data.byYear[2024] && data.byYear[2023]
        ? Math.round((data.byYear[2024] - data.byYear[2023]) / data.byYear[2023] * 100)
        : 0,
      cached_at: new Date().toISOString()
    }))
    .sort((a, b) => b.lifetime_revenue - a.lifetime_revenue)

  // Clear and insert
  await supabase.from('burc_cache_client_lifetime').delete().neq('client_name', '')
  const { error } = await supabase.from('burc_cache_client_lifetime').insert(cacheRecords)

  if (error) {
    console.error('  Error caching clients:', error.message)
    return 0
  }

  console.log(`  ✓ Cached ${cacheRecords.length} client records`)
  console.log('  Top 5 clients:')
  cacheRecords.slice(0, 5).forEach(c => {
    console.log(`    ${c.client_name}: $${(c.lifetime_revenue / 1000000).toFixed(2)}M`)
  })

  return cacheRecords.length
}

/**
 * Aggregate and cache concentration metrics
 */
async function cacheConcentration(records) {
  console.log('\n📈 Caching concentration metrics...')

  const yearlyClientRevenue = {}

  records.forEach(row => {
    const year = row.fiscal_year
    const client = row.client_name
    if (!client || !year) return

    if (!yearlyClientRevenue[year]) {
      yearlyClientRevenue[year] = {}
    }
    yearlyClientRevenue[year][client] = (yearlyClientRevenue[year][client] || 0) + (row.amount_usd || 0)
  })

  const cacheRecords = Object.entries(yearlyClientRevenue)
    .map(([year, clients]) => {
      const sortedClients = Object.entries(clients).sort(([, a], [, b]) => b - a)
      const totalRevenue = sortedClients.reduce((sum, [, amount]) => sum + amount, 0)

      const top5Revenue = sortedClients.slice(0, 5).reduce((sum, [, amount]) => sum + amount, 0)
      const top10Revenue = sortedClients.slice(0, 10).reduce((sum, [, amount]) => sum + amount, 0)
      const top20Revenue = sortedClients.slice(0, 20).reduce((sum, [, amount]) => sum + amount, 0)

      // HHI calculation
      const hhi = sortedClients.reduce((sum, [, amount]) => {
        const share = amount / totalRevenue
        return sum + (share * share)
      }, 0) * 10000

      return {
        fiscal_year: parseInt(year),
        total_clients: sortedClients.length,
        total_revenue: Math.round(totalRevenue * 100) / 100,
        top5_percent: Math.round(top5Revenue / totalRevenue * 100),
        top10_percent: Math.round(top10Revenue / totalRevenue * 100),
        top20_percent: Math.round(top20Revenue / totalRevenue * 100),
        hhi: Math.round(hhi),
        risk_level: hhi > 2500 ? 'High' : hhi > 1500 ? 'Medium' : 'Low',
        cached_at: new Date().toISOString()
      }
    })
    .sort((a, b) => a.fiscal_year - b.fiscal_year)

  // Clear and insert
  await supabase.from('burc_cache_concentration').delete().neq('fiscal_year', 0)
  const { error } = await supabase.from('burc_cache_concentration').insert(cacheRecords)

  if (error) {
    console.error('  Error caching concentration:', error.message)
    return 0
  }

  console.log(`  ✓ Cached ${cacheRecords.length} concentration records`)
  return cacheRecords.length
}

/**
 * Aggregate and cache NRR/GRR metrics
 */
async function cacheNRR(records) {
  console.log('\n📉 Caching NRR/GRR metrics...')

  const clientYearlyRevenue = {}

  records.forEach(row => {
    const client = row.client_name
    if (!client) return

    if (!clientYearlyRevenue[client]) {
      clientYearlyRevenue[client] = {}
    }
    clientYearlyRevenue[client][row.fiscal_year] =
      (clientYearlyRevenue[client][row.fiscal_year] || 0) + (row.amount_usd || 0)
  })

  const cacheRecords = []

  for (let year = 2020; year <= 2025; year++) {
    let startingRevenue = 0
    let endingRevenue = 0
    let expansion = 0
    let contraction = 0
    let churn = 0
    let newBusiness = 0

    Object.entries(clientYearlyRevenue).forEach(([, yearlyData]) => {
      const priorYear = yearlyData[year - 1] || 0
      const currentYear = yearlyData[year] || 0

      if (priorYear > 0) {
        startingRevenue += priorYear
        if (currentYear === 0) {
          churn += priorYear
        } else if (currentYear > priorYear) {
          expansion += (currentYear - priorYear)
          endingRevenue += currentYear
        } else {
          contraction += (priorYear - currentYear)
          endingRevenue += currentYear
        }
      } else if (currentYear > 0) {
        newBusiness += currentYear
      }
    })

    const nrr = startingRevenue > 0 ? (endingRevenue / startingRevenue) * 100 : 0
    const grr = startingRevenue > 0
      ? ((startingRevenue - churn - contraction) / startingRevenue) * 100
      : 0

    cacheRecords.push({
      fiscal_year: year,
      nrr: Math.min(Math.round(nrr * 10) / 10, 200),
      grr: Math.max(Math.round(grr * 10) / 10, 0),
      expansion: Math.round(expansion * 100) / 100,
      contraction: Math.round(contraction * 100) / 100,
      churn: Math.round(churn * 100) / 100,
      new_business: Math.round(newBusiness * 100) / 100,
      cached_at: new Date().toISOString()
    })
  }

  // Clear and insert
  await supabase.from('burc_cache_nrr').delete().neq('fiscal_year', 0)
  const { error } = await supabase.from('burc_cache_nrr').insert(cacheRecords)

  if (error) {
    console.error('  Error caching NRR:', error.message)
    return 0
  }

  console.log(`  ✓ Cached ${cacheRecords.length} NRR records`)
  cacheRecords.forEach(r => {
    console.log(`    ${r.fiscal_year}: NRR ${r.nrr}%, GRR ${r.grr}%`)
  })

  return cacheRecords.length
}

/**
 * Update cache metadata
 */
async function updateMetadata(recordCount, totalRevenue) {
  console.log('\n📋 Updating cache metadata...')

  const metadata = {
    cache_key: 'burc_historical',
    last_refreshed: new Date().toISOString(),
    record_count: recordCount,
    total_revenue: totalRevenue,
    notes: 'Full cache refresh'
  }

  await supabase.from('burc_cache_metadata').delete().eq('cache_key', 'burc_historical')
  const { error } = await supabase.from('burc_cache_metadata').insert(metadata)

  if (error) {
    console.error('  Error updating metadata:', error.message)
  } else {
    console.log('  ✓ Metadata updated')
  }
}

async function main() {
  console.log('='.repeat(60))
  console.log('BURC Historical Cache Refresh')
  console.log('='.repeat(60))

  const startTime = Date.now()

  // Fetch all records
  const records = await fetchAllRecords()

  if (records.length === 0) {
    console.error('No records found. Aborting cache refresh.')
    return
  }

  // Aggregate and cache each view
  const trendCount = await cacheRevenueTrend(records)
  const clientCount = await cacheClientLifetime(records)
  const concentrationCount = await cacheConcentration(records)
  const nrrCount = await cacheNRR(records)

  // Calculate total revenue
  const totalRevenue = records.reduce((sum, r) => sum + (r.amount_usd || 0), 0)

  // Update metadata
  await updateMetadata(records.length, totalRevenue)

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

  console.log('\n' + '='.repeat(60))
  console.log('CACHE REFRESH COMPLETE')
  console.log('='.repeat(60))
  console.log(`Source records: ${records.length.toLocaleString()}`)
  console.log(`Total revenue: $${(totalRevenue / 1000000).toFixed(2)}M`)
  console.log(`Cached:`)
  console.log(`  - Revenue trends: ${trendCount} years`)
  console.log(`  - Client lifetime: ${clientCount} clients`)
  console.log(`  - Concentration: ${concentrationCount} years`)
  console.log(`  - NRR metrics: ${nrrCount} years`)
  console.log(`Time elapsed: ${elapsed}s`)
  console.log('='.repeat(60))
}

main().catch(console.error)
