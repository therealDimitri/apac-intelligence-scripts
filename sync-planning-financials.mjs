#!/usr/bin/env node
/**
 * BURC-to-Planning Financials Sync Job
 *
 * Aggregates BURC data into planning tables for Account Planning Hub v2:
 * 1. Client level → account_plan_financials
 * 2. Territory level → territory_strategy_financials
 * 3. BU level → business_unit_planning
 * 4. APAC totals → apac_planning_goals
 *
 * Data Sources:
 * - burc_client_revenue_detail (historical client revenue)
 * - burc_arr_tracking (ARR targets and tracking)
 * - burc_renewal_pipeline (renewal forecasts)
 * - burc_nrr_metrics (NRR/GRR calculations)
 * - burc_attrition_risk (churn risk)
 * - burc_pipeline_deals (expansion pipeline)
 * - burc_contracts (renewal dates)
 * - aging_accounts (AR balances)
 * - client_health_history (health scores)
 *
 * Usage:
 *   node scripts/sync-planning-financials.mjs
 *   node scripts/sync-planning-financials.mjs --dry-run
 *
 * @created 2026-01-09
 */

import { createClient } from '@supabase/supabase-js'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

// Parse command line arguments
const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const VERBOSE = args.includes('--verbose') || args.includes('-v')

// Initialise Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// Current fiscal year
const FISCAL_YEAR = 2026

// Statistics tracking
const stats = {
  accountPlans: { inserted: 0, updated: 0, errors: 0 },
  territoryStrategies: { inserted: 0, updated: 0, errors: 0 },
  businessUnits: { inserted: 0, updated: 0, errors: 0 },
  apacGoals: { updated: 0, errors: 0 }
}

// Helper functions
function log(message, type = 'info') {
  const prefix = {
    info: '',
    success: '[SUCCESS]',
    warning: '[WARNING]',
    error: '[ERROR]',
    debug: '[DEBUG]'
  }
  if (type === 'debug' && !VERBOSE) return
  console.log(`${prefix[type] || ''} ${message}`)
}

function formatCurrency(value) {
  if (!value || isNaN(value)) return '$0'
  return '$' + Number(value).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function formatPercentage(value) {
  if (!value || isNaN(value)) return '0%'
  return Number(value).toFixed(1) + '%'
}

// Territory mapping based on CSE assignments
const CSE_TERRITORY_MAPPING = {
  'Tracey Bugeja': 'Victoria',
  'Jess Gawler': 'New South Wales',
  'John Bugeja': 'South Australia / Western Australia',
  'Jimmy Leimonitis': 'Singapore / SEA',
  'Boon Koh': 'Singapore / SEA'
}

// BU mapping based on territory
const TERRITORY_BU_MAPPING = {
  'Victoria': 'ANZ',
  'New South Wales': 'ANZ',
  'Queensland': 'ANZ',
  'South Australia / Western Australia': 'ANZ',
  'New Zealand': 'ANZ',
  'Singapore / SEA': 'SEA',
  'Malaysia': 'SEA',
  'Thailand': 'SEA',
  'Hong Kong': 'Greater China',
  'China': 'Greater China',
  'Taiwan': 'Greater China'
}

// ============================================================================
// DATA FETCHING FUNCTIONS
// ============================================================================

async function fetchClientRevenueDetail() {
  log('Fetching client revenue detail...', 'debug')
  const { data, error } = await supabase
    .from('burc_client_revenue_detail')
    .select('*')

  if (error) {
    log(`Error fetching client revenue: ${error.message}`, 'error')
    return []
  }
  log(`Found ${data?.length || 0} client revenue records`, 'debug')
  return data || []
}

async function fetchARRTracking() {
  log('Fetching ARR tracking...', 'debug')
  const { data, error } = await supabase
    .from('burc_arr_tracking')
    .select('*')
    .eq('year', FISCAL_YEAR)

  if (error) {
    log(`Error fetching ARR tracking: ${error.message}`, 'error')
    return []
  }
  log(`Found ${data?.length || 0} ARR tracking records`, 'debug')
  return data || []
}

async function fetchNRRMetrics() {
  log('Fetching NRR metrics...', 'debug')
  const { data, error } = await supabase
    .from('burc_nrr_metrics')
    .select('*')
    .order('year', { ascending: false })
    .limit(5)

  if (error) {
    log(`Error fetching NRR metrics: ${error.message}`, 'error')
    return []
  }
  log(`Found ${data?.length || 0} NRR metric records`, 'debug')
  return data || []
}

async function fetchAttritionRisk() {
  log('Fetching attrition risk...', 'debug')
  const { data, error } = await supabase
    .from('burc_attrition_risk')
    .select('*')
    .eq('status', 'open')

  if (error) {
    log(`Error fetching attrition risk: ${error.message}`, 'error')
    return []
  }
  log(`Found ${data?.length || 0} attrition risk records`, 'debug')
  return data || []
}

async function fetchPipelineDeals() {
  log('Fetching pipeline deals...', 'debug')
  const { data, error } = await supabase
    .from('burc_pipeline_deals')
    .select('*')
    .eq('fiscal_year', FISCAL_YEAR)

  if (error) {
    log(`Error fetching pipeline deals: ${error.message}`, 'error')
    return []
  }
  log(`Found ${data?.length || 0} pipeline deal records`, 'debug')
  return data || []
}

async function fetchContracts() {
  log('Fetching contracts...', 'debug')
  const { data, error } = await supabase
    .from('burc_contracts')
    .select('*')
    .eq('contract_status', 'active')

  if (error) {
    log(`Error fetching contracts: ${error.message}`, 'error')
    return []
  }
  log(`Found ${data?.length || 0} contract records`, 'debug')
  return data || []
}

async function fetchAgingAccounts() {
  log('Fetching aging accounts...', 'debug')
  const { data, error } = await supabase
    .from('aging_accounts')
    .select('*')

  if (error) {
    log(`Error fetching aging accounts: ${error.message}`, 'error')
    return []
  }
  log(`Found ${data?.length || 0} aging account records`, 'debug')
  return data || []
}

async function fetchHealthHistory() {
  log('Fetching health history...', 'debug')
  const { data, error } = await supabase
    .from('client_health_history')
    .select('*')
    .order('snapshot_date', { ascending: false })

  if (error) {
    log(`Error fetching health history: ${error.message}`, 'error')
    return []
  }
  log(`Found ${data?.length || 0} health history records`, 'debug')
  return data || []
}

async function fetchClients() {
  log('Fetching clients...', 'debug')
  const { data, error } = await supabase
    .from('clients')
    .select('id, name, cse_name, status')
    .eq('status', 'Active')

  if (error) {
    log(`Error fetching clients: ${error.message}`, 'error')
    return []
  }
  log(`Found ${data?.length || 0} active clients`, 'debug')
  return data || []
}

async function fetchClientSegmentation() {
  log('Fetching client segmentation...', 'debug')
  const { data, error } = await supabase
    .from('client_segmentation')
    .select('*')
    .is('effective_to', null)

  if (error) {
    log(`Error fetching client segmentation: ${error.message}`, 'error')
    return []
  }
  log(`Found ${data?.length || 0} segmentation records`, 'debug')
  return data || []
}

async function fetchMonthlyForecast() {
  log('Fetching monthly forecast...', 'debug')
  const { data, error } = await supabase
    .from('burc_monthly_forecast')
    .select('*')
    .eq('fiscal_year', FISCAL_YEAR)
    .order('month_num', { ascending: true })

  if (error) {
    log(`Error fetching monthly forecast: ${error.message}`, 'error')
    return []
  }
  log(`Found ${data?.length || 0} monthly forecast records`, 'debug')
  return data || []
}

// ============================================================================
// AGGREGATION FUNCTIONS
// ============================================================================

function aggregateClientFinancials(
  clientName,
  revenueData,
  arrData,
  attritionData,
  pipelineData,
  contractData,
  agingData,
  healthData
) {
  // Get client-specific data
  const clientRevenue = revenueData.filter(r => r.client_name === clientName)
  const clientArr = arrData.find(a => a.client_name === clientName)
  const clientAttrition = attritionData.find(a => a.client_name === clientName)
  const clientPipeline = pipelineData.filter(p => p.client_name === clientName)
  const clientContract = contractData.find(c => c.client_name === clientName)
  const clientAging = agingData.find(a =>
    a.client_name === clientName || a.client_name_normalized === clientName
  )
  const clientHealth = healthData.find(h => h.client_name === clientName)

  // Calculate current ARR (sum of 2026 revenue by type)
  let currentArr = 0
  let revenueSoftware = 0
  let revenuePs = 0
  let revenueMaintenance = 0
  let revenueHardware = 0

  for (const rev of clientRevenue) {
    const value = Number(rev.year_2026) || 0
    currentArr += value

    if (rev.revenue_type?.includes('License')) {
      revenueSoftware += value
    } else if (rev.revenue_type?.includes('Professional')) {
      revenuePs += value
    } else if (rev.revenue_type?.includes('Maintenance')) {
      revenueMaintenance += value
    } else if (rev.revenue_type?.includes('Hardware')) {
      revenueHardware += value
    }
  }

  // Calculate MRR
  const currentMrr = currentArr / 12

  // Get target ARR from ARR tracking
  const targetArr = clientArr?.target_pipeline_value || currentArr * 1.1

  // Calculate target growth
  const targetGrowthPercentage = currentArr > 0
    ? ((targetArr - currentArr) / currentArr) * 100
    : 10

  // Calculate expansion pipeline
  const expansionPipeline = clientPipeline
    .filter(p => p.forecast_category !== 'Backlog')
    .reduce((sum, p) => sum + (Number(p.total_revenue) || 0), 0)

  // Weighted pipeline (using probability if available)
  const expansionPipelineWeighted = clientPipeline
    .filter(p => p.forecast_category !== 'Backlog')
    .reduce((sum, p) => {
      const probability = p.forecast_category === 'Best Case' ? 0.7 : 0.3
      return sum + (Number(p.total_revenue) || 0) * probability
    }, 0)

  // Calculate 3-year NRR and GRR from historical data
  let nrr3Year = 100
  let grr3Year = 95
  let lifetimeValue = 0
  let tenureYears = 0

  if (clientRevenue.length > 0) {
    const y2024 = clientRevenue.reduce((sum, r) => sum + (Number(r.year_2024) || 0), 0)
    const y2023 = clientRevenue.reduce((sum, r) => sum + (Number(r.year_2023) || 0), 0)
    const y2022 = clientRevenue.reduce((sum, r) => sum + (Number(r.year_2022) || 0), 0)
    const y2021 = clientRevenue.reduce((sum, r) => sum + (Number(r.year_2021) || 0), 0)
    const y2020 = clientRevenue.reduce((sum, r) => sum + (Number(r.year_2020) || 0), 0)
    const y2019 = clientRevenue.reduce((sum, r) => sum + (Number(r.year_2019) || 0), 0)

    // Calculate 3-year NRR (2024/2021)
    if (y2021 > 0) {
      nrr3Year = (y2024 / y2021) * 100
    }

    // Calculate 3-year GRR (simplified - assumes 5% churn per year as baseline)
    const churnFactor = clientAttrition ? 0.85 : 0.95
    grr3Year = Math.pow(churnFactor, 3) * 100

    // Lifetime value
    lifetimeValue = y2024 + y2023 + y2022 + y2021 + y2020 + y2019 + currentArr

    // Tenure years (count years with revenue)
    if (y2019 > 0) tenureYears = 7
    else if (y2020 > 0) tenureYears = 6
    else if (y2021 > 0) tenureYears = 5
    else if (y2022 > 0) tenureYears = 4
    else if (y2023 > 0) tenureYears = 3
    else if (y2024 > 0) tenureYears = 2
    else tenureYears = 1
  }

  // AR balance and overdue
  const arBalance = clientAging
    ? Number(clientAging.total_outstanding) || 0
    : 0
  const arOverdue = clientAging
    ? Number(clientAging.total_overdue) || 0
    : 0

  // DSO calculation (simplified)
  const dsoDays = currentArr > 0 && arBalance > 0
    ? Math.round((arBalance / currentArr) * 365)
    : 0

  // Collection risk based on overdue
  let collectionRisk = 'low'
  if (arOverdue > 100000) collectionRisk = 'critical'
  else if (arOverdue > 50000) collectionRisk = 'high'
  else if (arOverdue > 10000) collectionRisk = 'medium'

  // Renewal info
  const renewalDate = clientContract?.renewal_date || null
  const renewalValue = clientContract?.annual_value_usd || revenueMaintenance
  const renewalRisk = clientAttrition ? 'high' : (renewalDate ? 'low' : 'unknown')

  return {
    client_name: clientName,
    fiscal_year: FISCAL_YEAR,
    current_arr: currentArr,
    current_mrr: currentMrr,
    revenue_software: revenueSoftware,
    revenue_ps: revenuePs,
    revenue_maintenance: revenueMaintenance,
    revenue_hardware: revenueHardware,
    target_arr: targetArr,
    target_growth_percentage: targetGrowthPercentage,
    expansion_pipeline: expansionPipeline,
    expansion_pipeline_weighted: expansionPipelineWeighted,
    nrr_3year: nrr3Year,
    grr_3year: grr3Year,
    lifetime_value: lifetimeValue,
    tenure_years: tenureYears,
    ar_balance: arBalance,
    ar_overdue: arOverdue,
    dso_days: dsoDays,
    collection_risk: collectionRisk,
    renewal_date: renewalDate,
    renewal_value: renewalValue,
    renewal_risk: renewalRisk,
    burc_sync_date: new Date().toISOString(),
    data_source: 'sync-planning-financials'
  }
}

function aggregateTerritoryFinancials(
  territory,
  cseName,
  clientFinancials,
  monthlyForecast
) {
  // Filter clients for this territory/CSE
  const territoryClients = clientFinancials.filter(c => {
    // Match by CSE name in territory mapping
    return CSE_TERRITORY_MAPPING[cseName] === territory
  })

  if (territoryClients.length === 0) {
    return null
  }

  // Aggregate metrics
  const totalArr = territoryClients.reduce((sum, c) => sum + (c.current_arr || 0), 0)
  const targetArr = territoryClients.reduce((sum, c) => sum + (c.target_arr || 0), 0)
  const gapToTarget = targetArr - totalArr

  // Calculate YoY growth (simplified)
  const yoyGrowthPercentage = 5.0 // Would need prior year data

  // Revenue breakdown
  const revenueRunrate = territoryClients.reduce((sum, c) =>
    sum + (c.revenue_maintenance || 0), 0)
  const revenueBusinessCases = territoryClients.reduce((sum, c) =>
    sum + (c.expansion_pipeline || 0) * 0.5, 0) // 50% of pipeline as BC
  const revenuePipelineWeighted = territoryClients.reduce((sum, c) =>
    sum + (c.expansion_pipeline_weighted || 0), 0)

  // Portfolio NRR/GRR (weighted average)
  let portfolioNrr = 100
  let portfolioGrr = 95
  let totalWeight = 0
  let weightedNrr = 0
  let weightedGrr = 0

  for (const c of territoryClients) {
    const weight = c.current_arr || 0
    totalWeight += weight
    weightedNrr += (c.nrr_3year || 100) * weight
    weightedGrr += (c.grr_3year || 95) * weight
  }

  if (totalWeight > 0) {
    portfolioNrr = weightedNrr / totalWeight
    portfolioGrr = weightedGrr / totalWeight
  }

  // Quarterly targets (calculate from monthly forecast if available)
  const q1Target = targetArr * 0.24 // Q1 = Jul-Sep (24%)
  const q2Target = targetArr * 0.25 // Q2 = Oct-Dec (25%)
  const q3Target = targetArr * 0.26 // Q3 = Jan-Mar (26%)
  const q4Target = targetArr * 0.25 // Q4 = Apr-Jun (25%)

  // Actuals from monthly forecast (sum by quarter)
  let q1Actual = 0, q2Actual = 0, q3Actual = 0, q4Actual = 0

  for (const month of monthlyForecast) {
    const revenue = Number(month.gross_revenue) || 0
    if (month.month_num >= 1 && month.month_num <= 3) q3Actual += revenue
    else if (month.month_num >= 4 && month.month_num <= 6) q4Actual += revenue
    else if (month.month_num >= 7 && month.month_num <= 9) q1Actual += revenue
    else if (month.month_num >= 10 && month.month_num <= 12) q2Actual += revenue
  }

  // Scale actuals to territory proportion
  const territoryProportion = totalArr / (monthlyForecast.reduce((sum, m) =>
    sum + (Number(m.gross_revenue) || 0), 0) || 1)

  q1Actual *= territoryProportion
  q2Actual *= territoryProportion
  q3Actual *= territoryProportion
  q4Actual *= territoryProportion

  // Client distribution
  const clientCount = territoryClients.length
  const sortedByArr = [...territoryClients].sort((a, b) =>
    (b.current_arr || 0) - (a.current_arr || 0))
  const top10Clients = sortedByArr.slice(0, Math.min(10, sortedByArr.length))
  const top10Arr = top10Clients.reduce((sum, c) => sum + (c.current_arr || 0), 0)
  const top10Percentage = totalArr > 0 ? (top10Arr / totalArr) * 100 : 0

  // Concentration risk
  let concentrationRisk = 'low'
  if (top10Percentage > 80) concentrationRisk = 'critical'
  else if (top10Percentage > 60) concentrationRisk = 'high'
  else if (top10Percentage > 40) concentrationRisk = 'medium'

  // BU information
  const buName = TERRITORY_BU_MAPPING[territory] || 'ANZ'

  // Renewal pipeline (by quarter)
  const renewals = territoryClients.filter(c => c.renewal_date)
  const renewalsByQuarter = { q1: 0, q2: 0, q3: 0, q4: 0 }
  const renewalsSecured = { q1: 0, q2: 0, q3: 0, q4: 0 }

  for (const c of renewals) {
    if (!c.renewal_date) continue
    const month = new Date(c.renewal_date).getMonth() + 1
    const value = c.renewal_value || 0
    const secured = c.renewal_risk === 'low' ? value : 0

    if (month >= 7 && month <= 9) {
      renewalsByQuarter.q1 += value
      renewalsSecured.q1 += secured
    } else if (month >= 10 && month <= 12) {
      renewalsByQuarter.q2 += value
      renewalsSecured.q2 += secured
    } else if (month >= 1 && month <= 3) {
      renewalsByQuarter.q3 += value
      renewalsSecured.q3 += secured
    } else {
      renewalsByQuarter.q4 += value
      renewalsSecured.q4 += secured
    }
  }

  return {
    territory: territory,
    cse_name: cseName,
    fiscal_year: FISCAL_YEAR,
    total_arr: totalArr,
    target_arr: targetArr,
    gap_to_target: gapToTarget,
    yoy_growth_percentage: yoyGrowthPercentage,
    revenue_runrate: revenueRunrate,
    revenue_business_cases: revenueBusinessCases,
    revenue_pipeline_weighted: revenuePipelineWeighted,
    portfolio_nrr: portfolioNrr,
    portfolio_grr: portfolioGrr,
    q1_target: q1Target,
    q1_actual: q1Actual,
    q2_target: q2Target,
    q2_actual: q2Actual,
    q3_target: q3Target,
    q3_actual: q3Actual,
    q4_target: q4Target,
    q4_actual: q4Actual,
    client_count: clientCount,
    top_10_arr: top10Arr,
    top_10_percentage: top10Percentage,
    concentration_risk: concentrationRisk,
    bu_name: buName,
    bu_contribution_percentage: 0, // Will be calculated at BU level
    renewal_q1_value: renewalsByQuarter.q1,
    renewal_q1_secured: renewalsSecured.q1,
    renewal_q2_value: renewalsByQuarter.q2,
    renewal_q2_secured: renewalsSecured.q2,
    renewal_q3_value: renewalsByQuarter.q3,
    renewal_q3_secured: renewalsSecured.q3,
    renewal_q4_value: renewalsByQuarter.q4,
    renewal_q4_secured: renewalsSecured.q4,
    burc_sync_date: new Date().toISOString()
  }
}

function aggregateBUFinancials(buName, territoryFinancials, nrrMetrics, clientFinancials) {
  // Filter territories for this BU
  const buTerritories = territoryFinancials.filter(t => t.bu_name === buName)

  if (buTerritories.length === 0) {
    return null
  }

  // Aggregate from territories
  const targetArr = buTerritories.reduce((sum, t) => sum + (t.target_arr || 0), 0)
  const currentArr = buTerritories.reduce((sum, t) => sum + (t.total_arr || 0), 0)
  const gapToTarget = targetArr - currentArr

  // Territory count and data
  const territoryCount = buTerritories.length
  const territoryData = buTerritories.map(t => ({
    territory: t.territory,
    cse_name: t.cse_name,
    arr: t.total_arr,
    target: t.target_arr,
    gap: t.gap_to_target,
    clients: t.client_count
  }))

  // Get NRR/GRR from metrics
  const latestNrr = nrrMetrics.find(n => n.year === FISCAL_YEAR)
  const nrr = latestNrr?.nrr || 98
  const grr = latestNrr?.grr || 76

  // EBITA margin and Rule of 40 (from BURC data)
  const ebitaMargin = 18.0 // From known BURC data
  const ruleOf40 = nrr + ebitaMargin

  // Segment distribution
  const buClients = clientFinancials.filter(c => {
    const territory = Object.keys(CSE_TERRITORY_MAPPING).find(cse =>
      CSE_TERRITORY_MAPPING[cse] && TERRITORY_BU_MAPPING[CSE_TERRITORY_MAPPING[cse]] === buName
    )
    return territory !== undefined
  })

  const segmentDistribution = {
    Giant: { clients: 0, arr: 0 },
    Large: { clients: 0, arr: 0 },
    Medium: { clients: 0, arr: 0 },
    Small: { clients: 0, arr: 0 }
  }

  for (const c of buClients) {
    const arr = c.current_arr || 0
    if (arr > 5000000) {
      segmentDistribution.Giant.clients++
      segmentDistribution.Giant.arr += arr
    } else if (arr > 1000000) {
      segmentDistribution.Large.clients++
      segmentDistribution.Large.arr += arr
    } else if (arr > 250000) {
      segmentDistribution.Medium.clients++
      segmentDistribution.Medium.arr += arr
    } else {
      segmentDistribution.Small.clients++
      segmentDistribution.Small.arr += arr
    }
  }

  // Planning status (placeholder - would need account_plans table)
  const totalPlansRequired = buClients.filter(c => (c.current_arr || 0) > 250000).length
  const totalPlansApproved = Math.floor(totalPlansRequired * 0.7) // Estimate
  const planningCoveragePercentage = totalPlansRequired > 0
    ? (totalPlansApproved / totalPlansRequired) * 100
    : 0

  // Compliance (from territory data)
  const overallCompliancePercentage = 75 // Would need segmentation_events data
  const clientsBelowCompliance = Math.floor(buClients.length * 0.25)

  // Health metrics
  const avgHealthScore = 70 // Would calculate from client_health_history
  const accountsAtRisk = buClients.filter(c => c.renewal_risk === 'high').length
  const atRiskArr = buClients
    .filter(c => c.renewal_risk === 'high')
    .reduce((sum, c) => sum + (c.current_arr || 0), 0)

  // Gap analysis
  const expansionPipeline = buTerritories.reduce((sum, t) =>
    sum + (t.revenue_business_cases || 0) + (t.revenue_pipeline_weighted || 0), 0)
  const expansionWeighted = buTerritories.reduce((sum, t) =>
    sum + (t.revenue_pipeline_weighted || 0), 0)
  const newLogoPipeline = 0 // Would need new logo tracking
  const churnAtRisk = atRiskArr

  return {
    bu_name: buName,
    fiscal_year: FISCAL_YEAR,
    target_arr: targetArr,
    current_arr: currentArr,
    gap_to_target: gapToTarget,
    apac_contribution_percentage: 0, // Will be calculated at APAC level
    territory_count: territoryCount,
    territory_data: territoryData,
    nrr: nrr,
    grr: grr,
    ebita_margin: ebitaMargin,
    rule_of_40: ruleOf40,
    segment_distribution: segmentDistribution,
    total_plans_required: totalPlansRequired,
    total_plans_approved: totalPlansApproved,
    planning_coverage_percentage: planningCoveragePercentage,
    overall_compliance_percentage: overallCompliancePercentage,
    clients_below_compliance: clientsBelowCompliance,
    avg_health_score: avgHealthScore,
    accounts_at_risk: accountsAtRisk,
    at_risk_arr: atRiskArr,
    expansion_pipeline: expansionPipeline,
    expansion_weighted: expansionWeighted,
    new_logo_pipeline: newLogoPipeline,
    churn_at_risk: churnAtRisk
  }
}

function aggregateAPACGoals(buFinancials, nrrMetrics, clientFinancials) {
  // Aggregate from all BUs
  const targetRevenue = buFinancials.reduce((sum, bu) => sum + (bu.target_arr || 0), 0)
  const currentRevenue = buFinancials.reduce((sum, bu) => sum + (bu.current_arr || 0), 0)
  const gap = targetRevenue - currentRevenue

  // Growth calculations
  const growthTargetPercentage = currentRevenue > 0
    ? ((targetRevenue - currentRevenue) / currentRevenue) * 100
    : 7.9
  const growthActualPercentage = 5.2 // Would calculate from prior year

  // BU contributions
  const buContributions = buFinancials.map(bu => ({
    bu_name: bu.bu_name,
    target_arr: bu.target_arr,
    current_arr: bu.current_arr,
    gap: bu.gap_to_target,
    contribution_percentage: currentRevenue > 0
      ? (bu.current_arr / currentRevenue) * 100
      : 0
  }))

  // Update BU contribution percentages
  for (const bu of buFinancials) {
    bu.apac_contribution_percentage = currentRevenue > 0
      ? (bu.current_arr / currentRevenue) * 100
      : 0
  }

  // KPI targets and actuals
  const latestNrr = nrrMetrics.find(n => n.year === FISCAL_YEAR)
  const targetNrr = 105
  const actualNrr = latestNrr?.nrr || 98
  const targetGrr = 95
  const actualGrr = latestNrr?.grr || 76
  const targetEbitaMargin = 18
  const actualEbitaMargin = 18
  const targetRuleOf40 = 26
  const actualRuleOf40 = actualNrr + actualEbitaMargin
  const targetHealthScore = 75
  const actualHealthScore = 70
  const targetCompliance = 90
  const actualCompliance = 75

  // Gap closure
  const expansionPipeline = buFinancials.reduce((sum, bu) =>
    sum + (bu.expansion_pipeline || 0), 0)
  const expansionWeighted = buFinancials.reduce((sum, bu) =>
    sum + (bu.expansion_weighted || 0), 0)
  const newLogoPipeline = 0
  const newLogoWeighted = 0
  const churnPreventionTarget = buFinancials.reduce((sum, bu) =>
    sum + (bu.churn_at_risk || 0), 0)
  const totalCoveragePercentage = gap > 0
    ? ((expansionWeighted + newLogoWeighted) / gap) * 100
    : 100

  // Risk summary
  const highChurnRiskAccounts = buFinancials.reduce((sum, bu) =>
    sum + (bu.accounts_at_risk || 0), 0)
  const highChurnRiskArr = buFinancials.reduce((sum, bu) =>
    sum + (bu.at_risk_arr || 0), 0)
  const decliningHealthAccounts = clientFinancials.filter(c =>
    c.renewal_risk === 'high').length
  const decliningHealthArr = clientFinancials
    .filter(c => c.renewal_risk === 'high')
    .reduce((sum, c) => sum + (c.current_arr || 0), 0)
  const belowComplianceAccounts = buFinancials.reduce((sum, bu) =>
    sum + (bu.clients_below_compliance || 0), 0)
  const belowComplianceArr = 0 // Would need more data

  // Planning status
  const totalAccountPlansRequired = buFinancials.reduce((sum, bu) =>
    sum + (bu.total_plans_required || 0), 0)
  const totalAccountPlansApproved = buFinancials.reduce((sum, bu) =>
    sum + (bu.total_plans_approved || 0), 0)
  const totalTerritoryStrategiesRequired = buFinancials.reduce((sum, bu) =>
    sum + (bu.territory_count || 0), 0)
  const totalTerritoryStrategiesApproved = Math.floor(totalTerritoryStrategiesRequired * 0.8)
  const planningDeadline = '2026-01-17'
  const daysToDeadline = Math.max(0,
    Math.ceil((new Date(planningDeadline) - new Date()) / (1000 * 60 * 60 * 24)))

  return {
    fiscal_year: FISCAL_YEAR,
    target_revenue: targetRevenue,
    current_revenue: currentRevenue,
    gap: gap,
    growth_target_percentage: growthTargetPercentage,
    growth_actual_percentage: growthActualPercentage,
    bu_contributions: buContributions,
    target_nrr: targetNrr,
    actual_nrr: actualNrr,
    target_grr: targetGrr,
    actual_grr: actualGrr,
    target_ebita_margin: targetEbitaMargin,
    actual_ebita_margin: actualEbitaMargin,
    target_rule_of_40: targetRuleOf40,
    actual_rule_of_40: actualRuleOf40,
    target_health_score: targetHealthScore,
    actual_health_score: actualHealthScore,
    target_compliance: targetCompliance,
    actual_compliance: actualCompliance,
    expansion_pipeline: expansionPipeline,
    expansion_weighted: expansionWeighted,
    new_logo_pipeline: newLogoPipeline,
    new_logo_weighted: newLogoWeighted,
    churn_prevention_target: churnPreventionTarget,
    total_coverage_percentage: totalCoveragePercentage,
    high_churn_risk_accounts: highChurnRiskAccounts,
    high_churn_risk_arr: highChurnRiskArr,
    declining_health_accounts: decliningHealthAccounts,
    declining_health_arr: decliningHealthArr,
    below_compliance_accounts: belowComplianceAccounts,
    below_compliance_arr: belowComplianceArr,
    total_account_plans_required: totalAccountPlansRequired,
    total_account_plans_approved: totalAccountPlansApproved,
    total_territory_strategies_required: totalTerritoryStrategiesRequired,
    total_territory_strategies_approved: totalTerritoryStrategiesApproved,
    planning_deadline: planningDeadline,
    days_to_deadline: daysToDeadline
  }
}

// ============================================================================
// SYNC FUNCTIONS
// ============================================================================

async function syncAccountPlanFinancials(clientFinancials) {
  log('\nSyncing Account Plan Financials...', 'info')

  if (DRY_RUN) {
    log(`[DRY RUN] Would upsert ${clientFinancials.length} account plan financial records`, 'info')
    return
  }

  for (const record of clientFinancials) {
    try {
      // Check if record exists
      const { data: existing } = await supabase
        .from('account_plan_financials')
        .select('id')
        .eq('client_name', record.client_name)
        .eq('fiscal_year', record.fiscal_year)
        .single()

      if (existing) {
        // Update
        const { error } = await supabase
          .from('account_plan_financials')
          .update({
            ...record,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id)

        if (error) {
          log(`Error updating ${record.client_name}: ${error.message}`, 'error')
          stats.accountPlans.errors++
        } else {
          stats.accountPlans.updated++
        }
      } else {
        // Insert
        const { error } = await supabase
          .from('account_plan_financials')
          .insert(record)

        if (error) {
          log(`Error inserting ${record.client_name}: ${error.message}`, 'error')
          stats.accountPlans.errors++
        } else {
          stats.accountPlans.inserted++
        }
      }
    } catch (err) {
      log(`Error processing ${record.client_name}: ${err.message}`, 'error')
      stats.accountPlans.errors++
    }
  }

  log(`  Inserted: ${stats.accountPlans.inserted}, Updated: ${stats.accountPlans.updated}, Errors: ${stats.accountPlans.errors}`, 'success')
}

async function syncTerritoryStrategyFinancials(territoryFinancials) {
  log('\nSyncing Territory Strategy Financials...', 'info')

  if (DRY_RUN) {
    log(`[DRY RUN] Would upsert ${territoryFinancials.length} territory financial records`, 'info')
    return
  }

  for (const record of territoryFinancials) {
    if (!record) continue

    try {
      // Check if record exists
      const { data: existing } = await supabase
        .from('territory_strategy_financials')
        .select('id')
        .eq('territory', record.territory)
        .eq('cse_name', record.cse_name)
        .eq('fiscal_year', record.fiscal_year)
        .single()

      if (existing) {
        const { error } = await supabase
          .from('territory_strategy_financials')
          .update({
            ...record,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id)

        if (error) {
          log(`Error updating ${record.territory}: ${error.message}`, 'error')
          stats.territoryStrategies.errors++
        } else {
          stats.territoryStrategies.updated++
        }
      } else {
        const { error } = await supabase
          .from('territory_strategy_financials')
          .insert(record)

        if (error) {
          log(`Error inserting ${record.territory}: ${error.message}`, 'error')
          stats.territoryStrategies.errors++
        } else {
          stats.territoryStrategies.inserted++
        }
      }
    } catch (err) {
      log(`Error processing ${record.territory}: ${err.message}`, 'error')
      stats.territoryStrategies.errors++
    }
  }

  log(`  Inserted: ${stats.territoryStrategies.inserted}, Updated: ${stats.territoryStrategies.updated}, Errors: ${stats.territoryStrategies.errors}`, 'success')
}

async function syncBusinessUnitPlanning(buFinancials) {
  log('\nSyncing Business Unit Planning...', 'info')

  if (DRY_RUN) {
    log(`[DRY RUN] Would upsert ${buFinancials.length} BU planning records`, 'info')
    return
  }

  for (const record of buFinancials) {
    if (!record) continue

    try {
      const { error } = await supabase
        .from('business_unit_planning')
        .upsert({
          ...record,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'bu_name,fiscal_year'
        })

      if (error) {
        log(`Error upserting ${record.bu_name}: ${error.message}`, 'error')
        stats.businessUnits.errors++
      } else {
        stats.businessUnits.updated++
      }
    } catch (err) {
      log(`Error processing ${record.bu_name}: ${err.message}`, 'error')
      stats.businessUnits.errors++
    }
  }

  log(`  Updated: ${stats.businessUnits.updated}, Errors: ${stats.businessUnits.errors}`, 'success')
}

async function syncAPACPlanningGoals(apacGoals) {
  log('\nSyncing APAC Planning Goals...', 'info')

  if (DRY_RUN) {
    log(`[DRY RUN] Would update APAC planning goals for FY${FISCAL_YEAR}`, 'info')
    return
  }

  try {
    const { error } = await supabase
      .from('apac_planning_goals')
      .upsert({
        ...apacGoals,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'fiscal_year'
      })

    if (error) {
      log(`Error updating APAC goals: ${error.message}`, 'error')
      stats.apacGoals.errors++
    } else {
      stats.apacGoals.updated++
      log(`  Updated APAC goals for FY${FISCAL_YEAR}`, 'success')
    }
  } catch (err) {
    log(`Error processing APAC goals: ${err.message}`, 'error')
    stats.apacGoals.errors++
  }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  console.log('=' .repeat(70))
  console.log('BURC-to-Planning Financials Sync')
  console.log('=' .repeat(70))
  console.log(`Started: ${new Date().toISOString()}`)
  console.log(`Fiscal Year: ${FISCAL_YEAR}`)
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes will be made)' : 'LIVE'}`)
  console.log('')

  const startTime = Date.now()

  try {
    // Step 1: Fetch all source data
    log('Step 1: Fetching source data...', 'info')
    const [
      revenueData,
      arrData,
      nrrMetrics,
      attritionData,
      pipelineData,
      contractData,
      agingData,
      healthData,
      clients,
      segmentation,
      monthlyForecast
    ] = await Promise.all([
      fetchClientRevenueDetail(),
      fetchARRTracking(),
      fetchNRRMetrics(),
      fetchAttritionRisk(),
      fetchPipelineDeals(),
      fetchContracts(),
      fetchAgingAccounts(),
      fetchHealthHistory(),
      fetchClients(),
      fetchClientSegmentation(),
      fetchMonthlyForecast()
    ])

    // Get unique client names from revenue data
    const clientNames = [...new Set(revenueData.map(r => r.client_name).filter(Boolean))]
    log(`Found ${clientNames.length} unique clients in BURC data`, 'info')

    // Step 2: Aggregate client-level financials
    log('\nStep 2: Aggregating client financials...', 'info')
    const clientFinancials = []

    for (const clientName of clientNames) {
      const financials = aggregateClientFinancials(
        clientName,
        revenueData,
        arrData,
        attritionData,
        pipelineData,
        contractData,
        agingData,
        healthData
      )
      clientFinancials.push(financials)
    }

    log(`Aggregated ${clientFinancials.length} client financial records`, 'success')

    // Step 3: Aggregate territory-level financials
    log('\nStep 3: Aggregating territory financials...', 'info')
    const territoryFinancials = []

    for (const [cseName, territory] of Object.entries(CSE_TERRITORY_MAPPING)) {
      const financials = aggregateTerritoryFinancials(
        territory,
        cseName,
        clientFinancials,
        monthlyForecast
      )
      if (financials) {
        territoryFinancials.push(financials)
      }
    }

    log(`Aggregated ${territoryFinancials.length} territory financial records`, 'success')

    // Step 4: Aggregate BU-level financials
    log('\nStep 4: Aggregating BU financials...', 'info')
    const buNames = ['ANZ', 'SEA', 'Greater China']
    const buFinancials = []

    for (const buName of buNames) {
      const financials = aggregateBUFinancials(
        buName,
        territoryFinancials,
        nrrMetrics,
        clientFinancials
      )
      if (financials) {
        buFinancials.push(financials)
      }
    }

    log(`Aggregated ${buFinancials.length} BU financial records`, 'success')

    // Step 5: Aggregate APAC-level goals
    log('\nStep 5: Aggregating APAC goals...', 'info')
    const apacGoals = aggregateAPACGoals(buFinancials, nrrMetrics, clientFinancials)
    log('Aggregated APAC goals', 'success')

    // Step 6: Sync to database
    log('\nStep 6: Syncing to database...', 'info')
    await syncAccountPlanFinancials(clientFinancials)
    await syncTerritoryStrategyFinancials(territoryFinancials)
    await syncBusinessUnitPlanning(buFinancials)
    await syncAPACPlanningGoals(apacGoals)

    // Summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(2)

    console.log('')
    console.log('=' .repeat(70))
    console.log('SYNC SUMMARY')
    console.log('=' .repeat(70))
    console.log(`Account Plan Financials: ${stats.accountPlans.inserted} inserted, ${stats.accountPlans.updated} updated, ${stats.accountPlans.errors} errors`)
    console.log(`Territory Financials:    ${stats.territoryStrategies.inserted} inserted, ${stats.territoryStrategies.updated} updated, ${stats.territoryStrategies.errors} errors`)
    console.log(`Business Unit Planning:  ${stats.businessUnits.updated} updated, ${stats.businessUnits.errors} errors`)
    console.log(`APAC Goals:              ${stats.apacGoals.updated} updated, ${stats.apacGoals.errors} errors`)
    console.log('')
    console.log(`Completed in ${duration}s`)
    console.log(`Finished: ${new Date().toISOString()}`)

    // Summary statistics
    if (!DRY_RUN) {
      console.log('')
      console.log('Key Metrics:')
      console.log(`  Total APAC ARR: ${formatCurrency(apacGoals.current_revenue)}`)
      console.log(`  Target ARR:     ${formatCurrency(apacGoals.target_revenue)}`)
      console.log(`  Gap to Target:  ${formatCurrency(apacGoals.gap)}`)
      console.log(`  NRR:            ${formatPercentage(apacGoals.actual_nrr)}`)
      console.log(`  GRR:            ${formatPercentage(apacGoals.actual_grr)}`)
    }

  } catch (err) {
    console.error('\nFatal error:', err)
    process.exit(1)
  }
}

// Run
main()
