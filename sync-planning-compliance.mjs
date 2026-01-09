#!/usr/bin/env node

/**
 * Segmentation-to-Planning Compliance Sync Job
 *
 * Syncs compliance data from segmentation tables to planning tables:
 * 1. Reads from: segmentation_events, segmentation_event_compliance, tier_event_requirements, client_segmentation
 * 2. Calculates compliance requirements for clients with account_plans
 * 3. Writes to: account_plan_event_requirements
 * 4. Aggregates at territory level to: territory_compliance_summary
 * 5. Updates compliance scores in: business_unit_planning, apac_planning_goals
 *
 * Usage:
 *   node scripts/sync-planning-compliance.mjs [--dry-run] [--year 2026]
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

// Configuration
const DRY_RUN = process.argv.includes('--dry-run')
const YEAR_FLAG_INDEX = process.argv.indexOf('--year')
const FISCAL_YEAR = YEAR_FLAG_INDEX !== -1 && process.argv[YEAR_FLAG_INDEX + 1]
  ? parseInt(process.argv[YEAR_FLAG_INDEX + 1], 10)
  : new Date().getFullYear()

// Compliance status thresholds
const COMPLIANCE_THRESHOLDS = {
  CRITICAL: 50,    // Below 50% = critical
  AT_RISK: 80,     // 50-79% = at_risk
  COMPLIANT: 100,  // 80-99% = compliant (some definitions use 100%)
}

// Supabase setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing required environment variables:')
  if (!supabaseUrl) console.error('  - NEXT_PUBLIC_SUPABASE_URL')
  if (!supabaseKey) console.error('  - SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// Helper functions
function log(message, level = 'info') {
  const timestamp = new Date().toISOString()
  const prefix = {
    info: 'INFO',
    warn: 'WARN',
    error: 'ERROR',
    success: 'OK',
    dry: 'DRY-RUN'
  }[level] || 'INFO'

  console.log(`[${timestamp}] [${prefix}] ${message}`)
}

function calculateComplianceStatus(percentage) {
  if (percentage >= 100) return 'exceeded'
  if (percentage >= COMPLIANCE_THRESHOLDS.AT_RISK) return 'compliant'
  if (percentage >= COMPLIANCE_THRESHOLDS.CRITICAL) return 'at_risk'
  return 'critical'
}

function calculateOverallStatus(percentage) {
  if (percentage >= COMPLIANCE_THRESHOLDS.AT_RISK) return 'compliant'
  if (percentage >= COMPLIANCE_THRESHOLDS.CRITICAL) return 'at_risk'
  return 'critical'
}

// Main sync functions

/**
 * Step 1: Fetch all required data
 */
async function fetchSourceData() {
  log('Fetching source data...')

  // Fetch in parallel for efficiency
  const [
    accountPlansResult,
    clientSegmentationResult,
    tierRequirementsResult,
    eventTypesResult,
    segmentationEventsResult,
    eventComplianceResult,
    tiersResult,
    territoryStrategiesResult,
    buPlanningResult,
    apacGoalsResult
  ] = await Promise.all([
    // Account plans (clients we need to sync)
    supabase
      .from('account_plans')
      .select('id, client_id, client_name, cam_name, cse_partner, fiscal_year, status')
      .eq('fiscal_year', FISCAL_YEAR),

    // Client segmentation (tier assignments)
    supabase
      .from('client_segmentation')
      .select('id, client_name, tier_id, cse_name, client_uuid')
      .is('effective_to', null), // Only active segmentations

    // Tier event requirements
    supabase
      .from('tier_event_requirements')
      .select('tier_id, event_type_id, frequency'),

    // Event types
    supabase
      .from('segmentation_event_types')
      .select('id, event_name, event_code')
      .eq('is_active', true),

    // Segmentation events (completed events)
    supabase
      .from('segmentation_events')
      .select('id, client_name, event_type_id, event_date, completed, event_year')
      .eq('event_year', FISCAL_YEAR),

    // Existing compliance data
    supabase
      .from('segmentation_event_compliance')
      .select('client_name, tier_id, event_type_id, expected_count, actual_count, compliance_percentage, status')
      .eq('year', FISCAL_YEAR),

    // Segmentation tiers
    supabase
      .from('segmentation_tiers')
      .select('id, tier_name'),

    // Territory strategies
    supabase
      .from('territory_strategies')
      .select('id, cse_name, territory, fiscal_year')
      .eq('fiscal_year', FISCAL_YEAR),

    // Business unit planning
    supabase
      .from('business_unit_planning')
      .select('*')
      .eq('fiscal_year', FISCAL_YEAR),

    // APAC planning goals
    supabase
      .from('apac_planning_goals')
      .select('*')
      .eq('fiscal_year', FISCAL_YEAR)
      .maybeSingle()
  ])

  // Check for errors
  const errors = [
    accountPlansResult.error,
    clientSegmentationResult.error,
    tierRequirementsResult.error,
    eventTypesResult.error,
    segmentationEventsResult.error,
    eventComplianceResult.error,
    tiersResult.error,
    territoryStrategiesResult.error,
    buPlanningResult.error,
    apacGoalsResult.error
  ].filter(Boolean)

  if (errors.length > 0) {
    errors.forEach(err => log(`Database error: ${err.message}`, 'error'))
    throw new Error('Failed to fetch source data')
  }

  return {
    accountPlans: accountPlansResult.data || [],
    clientSegmentation: clientSegmentationResult.data || [],
    tierRequirements: tierRequirementsResult.data || [],
    eventTypes: eventTypesResult.data || [],
    segmentationEvents: segmentationEventsResult.data || [],
    eventCompliance: eventComplianceResult.data || [],
    tiers: tiersResult.data || [],
    territoryStrategies: territoryStrategiesResult.data || [],
    buPlanning: buPlanningResult.data || [],
    apacGoals: apacGoalsResult.data
  }
}

/**
 * Step 2: Calculate compliance for each client with an account plan
 */
function calculateClientCompliance(data) {
  log('Calculating client compliance requirements...')

  const {
    accountPlans,
    clientSegmentation,
    tierRequirements,
    eventTypes,
    segmentationEvents,
    eventCompliance,
    tiers
  } = data

  // Build lookup maps
  const tierRequirementsByTier = {}
  tierRequirements.forEach(req => {
    if (!tierRequirementsByTier[req.tier_id]) {
      tierRequirementsByTier[req.tier_id] = []
    }
    tierRequirementsByTier[req.tier_id].push(req)
  })

  const eventTypeMap = new Map(eventTypes.map(et => [et.id, et]))
  const tierMap = new Map(tiers.map(t => [t.id, t]))

  // Group events by client and event type
  const eventsByClientAndType = {}
  segmentationEvents.forEach(event => {
    const key = `${event.client_name}|${event.event_type_id}`
    if (!eventsByClientAndType[key]) {
      eventsByClientAndType[key] = { completed: 0, scheduled: 0, events: [] }
    }
    if (event.completed) {
      eventsByClientAndType[key].completed++
    } else {
      eventsByClientAndType[key].scheduled++
    }
    eventsByClientAndType[key].events.push(event.id)
  })

  // Build compliance lookup from existing data
  const existingComplianceMap = {}
  eventCompliance.forEach(comp => {
    const key = `${comp.client_name}|${comp.event_type_id}`
    existingComplianceMap[key] = comp
  })

  // Client segmentation lookup
  const clientSegMap = new Map(clientSegmentation.map(cs => [cs.client_name, cs]))

  // Calculate compliance for each account plan
  const planEventRequirements = []
  const clientSummaries = []

  for (const plan of accountPlans) {
    const clientSeg = clientSegMap.get(plan.client_name)

    if (!clientSeg || !clientSeg.tier_id) {
      log(`No segmentation found for client: ${plan.client_name}`, 'warn')
      continue
    }

    const tier = tierMap.get(clientSeg.tier_id)
    const tierName = tier?.tier_name || 'Unknown'
    const requirements = tierRequirementsByTier[clientSeg.tier_id] || []

    let totalRequired = 0
    let totalCompleted = 0
    let clientAtRisk = false
    let clientCritical = false

    for (const req of requirements) {
      if (req.frequency <= 0) continue // Skip if no requirement

      const eventType = eventTypeMap.get(req.event_type_id)
      if (!eventType) continue

      const eventKey = `${plan.client_name}|${req.event_type_id}`
      const eventData = eventsByClientAndType[eventKey] || { completed: 0, scheduled: 0, events: [] }
      const existingComp = existingComplianceMap[eventKey]

      const completedCount = eventData.completed
      const scheduledCount = eventData.scheduled
      const requiredCount = req.frequency
      const compliancePercentage = requiredCount > 0
        ? Math.min(Math.round((completedCount / requiredCount) * 100), 200)
        : 100

      const status = calculateComplianceStatus(compliancePercentage)

      if (status === 'at_risk') clientAtRisk = true
      if (status === 'critical') clientCritical = true

      totalRequired += requiredCount
      totalCompleted += completedCount

      planEventRequirements.push({
        plan_id: plan.id,
        client_id: plan.client_id || clientSeg.client_uuid,
        client_name: plan.client_name,
        segment: tierName,
        fiscal_year: FISCAL_YEAR,
        event_type_id: req.event_type_id,
        event_type_name: eventType.event_name,
        required_count: requiredCount,
        completed_count: completedCount,
        scheduled_count: scheduledCount,
        compliance_percentage: compliancePercentage,
        status,
        next_due_date: null, // Could calculate based on frequency
        ai_recommended_dates: null,
        linked_event_ids: eventData.events,
        notes: existingComp?.notes || null
      })
    }

    const overallPercentage = totalRequired > 0
      ? Math.round((totalCompleted / totalRequired) * 100)
      : 100

    clientSummaries.push({
      client_name: plan.client_name,
      segment: tierName,
      cse_name: clientSeg.cse_name,
      total_required: totalRequired,
      total_completed: totalCompleted,
      compliance_percentage: overallPercentage,
      is_at_risk: clientAtRisk && !clientCritical,
      is_critical: clientCritical
    })
  }

  log(`Calculated compliance for ${clientSummaries.length} clients`)
  return { planEventRequirements, clientSummaries }
}

/**
 * Step 3: Aggregate compliance at territory level
 */
function aggregateTerritoryCompliance(clientSummaries, territoryStrategies) {
  log('Aggregating territory compliance...')

  // Group clients by CSE (territory owner)
  const clientsByCSE = {}
  clientSummaries.forEach(client => {
    if (!client.cse_name) return
    if (!clientsByCSE[client.cse_name]) {
      clientsByCSE[client.cse_name] = []
    }
    clientsByCSE[client.cse_name].push(client)
  })

  // Build territory summaries
  const territorySummaries = []

  for (const strategy of territoryStrategies) {
    const clients = clientsByCSE[strategy.cse_name] || []

    if (clients.length === 0) {
      log(`No clients found for CSE: ${strategy.cse_name}`, 'warn')
      continue
    }

    const totalRequired = clients.reduce((sum, c) => sum + c.total_required, 0)
    const totalCompleted = clients.reduce((sum, c) => sum + c.total_completed, 0)
    const clientsAtRisk = clients.filter(c => c.is_at_risk).length
    const clientsCritical = clients.filter(c => c.is_critical).length

    const overallPercentage = totalRequired > 0
      ? Math.round((totalCompleted / totalRequired) * 100)
      : 100

    // Segment breakdown
    const segmentBreakdown = {}
    clients.forEach(client => {
      if (!segmentBreakdown[client.segment]) {
        segmentBreakdown[client.segment] = { clients: 0, total_required: 0, total_completed: 0 }
      }
      segmentBreakdown[client.segment].clients++
      segmentBreakdown[client.segment].total_required += client.total_required
      segmentBreakdown[client.segment].total_completed += client.total_completed
    })

    // Calculate compliance per segment
    for (const seg in segmentBreakdown) {
      const s = segmentBreakdown[seg]
      s.compliance = s.total_required > 0
        ? Math.round((s.total_completed / s.total_required) * 100)
        : 100
    }

    territorySummaries.push({
      territory_strategy_id: strategy.id,
      territory: strategy.territory,
      cse_name: strategy.cse_name,
      fiscal_year: FISCAL_YEAR,
      total_clients: clients.length,
      total_required_events: totalRequired,
      total_completed_events: totalCompleted,
      overall_compliance_percentage: overallPercentage,
      clients_at_risk: clientsAtRisk,
      clients_critical: clientsCritical,
      segment_breakdown: segmentBreakdown,
      monthly_capacity: null // Could calculate based on frequency distribution
    })
  }

  log(`Aggregated compliance for ${territorySummaries.length} territories`)
  return territorySummaries
}

/**
 * Step 4: Calculate business unit rollups
 */
function calculateBUCompliance(territorySummaries, buPlanning) {
  log('Calculating business unit compliance rollups...')

  // Map territories to BUs (based on CSE assignments - simplified mapping)
  // In a real system, you'd have a territory_to_bu mapping table
  const territoryBUMap = {
    // ANZ territories (Australia/New Zealand CSEs)
    'Jimmy Leimonitis': 'ANZ',
    'Tracey Atkinson': 'ANZ',
    'John Papandrea': 'ANZ',
    'Sarah Mitchell': 'ANZ',
    // SEA territories
    'Boon Kiat Ng': 'SEA',
    // Greater China - could add more
  }

  // Group territories by BU
  const territoriesByBU = {}
  territorySummaries.forEach(ts => {
    const bu = territoryBUMap[ts.cse_name] || 'ANZ' // Default to ANZ
    if (!territoriesByBU[bu]) {
      territoriesByBU[bu] = []
    }
    territoriesByBU[bu].push(ts)
  })

  // Calculate BU-level updates
  const buUpdates = []

  for (const buPlan of buPlanning) {
    const territories = territoriesByBU[buPlan.bu_name] || []

    if (territories.length === 0) continue

    const totalClients = territories.reduce((sum, t) => sum + t.total_clients, 0)
    const totalRequired = territories.reduce((sum, t) => sum + t.total_required_events, 0)
    const totalCompleted = territories.reduce((sum, t) => sum + t.total_completed_events, 0)
    const clientsBelowCompliance = territories.reduce((sum, t) => sum + t.clients_at_risk + t.clients_critical, 0)

    const overallPercentage = totalRequired > 0
      ? Math.round((totalCompleted / totalRequired) * 100)
      : 100

    buUpdates.push({
      id: buPlan.id,
      overall_compliance_percentage: overallPercentage,
      clients_below_compliance: clientsBelowCompliance,
      territory_count: territories.length,
      territory_data: territories.map(t => ({
        territory: t.territory,
        cse_name: t.cse_name,
        clients: t.total_clients,
        compliance: t.overall_compliance_percentage
      }))
    })
  }

  log(`Calculated compliance for ${buUpdates.length} business units`)
  return buUpdates
}

/**
 * Step 5: Calculate APAC-wide rollup
 */
function calculateAPACCompliance(buUpdates, apacGoals) {
  log('Calculating APAC compliance rollup...')

  if (!apacGoals) {
    log('No APAC goals found for fiscal year', 'warn')
    return null
  }

  const totalClientsBelowCompliance = buUpdates.reduce((sum, bu) => sum + (bu.clients_below_compliance || 0), 0)

  // Weighted average compliance across BUs
  const totalContributions = buUpdates.reduce((sum, bu) => sum + 1, 0)
  const avgCompliance = totalContributions > 0
    ? Math.round(buUpdates.reduce((sum, bu) => sum + (bu.overall_compliance_percentage || 0), 0) / totalContributions)
    : 0

  return {
    id: apacGoals.id,
    actual_compliance: avgCompliance,
    below_compliance_accounts: totalClientsBelowCompliance,
    bu_contributions: buUpdates.map(bu => ({
      bu_name: bu.id, // We'd need the bu_name here
      compliance: bu.overall_compliance_percentage,
      clients_below: bu.clients_below_compliance
    }))
  }
}

/**
 * Step 6: Write results to database
 */
async function writeResults({ planEventRequirements, territorySummaries, buUpdates, apacUpdate }) {
  if (DRY_RUN) {
    log('DRY RUN - No changes will be made to database', 'dry')
    log(`Would upsert ${planEventRequirements.length} account_plan_event_requirements`, 'dry')
    log(`Would upsert ${territorySummaries.length} territory_compliance_summary`, 'dry')
    log(`Would update ${buUpdates.length} business_unit_planning`, 'dry')
    if (apacUpdate) log('Would update 1 apac_planning_goals', 'dry')
    return
  }

  log('Writing results to database...')
  let successCount = 0
  let errorCount = 0

  // 1. Upsert account plan event requirements
  if (planEventRequirements.length > 0) {
    // First, clear existing requirements for these plans
    const planIds = [...new Set(planEventRequirements.map(r => r.plan_id))]

    for (const planId of planIds) {
      const { error: deleteError } = await supabase
        .from('account_plan_event_requirements')
        .delete()
        .eq('plan_id', planId)
        .eq('fiscal_year', FISCAL_YEAR)

      if (deleteError) {
        log(`Error clearing existing requirements for plan ${planId}: ${deleteError.message}`, 'error')
        errorCount++
      }
    }

    // Insert new requirements
    const { error: insertError } = await supabase
      .from('account_plan_event_requirements')
      .insert(planEventRequirements.map(r => ({
        ...r,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })))

    if (insertError) {
      log(`Error inserting account plan event requirements: ${insertError.message}`, 'error')
      errorCount++
    } else {
      successCount += planEventRequirements.length
      log(`Inserted ${planEventRequirements.length} account plan event requirements`, 'success')
    }
  }

  // 2. Upsert territory compliance summaries
  for (const summary of territorySummaries) {
    // Try to find existing record
    const { data: existing } = await supabase
      .from('territory_compliance_summary')
      .select('id')
      .eq('territory_strategy_id', summary.territory_strategy_id)
      .eq('fiscal_year', FISCAL_YEAR)
      .maybeSingle()

    if (existing) {
      // Update existing
      const { error } = await supabase
        .from('territory_compliance_summary')
        .update({
          ...summary,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)

      if (error) {
        log(`Error updating territory compliance for ${summary.cse_name}: ${error.message}`, 'error')
        errorCount++
      } else {
        successCount++
      }
    } else {
      // Insert new
      const { error } = await supabase
        .from('territory_compliance_summary')
        .insert({
          ...summary,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })

      if (error) {
        log(`Error inserting territory compliance for ${summary.cse_name}: ${error.message}`, 'error')
        errorCount++
      } else {
        successCount++
      }
    }
  }

  log(`Processed ${territorySummaries.length} territory compliance summaries`, 'success')

  // 3. Update business unit planning
  for (const update of buUpdates) {
    const { error } = await supabase
      .from('business_unit_planning')
      .update({
        overall_compliance_percentage: update.overall_compliance_percentage,
        clients_below_compliance: update.clients_below_compliance,
        territory_count: update.territory_count,
        territory_data: update.territory_data,
        updated_at: new Date().toISOString()
      })
      .eq('id', update.id)

    if (error) {
      log(`Error updating BU planning: ${error.message}`, 'error')
      errorCount++
    } else {
      successCount++
    }
  }

  log(`Updated ${buUpdates.length} business unit planning records`, 'success')

  // 4. Update APAC planning goals
  if (apacUpdate) {
    const { error } = await supabase
      .from('apac_planning_goals')
      .update({
        actual_compliance: apacUpdate.actual_compliance,
        below_compliance_accounts: apacUpdate.below_compliance_accounts,
        updated_at: new Date().toISOString()
      })
      .eq('id', apacUpdate.id)

    if (error) {
      log(`Error updating APAC planning goals: ${error.message}`, 'error')
      errorCount++
    } else {
      successCount++
      log('Updated APAC planning goals', 'success')
    }
  }

  log(`Sync complete: ${successCount} successful operations, ${errorCount} errors`)
  return { successCount, errorCount }
}

/**
 * Main execution
 */
async function main() {
  console.log('\n' + '='.repeat(70))
  console.log('  SEGMENTATION-TO-PLANNING COMPLIANCE SYNC')
  console.log('='.repeat(70))
  console.log(`  Fiscal Year: ${FISCAL_YEAR}`)
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE'}`)
  console.log('='.repeat(70) + '\n')

  try {
    // Step 1: Fetch all source data
    const sourceData = await fetchSourceData()

    log(`Found ${sourceData.accountPlans.length} account plans`)
    log(`Found ${sourceData.clientSegmentation.length} client segmentations`)
    log(`Found ${sourceData.tierRequirements.length} tier requirements`)
    log(`Found ${sourceData.segmentationEvents.length} segmentation events`)
    log(`Found ${sourceData.territoryStrategies.length} territory strategies`)
    log(`Found ${sourceData.buPlanning.length} business unit plans`)

    // Step 2: Calculate client-level compliance
    const { planEventRequirements, clientSummaries } = calculateClientCompliance(sourceData)

    // Step 3: Aggregate at territory level
    const territorySummaries = aggregateTerritoryCompliance(
      clientSummaries,
      sourceData.territoryStrategies
    )

    // Step 4: Calculate BU rollups
    const buUpdates = calculateBUCompliance(
      territorySummaries,
      sourceData.buPlanning
    )

    // Step 5: Calculate APAC rollup
    const apacUpdate = calculateAPACCompliance(
      buUpdates,
      sourceData.apacGoals
    )

    // Step 6: Write results
    const result = await writeResults({
      planEventRequirements,
      territorySummaries,
      buUpdates,
      apacUpdate
    })

    console.log('\n' + '='.repeat(70))
    console.log('  SYNC COMPLETE')
    console.log('='.repeat(70))

    if (DRY_RUN) {
      console.log('\n  This was a dry run. Run without --dry-run to apply changes.\n')
    }

    // Summary statistics
    console.log('\n  Summary:')
    console.log(`    - Clients processed: ${clientSummaries.length}`)
    console.log(`    - Event requirements calculated: ${planEventRequirements.length}`)
    console.log(`    - Territories aggregated: ${territorySummaries.length}`)
    console.log(`    - Business units updated: ${buUpdates.length}`)
    console.log(`    - APAC goals updated: ${apacUpdate ? 'Yes' : 'No'}`)

    const atRiskClients = clientSummaries.filter(c => c.is_at_risk).length
    const criticalClients = clientSummaries.filter(c => c.is_critical).length
    console.log(`\n  Compliance Status:`)
    console.log(`    - At Risk: ${atRiskClients} clients`)
    console.log(`    - Critical: ${criticalClients} clients`)
    console.log(`    - Compliant: ${clientSummaries.length - atRiskClients - criticalClients} clients`)

    console.log('\n')

  } catch (error) {
    log(`Fatal error: ${error.message}`, 'error')
    console.error(error)
    process.exit(1)
  }
}

// Execute
main()
