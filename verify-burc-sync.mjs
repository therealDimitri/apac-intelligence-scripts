#!/usr/bin/env node
/**
 * Verify BURC data sync
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

const fmt = (v) => {
  if (v === undefined || v === null || isNaN(v)) return '$0'
  if (Math.abs(v) >= 1000000) return '$' + (v/1000000).toFixed(2) + 'M'
  if (Math.abs(v) >= 1000) return '$' + (v/1000).toFixed(1) + 'K'
  return '$' + v.toFixed(0)
}

async function verify() {
  console.log('='.repeat(70))
  console.log('BURC DATA VERIFICATION REPORT')
  console.log('Generated:', new Date().toLocaleString('en-AU'))
  console.log('='.repeat(70))

  // Check historical revenue
  const { data: revenue, error: revErr } = await supabase
    .from('burc_historical_revenue')
    .select('*')
    .order('customer_name')

  console.log('\n📊 HISTORICAL REVENUE:')
  if (revErr) {
    console.log('Error:', revErr.message)
  } else {
    console.log('Total records:', revenue.length)

    // Get unique customers
    const customers = [...new Set(revenue.map(r => r.customer_name))]
    console.log('Unique customers:', customers.length)

    // Calculate totals by year
    const totals = { 2019: 0, 2020: 0, 2021: 0, 2022: 0, 2023: 0, 2024: 0 }
    revenue.forEach(r => {
      totals[2019] += r.year_2019 || 0
      totals[2020] += r.year_2020 || 0
      totals[2021] += r.year_2021 || 0
      totals[2022] += r.year_2022 || 0
      totals[2023] += r.year_2023 || 0
      totals[2024] += r.year_2024 || 0
    })

    console.log('\nTotal Revenue by Year:')
    Object.entries(totals).forEach(([year, total]) => {
      console.log(`  ${year}: ${fmt(total)}`)
    })

    // Top customers by 2024 revenue
    const byCustomer = {}
    revenue.forEach(r => {
      if (!byCustomer[r.customer_name]) byCustomer[r.customer_name] = 0
      byCustomer[r.customer_name] += r.year_2024 || 0
    })

    console.log('\nTop 10 Customers by 2024 Revenue:')
    Object.entries(byCustomer)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([name, revenue]) => {
        console.log(`  ${name.substring(0, 35).padEnd(37)}: ${fmt(revenue)}`)
      })
  }

  // Check pipeline / business cases
  const { data: pipeline, error: pipeErr } = await supabase
    .from('burc_business_cases')
    .select('*')

  console.log('\n💼 BUSINESS CASES / PIPELINE:')
  if (pipeErr) {
    console.log('Error:', pipeErr.message)
  } else {
    console.log('Total records:', pipeline.length)

    // Group by category
    const byCategory = {}
    pipeline.forEach(p => {
      const cat = p.forecast_category || 'Unknown'
      if (!byCategory[cat]) byCategory[cat] = { count: 0, total: 0 }
      byCategory[cat].count++
      byCategory[cat].total += (p.estimated_sw_value || 0) + (p.estimated_ps_value || 0) + (p.estimated_maint_value || 0) + (p.estimated_hw_value || 0)
    })

    console.log('\nBy Forecast Category:')
    Object.entries(byCategory)
      .sort((a, b) => b[1].total - a[1].total)
      .forEach(([cat, data]) => {
        console.log(`  ${cat.padEnd(20)}: ${data.count} deals, ${fmt(data.total)}`)
      })

    // Sample some pipeline items
    console.log('\nSample Pipeline Items:')
    pipeline.slice(0, 5).forEach(p => {
      const total = (p.estimated_sw_value || 0) + (p.estimated_ps_value || 0) + (p.estimated_maint_value || 0) + (p.estimated_hw_value || 0)
      console.log(`  - ${(p.opportunity_name || 'N/A').substring(0, 40).padEnd(42)} ${(p.forecast_category || '').padEnd(12)} ${fmt(total)}`)
    })
  }

  // Check attrition
  const { data: attrition, error: attErr } = await supabase
    .from('burc_attrition_risk')
    .select('*')

  console.log('\n⚠️  ATTRITION RISKS:')
  if (attErr) {
    console.log('Error:', attErr.message)
  } else {
    console.log('Total records:', attrition.length)
    const totalAtRisk = attrition.reduce((sum, a) => sum + (a.total_at_risk || 0), 0)
    console.log('Total at risk:', fmt(totalAtRisk))

    attrition.forEach(a => {
      console.log(`  - ${(a.client_name || 'N/A').substring(0, 30).padEnd(32)} ${(a.risk_type || '').padEnd(10)} ${fmt(a.total_at_risk)}`)
    })
  }

  // Check ARR tracking
  const { data: arr, error: arrErr } = await supabase
    .from('burc_arr_tracking')
    .select('*')

  console.log('\n🎯 ARR TRACKING:')
  if (arrErr) {
    console.log('Error:', arrErr.message)
  } else {
    console.log('Total records:', arr.length)
    if (arr.length > 0) {
      console.log('Sample record:', JSON.stringify(arr[0], null, 2).substring(0, 300))
    }
  }

  // Check FX rates
  const { data: fx, error: fxErr } = await supabase
    .from('burc_fx_rates')
    .select('*')

  console.log('\n💱 FX RATES:')
  if (fxErr) {
    console.log('Error:', fxErr.message)
  } else {
    console.log('Total records:', fx.length)
    // Group by currency
    const byCurrency = {}
    fx.forEach(r => {
      const cur = r.currency || 'Unknown'
      if (!byCurrency[cur]) byCurrency[cur] = 0
      byCurrency[cur]++
    })
    console.log('By currency:', Object.entries(byCurrency).map(([c, n]) => `${c}: ${n}`).join(', '))
  }

  // Check Contracts
  const { data: contracts, error: contractErr } = await supabase
    .from('burc_contracts')
    .select('*')

  console.log('\n📋 CONTRACTS:')
  if (contractErr) {
    console.log('Error:', contractErr.message)
  } else {
    console.log('Total records:', contracts.length)
    const totalValue = contracts.reduce((sum, c) => sum + (c.annual_value_usd || 0), 0)
    console.log('Total annual value (USD):', fmt(totalValue))

    contracts.forEach(c => {
      console.log(`  - ${(c.client_name || 'N/A').substring(0, 30).padEnd(32)} ${fmt(c.annual_value_aud)} AUD / ${fmt(c.annual_value_usd)} USD`)
    })
  }

  console.log('\n' + '='.repeat(70))
  console.log('VERIFICATION COMPLETE')
  console.log('='.repeat(70))
}

verify().catch(console.error)
