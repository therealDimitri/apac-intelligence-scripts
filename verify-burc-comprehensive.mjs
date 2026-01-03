#!/usr/bin/env node
/**
 * Comprehensive BURC Data Verification
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

const formatCurrency = (value) => {
  if (!value) return '$0'
  if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`
  return `$${value.toFixed(0)}`
}

async function verifyCSIOpex() {
  console.log('\n' + '='.repeat(80))
  console.log('CSI OPEX DATA VERIFICATION')
  console.log('='.repeat(80))

  const { data, error } = await supabase
    .from('burc_csi_opex')
    .select('*')
    .order('year', { ascending: false })
    .order('month_num', { ascending: false })
    .limit(12)

  if (error) {
    console.log(`❌ Error: ${error.message}`)
    return
  }

  console.log(`\n📊 burc_csi_opex: ${data?.length || 0} records (last 12 months)`)
  console.log('─'.repeat(60))

  if (data && data.length > 0) {
    console.log('Columns:', Object.keys(data[0]).join(', '))

    console.log('\nRecent Months:')
    data.slice(0, 3).forEach(row => {
      console.log(`\n  ${row.year}-${String(row.month_num).padStart(2, '0')}:`)
      console.log(`    Licence NR: ${formatCurrency(row.license_nr)}`)
      console.log(`    PS NR: ${formatCurrency(row.ps_nr)}`)
      console.log(`    Maintenance NR: ${formatCurrency(row.maintenance_nr)}`)
      console.log(`    Total NR: ${formatCurrency(row.total_nr)}`)
      console.log(`    PS OPEX: ${formatCurrency(row.ps_opex)}`)
      console.log(`    S&M OPEX: ${formatCurrency(row.sm_opex)}`)
      console.log(`    Maint OPEX: ${formatCurrency(row.maintenance_opex)}`)
      console.log(`    R&D OPEX: ${formatCurrency(row.rd_opex)}`)
      console.log(`    G&A OPEX: ${formatCurrency(row.ga_opex)}`)
      console.log(`    Total OPEX: ${formatCurrency(row.total_opex)}`)
      console.log(`    EBITA: ${formatCurrency(row.ebita)} (${row.ebita_percent?.toFixed(1)}%)`)

      // Calculate ratios
      const psRatio = row.ps_opex > 0 ? (row.ps_nr / row.ps_opex) : 0
      const salesRatio = row.sm_opex > 0 ? (0.7 * row.license_nr) / Math.abs(row.sm_opex) : 0
      const maintRatio = row.maintenance_opex > 0 ? (0.85 * row.maintenance_nr) / row.maintenance_opex : 0
      const rdRatio = row.rd_opex > 0 ? (0.3 * row.license_nr + 0.15 * row.maintenance_nr) / row.rd_opex : 0
      const gaRatio = row.total_nr > 0 ? (row.ga_opex / row.total_nr) * 100 : 0

      console.log(`    Calculated Ratios:`)
      console.log(`      PS: ${psRatio.toFixed(2)} (target: ≥2.0) ${psRatio >= 2 ? '✅' : '❌'}`)
      console.log(`      Sales: ${salesRatio.toFixed(2)} (target: ≥1.0) ${salesRatio >= 1 ? '✅' : '❌'}`)
      console.log(`      Maintenance: ${maintRatio.toFixed(2)} (target: ≥4.0) ${maintRatio >= 4 ? '✅' : '❌'}`)
      console.log(`      R&D: ${rdRatio.toFixed(2)} (target: ≥1.0) ${rdRatio >= 1 ? '✅' : '❌'}`)
      console.log(`      G&A: ${gaRatio.toFixed(1)}% (target: ≤20%) ${gaRatio <= 20 ? '✅' : '❌'}`)
    })
  }

  return data
}

async function verifyHistoricalHook() {
  console.log('\n' + '='.repeat(80))
  console.log('HISTORICAL REVENUE HOOK VERIFICATION')
  console.log('='.repeat(80))

  // Check the useBURCHistorical hook data source
  const { data, error } = await supabase
    .from('burc_yearly_revenue')
    .select('*')

  if (error) {
    console.log(`❌ burc_yearly_revenue: ${error.message}`)

    // Try burc_historical_revenue instead
    const { data: histData } = await supabase
      .from('burc_historical_revenue')
      .select('*')

    if (histData) {
      console.log(`\n📊 burc_historical_revenue: ${histData.length} records`)

      // Calculate year totals
      const years = [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]
      console.log('\nYearly Totals:')
      years.forEach(year => {
        const key = `year_${year}`
        const total = histData.reduce((sum, r) => sum + (r[key] || 0), 0)
        console.log(`  ${year}: ${formatCurrency(total)}`)
      })

      // Verify NRR/GRR calculation data
      const total2024 = histData.reduce((sum, r) => sum + (r.year_2024 || 0), 0)
      const total2025 = histData.reduce((sum, r) => sum + (r.year_2025 || 0), 0)

      console.log('\n⚠️ NRR/GRR Source Data Issue:')
      console.log(`  2024 Total: ${formatCurrency(total2024)}`)
      console.log(`  2025 Total: ${formatCurrency(total2025)}`)

      if (total2025 === 0) {
        console.log('  ❌ PROBLEM: year_2025 is $0 - this breaks NRR/GRR calculations!')
        console.log('  The burc_executive_summary view calculates NRR incorrectly due to this.')
      }
    }
  } else {
    console.log(`✅ burc_yearly_revenue: ${data?.length || 0} records`)
  }
}

async function verifyPipelineData() {
  console.log('\n' + '='.repeat(80))
  console.log('PIPELINE DATA VERIFICATION')
  console.log('='.repeat(80))

  // Check waterfall data
  const { data: waterfall } = await supabase
    .from('burc_waterfall')
    .select('*')
    .order('sort_order')

  console.log(`\n📊 burc_waterfall: ${waterfall?.length || 0} items`)

  if (waterfall && waterfall.length > 0) {
    console.log('─'.repeat(60))
    let totalPotential = 0
    waterfall.forEach(item => {
      console.log(`  ${item.category}: ${formatCurrency(item.amount)}`)
      if (item.category !== 'Target EBITA' && !item.category.includes('COGS') && !item.category.includes('OPEX')) {
        totalPotential += item.amount
      }
    })

    const committed = waterfall.find(w => w.category === 'Committed')?.amount || 0
    const bestCase = waterfall.find(w => w.category === 'Best Case')?.amount || 0
    const pipeline = waterfall.find(w => w.category === 'Pipeline')?.amount || 0
    const businessCase = waterfall.find(w => w.category === 'Business Case')?.amount || 0

    console.log('─'.repeat(60))
    console.log(`  Total Pipeline: ${formatCurrency(committed + bestCase + pipeline + businessCase)}`)
    console.log(`  Weighted (50%/25%): ${formatCurrency(committed + (bestCase * 0.5) + (pipeline * 0.25))}`)
  }

  // Check PS Pipeline projects
  const { data: psPipeline } = await supabase
    .from('burc_ps_pipeline')
    .select('*')

  console.log(`\n📊 burc_ps_pipeline: ${psPipeline?.length || 0} projects`)

  if (psPipeline && psPipeline.length > 0) {
    const byCategory = {}
    psPipeline.forEach(p => {
      const cat = p.category || 'Unknown'
      if (!byCategory[cat]) byCategory[cat] = { count: 0, total: 0 }
      byCategory[cat].count++
      byCategory[cat].total += p.annual_total || 0
    })

    Object.entries(byCategory).forEach(([cat, data]) => {
      console.log(`  ${cat}: ${data.count} projects = ${formatCurrency(data.total)}`)
    })
  }
}

async function verifyContractsData() {
  console.log('\n' + '='.repeat(80))
  console.log('CONTRACTS DATA VERIFICATION')
  console.log('='.repeat(80))

  const { data: contracts, error } = await supabase
    .from('burc_contracts')
    .select('*')
    .order('renewal_date')

  if (error) {
    console.log(`❌ Error: ${error.message}`)
    return
  }

  console.log(`\n📊 burc_contracts: ${contracts?.length || 0} active contracts`)
  console.log('─'.repeat(60))

  let totalARR_AUD = 0
  let totalARR_USD = 0

  contracts?.forEach(c => {
    const renewalDate = c.renewal_date ? new Date(c.renewal_date).toLocaleDateString('en-AU') : 'N/A'
    console.log(`  ${c.client_name} (${c.solution}):`)
    console.log(`    AUD: ${formatCurrency(c.annual_value_aud)} | USD: ${formatCurrency(c.annual_value_usd)}`)
    console.log(`    Renewal: ${renewalDate} | Status: ${c.contract_status}`)
    totalARR_AUD += c.annual_value_aud || 0
    totalARR_USD += c.annual_value_usd || 0
  })

  console.log('─'.repeat(60))
  console.log(`  Total ARR (AUD): ${formatCurrency(totalARR_AUD)}`)
  console.log(`  Total ARR (USD): ${formatCurrency(totalARR_USD)}`)

  // Compare with executive summary
  const { data: summary } = await supabase
    .from('burc_executive_summary')
    .select('total_arr, active_contracts, total_contract_value')
    .single()

  if (summary) {
    console.log(`\n📊 Comparison with Executive Summary:`)
    console.log(`  Summary Total ARR: ${formatCurrency(summary.total_arr)}`)
    console.log(`  Summary Active Contracts: ${summary.active_contracts}`)
    console.log(`  Actual Contracts Count: ${contracts?.length || 0}`)

    if (Math.abs(summary.total_arr - totalARR_USD) > 1000) {
      console.log(`  ⚠️ Discrepancy: Total ARR differs by ${formatCurrency(Math.abs(summary.total_arr - totalARR_USD))}`)
    } else {
      console.log(`  ✅ Total ARR matches within tolerance`)
    }

    if (summary.active_contracts !== contracts?.length) {
      console.log(`  ⚠️ Discrepancy: Contract count differs (${summary.active_contracts} vs ${contracts?.length})`)
    } else {
      console.log(`  ✅ Contract count matches`)
    }
  }

  return contracts
}

async function verifyNRRGRRCalculation() {
  console.log('\n' + '='.repeat(80))
  console.log('NRR/GRR CALCULATION VERIFICATION')
  console.log('='.repeat(80))

  // The correct values are hardcoded in BURCExecutiveDashboard.tsx
  const expectedNRR = 92.8
  const expectedGRR = 72.2
  const expectedExpansion = 10533435
  const expectedChurn = 2199919

  // Get view values
  const { data: summary } = await supabase
    .from('burc_executive_summary')
    .select('nrr_percent, grr_percent, expansion_revenue, annual_churn')
    .single()

  console.log('\n📊 NRR/GRR Values:')
  console.log('─'.repeat(60))
  console.log(`  View NRR: ${summary?.nrr_percent}%`)
  console.log(`  Expected NRR: ${expectedNRR}%`)
  console.log(`  View GRR: ${summary?.grr_percent}%`)
  console.log(`  Expected GRR: ${expectedGRR}%`)
  console.log(`  View Expansion: ${formatCurrency(summary?.expansion_revenue)}`)
  console.log(`  Expected Expansion: ${formatCurrency(expectedExpansion)}`)
  console.log(`  View Churn: ${formatCurrency(summary?.annual_churn)}`)
  console.log(`  Expected Churn: ${formatCurrency(expectedChurn)}`)

  console.log('\n📋 Analysis:')
  if (summary?.nrr_percent === 0 && summary?.grr_percent === 100) {
    console.log('  ❌ View shows NRR=0%, GRR=100% - this is incorrect')
    console.log('  Root cause: burc_historical_revenue.year_2025 = $0')
    console.log('  The dashboard code overrides these with correct pre-computed values')
    console.log('  ⚠️ ACTION NEEDED: Update burc_historical_revenue with 2025 data')
  } else {
    console.log('  ✅ View values appear correct')
  }
}

async function verifyAtRiskData() {
  console.log('\n' + '='.repeat(80))
  console.log('AT-RISK REVENUE VERIFICATION')
  console.log('='.repeat(80))

  const { data: attrition } = await supabase
    .from('burc_attrition_summary')
    .select('*')

  const { data: summary } = await supabase
    .from('burc_executive_summary')
    .select('total_at_risk, attrition_risk_count')
    .single()

  console.log('\n📊 Attrition Summary:')
  console.log('─'.repeat(60))

  let totalAtRisk = 0
  let totalCount = 0

  attrition?.forEach(a => {
    console.log(`  ${a.status}: ${a.risk_count} clients = ${formatCurrency(a.total_at_risk_all_years)}`)
    totalAtRisk += a.total_at_risk_all_years || 0
    totalCount += a.risk_count || 0
  })

  console.log('─'.repeat(60))
  console.log(`  Calculated Total: ${totalCount} at-risk = ${formatCurrency(totalAtRisk)}`)

  if (summary) {
    console.log(`\n📊 Executive Summary Values:`)
    console.log(`  Total At Risk: ${formatCurrency(summary.total_at_risk)}`)
    console.log(`  Attrition Count: ${summary.attrition_risk_count}`)

    if (Math.abs(summary.total_at_risk - totalAtRisk) > 1000) {
      console.log(`  ⚠️ Discrepancy: At-risk value differs by ${formatCurrency(Math.abs(summary.total_at_risk - totalAtRisk))}`)
    } else {
      console.log(`  ✅ At-risk value matches`)
    }
  }
}

async function generateSummaryReport() {
  console.log('\n' + '='.repeat(80))
  console.log('DATA VERIFICATION SUMMARY')
  console.log('='.repeat(80))

  const issues = []
  const warnings = []
  const verified = []

  // Check 1: NRR/GRR
  const { data: summary } = await supabase
    .from('burc_executive_summary')
    .select('*')
    .single()

  if (summary?.nrr_percent === 0) {
    issues.push({
      severity: 'critical',
      area: 'NRR/GRR Metrics',
      issue: 'View shows NRR=0% due to missing 2025 revenue data',
      impact: 'Dashboard shows incorrect retention metrics',
      resolution: 'Code workaround in place - values are overridden with correct pre-computed metrics'
    })
  }

  // Check 2: Historical Revenue
  const { data: histRev } = await supabase
    .from('burc_historical_revenue')
    .select('year_2025')

  const total2025 = histRev?.reduce((sum, r) => sum + (r.year_2025 || 0), 0) || 0
  if (total2025 === 0) {
    issues.push({
      severity: 'critical',
      area: 'Historical Revenue',
      issue: 'year_2025 column is $0 in burc_historical_revenue',
      impact: 'Breaks NRR/GRR calculations and year-over-year comparisons',
      resolution: 'Need to populate 2025 revenue data from BURC source'
    })
  }

  // Check 3: CSI Ratios
  const { data: csiData, error: csiError } = await supabase
    .from('burc_csi_opex')
    .select('*')
    .limit(1)

  if (csiError) {
    issues.push({
      severity: 'high',
      area: 'CSI Ratios',
      issue: 'Cannot access burc_csi_opex table',
      impact: 'CSI Ratios tab may not display correctly',
      resolution: 'Verify table exists and RLS policies are correct'
    })
  } else if (csiData && csiData.length > 0) {
    verified.push('CSI OPEX data is accessible and contains records')
  }

  // Check 4: Contracts
  const { data: contracts } = await supabase
    .from('burc_contracts')
    .select('*', { count: 'exact' })

  if (contracts && contracts.length === summary?.active_contracts) {
    verified.push(`Contract count matches (${contracts.length} contracts)`)
  } else if (contracts) {
    warnings.push({
      area: 'Contracts',
      issue: `Contract count mismatch: ${contracts.length} actual vs ${summary?.active_contracts} in summary`
    })
  }

  // Check 5: Pipeline
  const { data: waterfall } = await supabase
    .from('burc_waterfall')
    .select('*')

  if (waterfall && waterfall.length > 0) {
    verified.push(`Pipeline waterfall data present (${waterfall.length} categories)`)
  } else {
    warnings.push({
      area: 'Pipeline',
      issue: 'No waterfall data found'
    })
  }

  // Check 6: Renewals
  const { data: renewals } = await supabase
    .from('burc_renewal_calendar')
    .select('*')

  if (renewals && renewals.length > 0) {
    verified.push(`Renewal calendar data present (${renewals.length} periods)`)
  } else {
    warnings.push({
      area: 'Renewals',
      issue: 'No renewal calendar data found'
    })
  }

  // Print Summary
  console.log('\n❌ CRITICAL ISSUES:')
  if (issues.filter(i => i.severity === 'critical').length === 0) {
    console.log('  None')
  } else {
    issues.filter(i => i.severity === 'critical').forEach((issue, i) => {
      console.log(`\n  ${i + 1}. ${issue.area}`)
      console.log(`     Issue: ${issue.issue}`)
      console.log(`     Impact: ${issue.impact}`)
      console.log(`     Resolution: ${issue.resolution}`)
    })
  }

  console.log('\n⚠️ WARNINGS:')
  if (warnings.length === 0) {
    console.log('  None')
  } else {
    warnings.forEach((w, i) => {
      console.log(`  ${i + 1}. ${w.area}: ${w.issue}`)
    })
  }

  console.log('\n✅ VERIFIED:')
  verified.forEach(v => {
    console.log(`  • ${v}`)
  })

  return { issues, warnings, verified }
}

async function main() {
  console.log('🔍'.repeat(40))
  console.log('COMPREHENSIVE BURC DATA VERIFICATION')
  console.log('Generated: ' + new Date().toLocaleString('en-AU'))
  console.log('🔍'.repeat(40))

  try {
    await verifyCSIOpex()
    await verifyHistoricalHook()
    await verifyPipelineData()
    await verifyContractsData()
    await verifyNRRGRRCalculation()
    await verifyAtRiskData()
    const { issues, warnings, verified } = await generateSummaryReport()

    console.log('\n' + '='.repeat(80))
    console.log('VERIFICATION COMPLETE')
    console.log('='.repeat(80))
    console.log(`\n  Critical Issues: ${issues.filter(i => i.severity === 'critical').length}`)
    console.log(`  Warnings: ${warnings.length}`)
    console.log(`  Verified: ${verified.length}`)

  } catch (error) {
    console.error('\n❌ Verification failed:', error.message)
    process.exit(1)
  }
}

main()
