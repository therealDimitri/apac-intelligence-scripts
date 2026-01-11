#!/usr/bin/env node

/**
 * Script to investigate $500K variance between dashboard and Excel weighted ACV
 * Dashboard shows: $8.8M
 * Excel shows: $8.3M
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// Excel CSE Summary Weighted ACV targets (actual values from Sales Budget)
const excelTargets = {
  'John Salisbury': 1269627,
  'Laura Messing': 2680288,
  'Tracey Bland': 1909347,
  'Open Role': 2484209,
}

async function investigate() {
  console.log('='.repeat(70))
  console.log('VARIANCE INVESTIGATION: Dashboard ($8.8M) vs Excel ($8.3M)')
  console.log('='.repeat(70))
  console.log()

  // Get all Sales Budget pipeline opportunities with their target status info
  const { data: allOpps, error } = await supabase
    .from('sales_pipeline_opportunities')
    .select('*')
    .order('cse_name')

  if (error) {
    console.error('Error fetching opportunities:', error)
    return
  }

  console.log(`Total Sales Budget opportunities in database: ${allOpps.length}`)
  console.log()

  // Group by In/Out status
  const inTargetOpps = allOpps.filter(o => o.in_or_out === 'In')
  const outBurcMatched = allOpps.filter(o => o.in_or_out !== 'In' && o.burc_matched === true)
  const outNotBurc = allOpps.filter(o => o.in_or_out !== 'In' && o.burc_matched !== true)

  console.log('=== FILTERING BREAKDOWN ===')
  console.log(`In-Target (in_or_out = "In"): ${inTargetOpps.length}`)
  console.log(`Out but BURC Matched: ${outBurcMatched.length}`)
  console.log(`Out and NOT BURC (excluded): ${outNotBurc.length}`)
  console.log()

  // Calculate total weighted ACV for in-target only
  const dashboardTotal = inTargetOpps.reduce((sum, o) => sum + (parseFloat(o.weighted_acv) || 0), 0)
  const excelTotal = Object.values(excelTargets).reduce((sum, v) => sum + v, 0)

  console.log('=== TOTAL WEIGHTED ACV ===')
  console.log(`Dashboard (In-Target only): $${(dashboardTotal / 1000000).toFixed(2)}M`)
  console.log(`Excel Total (CSE Summary): $${(excelTotal / 1000000).toFixed(2)}M`)
  console.log(`Variance: $${((dashboardTotal - excelTotal) / 1000).toFixed(0)}K`)
  console.log()

  // Breakdown by CSE
  console.log('=== BREAKDOWN BY CSE ===')
  const cseNames = [...new Set(inTargetOpps.map(o => o.cse_name))].sort()

  for (const cse of cseNames) {
    const cseOpps = inTargetOpps.filter(o => o.cse_name === cse)
    const cseTotal = cseOpps.reduce((sum, o) => sum + (parseFloat(o.weighted_acv) || 0), 0)
    const excelValue = excelTargets[cse] || 0
    const variance = cseTotal - excelValue

    console.log(`\n${cse}:`)
    console.log(`  Dashboard: $${(cseTotal / 1000).toFixed(1)}K (${cseOpps.length} opps)`)
    console.log(`  Excel:     $${(excelValue / 1000).toFixed(1)}K`)
    console.log(`  Variance:  ${variance >= 0 ? '+' : ''}$${(variance / 1000).toFixed(1)}K`)
  }

  // Check for any opportunities that might be counted differently
  console.log('\n\n=== POTENTIAL ISSUES ===')

  // Check for null/empty in_or_out values
  const nullInOrOut = allOpps.filter(o => !o.in_or_out || o.in_or_out.trim() === '')
  if (nullInOrOut.length > 0) {
    console.log(`\nOpportunities with null/empty in_or_out: ${nullInOrOut.length}`)
    nullInOrOut.forEach(o => {
      console.log(`  - ${o.opportunity_name}: $${o.weighted_acv}`)
    })
  }

  // Check for case-sensitivity issues with "In"
  const inVariants = allOpps.reduce((acc, o) => {
    const val = o.in_or_out || 'NULL'
    acc[val] = (acc[val] || 0) + 1
    return acc
  }, {})
  console.log('\nIn/Out column values:')
  Object.entries(inVariants).forEach(([val, count]) => {
    console.log(`  "${val}": ${count}`)
  })

  // List top 10 highest weighted ACV opportunities in "In" status
  console.log('\n\n=== TOP 10 IN-TARGET OPPORTUNITIES BY WEIGHTED ACV ===')
  const topOpps = [...inTargetOpps].sort((a, b) => (b.weighted_acv || 0) - (a.weighted_acv || 0)).slice(0, 10)
  topOpps.forEach((o, i) => {
    console.log(`${i + 1}. ${o.opportunity_name}`)
    console.log(`   CSE: ${o.cse_name} | ACV: $${(o.weighted_acv / 1000).toFixed(1)}K | Period: ${o.fiscal_period}`)
  })

  // List opportunities that are "Out" but might be incorrectly marked
  console.log('\n\n=== "OUT" OPPORTUNITIES WITH HIGH WEIGHTED ACV (possibly incorrect?) ===')
  const highValueOut = outNotBurc
    .filter(o => (o.weighted_acv || 0) > 100000)
    .sort((a, b) => (b.weighted_acv || 0) - (a.weighted_acv || 0))
    .slice(0, 10)

  if (highValueOut.length > 0) {
    highValueOut.forEach(o => {
      console.log(`- ${o.opportunity_name}`)
      console.log(`  CSE: ${o.cse_name} | Weighted ACV: $${(o.weighted_acv / 1000).toFixed(1)}K | In/Out: "${o.in_or_out}"`)
    })
  } else {
    console.log('No high-value "Out" opportunities found')
  }

  console.log('\n' + '='.repeat(70))
}

investigate().catch(console.error)
