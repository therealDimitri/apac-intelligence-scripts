#!/usr/bin/env node
/**
 * BURC Performance Data Verification Script
 * Queries all BURC-related views and tables to verify data accuracy
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

async function verifyExecutiveSummary() {
  console.log('\n' + '='.repeat(80))
  console.log('EXECUTIVE DASHBOARD VERIFICATION')
  console.log('='.repeat(80))

  // 1. Check burc_executive_summary view
  const { data: summary, error: summaryError } = await supabase
    .from('burc_executive_summary')
    .select('*')
    .single()

  if (summaryError) {
    console.log('❌ Error fetching executive summary:', summaryError.message)
    return
  }

  console.log('\n📊 burc_executive_summary (VIEW):')
  console.log('─'.repeat(60))
  console.log(`  NRR: ${summary.nrr_percent}%`)
  console.log(`  GRR: ${summary.grr_percent}%`)
  console.log(`  Annual Churn: ${formatCurrency(summary.annual_churn)}`)
  console.log(`  Expansion Revenue: ${formatCurrency(summary.expansion_revenue)}`)
  console.log(`  Revenue Growth: ${summary.revenue_growth_percent}%`)
  console.log(`  EBITA Margin: ${summary.ebita_margin_percent}%`)
  console.log(`  Rule of 40: ${summary.rule_of_40_score} (${summary.rule_of_40_status})`)
  console.log(`  Total ARR: ${formatCurrency(summary.total_arr)}`)
  console.log(`  Active Contracts: ${summary.active_contracts}`)
  console.log(`  Total Pipeline: ${formatCurrency(summary.total_pipeline)}`)
  console.log(`  Weighted Pipeline: ${formatCurrency(summary.weighted_pipeline)}`)
  console.log(`  Total At Risk: ${formatCurrency(summary.total_at_risk)}`)

  // 2. Verify NRR/GRR by checking source data
  console.log('\n📊 Verifying NRR/GRR from burc_historical_revenue:')
  console.log('─'.repeat(60))

  const { data: revenue } = await supabase
    .from('burc_historical_revenue')
    .select('year_2024, year_2025')

  if (revenue && revenue.length > 0) {
    const total2024 = revenue.reduce((sum, r) => sum + (r.year_2024 || 0), 0)
    const total2025 = revenue.reduce((sum, r) => sum + (r.year_2025 || 0), 0)
    console.log(`  Total 2024 Revenue: ${formatCurrency(total2024)}`)
    console.log(`  Total 2025 Revenue: ${formatCurrency(total2025)}`)
    console.log(`  Revenue Records: ${revenue.length}`)

    if (total2025 === 0) {
      console.log('  ⚠️ WARNING: year_2025 is $0 - this causes NRR/GRR calculation issues!')
    }
  }

  // 3. Check burc_revenue table for actual revenue data
  console.log('\n📊 Checking burc_revenue table:')
  console.log('─'.repeat(60))

  const { data: revenueData, count: revenueCount } = await supabase
    .from('burc_revenue')
    .select('*', { count: 'exact', head: true })

  console.log(`  Total Records: ${revenueCount || 0}`)

  // Get year breakdown
  const { data: yearBreakdown } = await supabase
    .from('burc_revenue')
    .select('year')
    .neq('year', null)

  if (yearBreakdown) {
    const years = [...new Set(yearBreakdown.map(r => r.year))].sort()
    console.log(`  Available Years: ${years.join(', ')}`)
  }

  // Get 2024 and 2025 totals
  for (const year of [2024, 2025]) {
    const { data: yearData } = await supabase
      .from('burc_revenue')
      .select('amount')
      .eq('year', year)

    if (yearData) {
      const total = yearData.reduce((sum, r) => sum + (r.amount || 0), 0)
      console.log(`  ${year} Total Revenue: ${formatCurrency(total)} (${yearData.length} records)`)
    }
  }

  return summary
}

async function verifyAlerts() {
  console.log('\n' + '='.repeat(80))
  console.log('ALERTS VERIFICATION')
  console.log('='.repeat(80))

  const { data: alerts, error } = await supabase
    .from('burc_active_alerts')
    .select('*')
    .order('priority_order')

  if (error) {
    console.log('❌ Error fetching alerts:', error.message)
    return
  }

  console.log(`\n📊 burc_active_alerts: ${alerts?.length || 0} total`)
  console.log('─'.repeat(60))

  const critical = alerts?.filter(a => a.severity === 'critical') || []
  const warning = alerts?.filter(a => a.severity === 'warning') || []

  console.log(`  Critical Alerts: ${critical.length}`)
  console.log(`  Warning Alerts: ${warning.length}`)

  if (critical.length > 0) {
    console.log('\n  Critical Alert Details:')
    critical.forEach(a => {
      console.log(`    - ${a.metric_name}: ${a.message}`)
      console.log(`      Current: ${typeof a.current_value === 'number' ?
        (a.metric_name.includes('%') || a.metric_name.includes('Ratio')
          ? a.current_value.toFixed(1) + '%'
          : formatCurrency(a.current_value))
        : a.current_value}`)
    })
  }

  return alerts
}

async function verifyRenewals() {
  console.log('\n' + '='.repeat(80))
  console.log('RENEWALS VERIFICATION')
  console.log('='.repeat(80))

  const { data: renewals, error } = await supabase
    .from('burc_renewal_calendar')
    .select('*')
    .order('renewal_period')

  if (error) {
    console.log('❌ Error fetching renewals:', error.message)
    return
  }

  console.log(`\n📊 burc_renewal_calendar: ${renewals?.length || 0} periods`)
  console.log('─'.repeat(60))

  let totalValue = 0
  let totalContracts = 0

  renewals?.forEach(r => {
    console.log(`  ${r.renewal_period}: ${r.contract_count} contracts = ${formatCurrency(r.total_value_usd)}`)
    totalValue += r.total_value_usd || 0
    totalContracts += r.contract_count || 0
  })

  console.log('─'.repeat(60))
  console.log(`  Total: ${totalContracts} contracts = ${formatCurrency(totalValue)}`)

  return renewals
}

async function verifyAttrition() {
  console.log('\n' + '='.repeat(80))
  console.log('ATTRITION VERIFICATION')
  console.log('='.repeat(80))

  const { data: attrition, error } = await supabase
    .from('burc_attrition_summary')
    .select('*')

  if (error) {
    console.log('❌ Error fetching attrition:', error.message)
    return
  }

  console.log(`\n📊 burc_attrition_summary: ${attrition?.length || 0} statuses`)
  console.log('─'.repeat(60))

  let totalAtRisk = 0
  let totalCount = 0

  attrition?.forEach(a => {
    console.log(`  ${a.status}: ${a.risk_count} clients = ${formatCurrency(a.total_at_risk_all_years)}`)
    if (a.affected_clients) {
      console.log(`    Clients: ${a.affected_clients}`)
    }
    totalAtRisk += a.total_at_risk_all_years || 0
    totalCount += a.risk_count || 0
  })

  console.log('─'.repeat(60))
  console.log(`  Total: ${totalCount} at-risk = ${formatCurrency(totalAtRisk)}`)

  return attrition
}

async function verifyCSIRatios() {
  console.log('\n' + '='.repeat(80))
  console.log('CSI RATIOS VERIFICATION')
  console.log('='.repeat(80))

  // Check if burc_csi_ratios table exists
  const { data: csiData, error } = await supabase
    .from('burc_csi_ratios')
    .select('*')
    .order('year', { ascending: false })
    .order('month', { ascending: false })
    .limit(12)

  if (error) {
    console.log('❌ Error fetching CSI ratios:', error.message)
    return
  }

  console.log(`\n📊 burc_csi_ratios: ${csiData?.length || 0} records (last 12 months)`)
  console.log('─'.repeat(60))

  if (csiData && csiData.length > 0) {
    const latest = csiData[0]
    console.log(`\n  Latest Period: ${latest.year}-${String(latest.month).padStart(2, '0')}`)
    console.log(`  PS Ratio: ${latest.ps_ratio?.toFixed(1)}%`)
    console.log(`  S&M Ratio: ${latest.sm_ratio?.toFixed(1)}%`)
    console.log(`  Maintenance Ratio: ${latest.maintenance_ratio?.toFixed(1)}%`)
    console.log(`  R&D Ratio: ${latest.rd_ratio?.toFixed(1)}%`)
    console.log(`  G&A Ratio: ${latest.ga_ratio?.toFixed(1)}%`)
    console.log(`  Total Revenue: ${formatCurrency(latest.total_revenue)}`)
    console.log(`  EBITA: ${formatCurrency(latest.ebita)} (${latest.ebita_percent?.toFixed(1)}%)`)
  }

  return csiData
}

async function verifyPipeline() {
  console.log('\n' + '='.repeat(80))
  console.log('PIPELINE VERIFICATION')
  console.log('='.repeat(80))

  // Check burc_ps_pipeline
  const { data: pipeline, error } = await supabase
    .from('burc_ps_pipeline')
    .select('*')

  if (error) {
    console.log('❌ Error fetching pipeline:', error.message)
    return
  }

  console.log(`\n📊 burc_ps_pipeline: ${pipeline?.length || 0} projects`)
  console.log('─'.repeat(60))

  if (pipeline && pipeline.length > 0) {
    const byCategory = {}
    pipeline.forEach(p => {
      const cat = p.category || 'Unknown'
      if (!byCategory[cat]) byCategory[cat] = { count: 0, total: 0 }
      byCategory[cat].count++
      byCategory[cat].total += p.annual_total || 0
    })

    Object.entries(byCategory).forEach(([cat, data]) => {
      console.log(`  ${cat}: ${data.count} projects = ${formatCurrency(data.total)}`)
    })
  }

  // Check burc_maintenance for recurring revenue
  const { data: maintenance } = await supabase
    .from('burc_maintenance')
    .select('*')

  console.log(`\n📊 burc_maintenance: ${maintenance?.length || 0} clients`)

  if (maintenance && maintenance.length > 0) {
    const total = maintenance.reduce((sum, m) => sum + (m.annual_total || 0), 0)
    console.log(`  Total Maintenance Revenue: ${formatCurrency(total)}`)
  }

  return { pipeline, maintenance }
}

async function verifyHistoricalRevenue() {
  console.log('\n' + '='.repeat(80))
  console.log('HISTORICAL REVENUE VERIFICATION')
  console.log('='.repeat(80))

  // Check if burc_revenue_by_year view exists
  const { data: yearlyRevenue, error } = await supabase
    .from('burc_revenue')
    .select('year, amount, client_name')
    .gte('year', 2019)
    .lte('year', 2025)

  if (error) {
    console.log('❌ Error fetching historical revenue:', error.message)
    return
  }

  console.log(`\n📊 Revenue by Year (2019-2025):`)
  console.log('─'.repeat(60))

  if (yearlyRevenue && yearlyRevenue.length > 0) {
    const byYear = {}
    const clientsByYear = {}

    yearlyRevenue.forEach(r => {
      const year = r.year
      if (!byYear[year]) {
        byYear[year] = 0
        clientsByYear[year] = new Set()
      }
      byYear[year] += r.amount || 0
      if (r.client_name) clientsByYear[year].add(r.client_name)
    })

    const sortedYears = Object.keys(byYear).sort()
    sortedYears.forEach(year => {
      const prevYear = String(parseInt(year) - 1)
      const change = byYear[prevYear]
        ? ((byYear[year] - byYear[prevYear]) / byYear[prevYear] * 100).toFixed(1)
        : 'N/A'
      console.log(`  ${year}: ${formatCurrency(byYear[year])} (${clientsByYear[year].size} clients) ${change !== 'N/A' ? `[${change > 0 ? '+' : ''}${change}%]` : ''}`)
    })
  }

  return yearlyRevenue
}

async function checkDataConsistency() {
  console.log('\n' + '='.repeat(80))
  console.log('DATA CONSISTENCY CHECKS')
  console.log('='.repeat(80))

  const issues = []

  // 1. Check for NRR/GRR discrepancy
  const { data: summary } = await supabase
    .from('burc_executive_summary')
    .select('nrr_percent, grr_percent')
    .single()

  if (summary) {
    // Expected values from CORRECT_2025_METRICS
    const expectedNRR = 92.8
    const expectedGRR = 72.2

    if (Math.abs(summary.nrr_percent - expectedNRR) > 0.1) {
      issues.push({
        type: 'discrepancy',
        field: 'NRR',
        viewValue: summary.nrr_percent,
        expectedValue: expectedNRR,
        message: `View shows ${summary.nrr_percent}%, but calculated value is ${expectedNRR}%`
      })
    }

    if (Math.abs(summary.grr_percent - expectedGRR) > 0.1) {
      issues.push({
        type: 'discrepancy',
        field: 'GRR',
        viewValue: summary.grr_percent,
        expectedValue: expectedGRR,
        message: `View shows ${summary.grr_percent}%, but calculated value is ${expectedGRR}%`
      })
    }
  }

  // 2. Check for missing data
  const { count: revenueCount } = await supabase
    .from('burc_revenue')
    .select('*', { count: 'exact', head: true })

  if (!revenueCount || revenueCount === 0) {
    issues.push({
      type: 'missing_data',
      table: 'burc_revenue',
      message: 'No revenue data found'
    })
  }

  // 3. Check renewal calendar for upcoming renewals
  const { data: upcomingRenewals } = await supabase
    .from('burc_renewal_calendar')
    .select('*')
    .limit(1)

  if (!upcomingRenewals || upcomingRenewals.length === 0) {
    issues.push({
      type: 'warning',
      table: 'burc_renewal_calendar',
      message: 'No upcoming renewals in calendar'
    })
  }

  console.log('\n📋 Issues Found:')
  console.log('─'.repeat(60))

  if (issues.length === 0) {
    console.log('  ✅ No critical issues detected')
  } else {
    issues.forEach((issue, i) => {
      const icon = issue.type === 'discrepancy' ? '⚠️' : issue.type === 'missing_data' ? '❌' : '⚡'
      console.log(`\n  ${i + 1}. ${icon} ${issue.field || issue.table}`)
      console.log(`     ${issue.message}`)
      if (issue.viewValue !== undefined) {
        console.log(`     View Value: ${issue.viewValue}`)
        console.log(`     Expected: ${issue.expectedValue}`)
      }
    })
  }

  return issues
}

async function main() {
  console.log('\n' + '🔍'.repeat(40))
  console.log('BURC PERFORMANCE DATA VERIFICATION REPORT')
  console.log('Generated: ' + new Date().toLocaleString('en-AU'))
  console.log('🔍'.repeat(40))

  try {
    await verifyExecutiveSummary()
    await verifyAlerts()
    await verifyRenewals()
    await verifyAttrition()
    await verifyCSIRatios()
    await verifyPipeline()
    await verifyHistoricalRevenue()
    const issues = await checkDataConsistency()

    console.log('\n' + '='.repeat(80))
    console.log('VERIFICATION COMPLETE')
    console.log('='.repeat(80))
    console.log(`\nTotal Issues: ${issues.length}`)

    if (issues.length > 0) {
      console.log('\n⚠️ Action Required: Review the issues above and update source data or views')
    } else {
      console.log('\n✅ All data verified successfully')
    }

  } catch (error) {
    console.error('\n❌ Verification failed:', error.message)
    process.exit(1)
  }
}

main()
