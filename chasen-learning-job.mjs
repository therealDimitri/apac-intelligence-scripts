#!/usr/bin/env node
/**
 * ChaSen Continuous Learning Job
 *
 * This background job runs daily to:
 * 1. Take snapshots of all client metrics
 * 2. Measure outcomes for completed recommendations (30/60/90 days after)
 * 3. Update success patterns with before/after results
 * 4. Calculate success scores and effectiveness rates
 *
 * Run via cron: 0 2 * * * node scripts/chasen-learning-job.mjs
 */

import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

// Load environment variables
dotenv.config({ path: '.env.local' })

// Initialize Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

const currentYear = new Date().getFullYear()
const today = new Date().toISOString().split('T')[0]

// ============================================================================
// 1. TAKE DAILY CLIENT METRIC SNAPSHOTS
// ============================================================================

async function takeClientSnapshots() {
  console.log('\n📸 Taking daily client metric snapshots...')

  try {
    // Get all clients
    const { data: clients, error: clientsError } = await supabase
      .from('clients')
      .select('*')

    if (clientsError) throw clientsError

    console.log(`Found ${clients.length} clients to snapshot`)

    let successCount = 0
    let errorCount = 0

    for (const client of clients) {
      try {
        // Fetch client metrics
        const [
          { data: actions },
          { data: meetings },
          { data: compliance },
          { data: aging }
        ] = await Promise.all([
          supabase.from('actions').select('*').ilike('client', client.name).not('Status', 'eq', 'Completed'),
          supabase.from('unified_meetings').select('*').ilike('client', client.name).order('date', { ascending: false }).limit(30),
          supabase.from('event_compliance_by_type').select('*').ilike('client_name', client.name).eq('year', currentYear),
          supabase.from('aging_accounts_compliance').select('*').ilike('client_name', client.name).single()
        ])

        const openActions = actions?.length || 0
        const overdueActions = actions?.filter(a => a.DueDate && new Date(a.DueDate) < new Date()).length || 0

        const lastMeeting = meetings?.[0]
        const daysSinceLastMeeting = lastMeeting
          ? Math.floor((Date.now() - new Date(lastMeeting.date).getTime()) / (1000 * 60 * 60 * 24))
          : null

        const meetingsLast30Days = meetings?.filter(m => {
          const daysSince = Math.floor((Date.now() - new Date(m.date).getTime()) / (1000 * 60 * 60 * 24))
          return daysSince <= 30
        }).length || 0

        const overallCompliance = compliance?.[0]?.overall_compliance_score || null

        // Insert snapshot (upsert to handle duplicates)
        const { error: snapshotError } = await supabase
          .from('client_metric_snapshots')
          .upsert({
            client_name: client.name,
            snapshot_date: today,
            health_score: client.health_score,
            nps_score: client.nps_score,
            compliance_score: overallCompliance,
            event_compliance: compliance,
            days_since_last_meeting: daysSinceLastMeeting,
            meetings_last_30_days: meetingsLast30Days,
            open_actions: openActions,
            overdue_actions: overdueActions,
            aging_under_60_pct: aging?.compliance?.under_60_days_percentage,
            aging_under_90_pct: aging?.compliance?.under_90_days_percentage,
            days_to_renewal: client.days_to_renewal,
            revenue_at_risk: client.revenue_at_risk
          }, {
            onConflict: 'client_name,snapshot_date'
          })

        if (snapshotError) {
          console.error(`  ❌ Error for ${client.name}:`, snapshotError.message)
          errorCount++
        } else {
          successCount++
        }
      } catch (error) {
        console.error(`  ❌ Error processing ${client.name}:`, error.message)
        errorCount++
      }
    }

    console.log(`✅ Snapshots complete: ${successCount} successful, ${errorCount} errors`)
  } catch (error) {
    console.error('❌ Error taking client snapshots:', error)
  }
}

// ============================================================================
// 2. MEASURE OUTCOMES FOR COMPLETED RECOMMENDATIONS
// ============================================================================

async function measureRecommendationOutcomes() {
  console.log('\n📊 Measuring outcomes for completed recommendations...')

  try {
    // Get success patterns that need outcome measurement
    // (applied >= 30 days ago, but not yet measured)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const { data: patterns, error: patternsError } = await supabase
      .from('chasen_success_patterns')
      .select('*')
      .lte('applied_at', thirtyDaysAgo)
      .is('health_score_after', null) // Not yet measured

    if (patternsError) throw patternsError

    if (!patterns || patterns.length === 0) {
      console.log('No patterns ready for outcome measurement')
      return
    }

    console.log(`Found ${patterns.length} patterns to measure`)

    let measuredCount = 0
    let errorCount = 0

    for (const pattern of patterns) {
      try {
        // Get current metrics for the client
        const { data: client, error: clientError } = await supabase
          .from('clients')
          .select('*')
          .ilike('name', pattern.client_name)
          .single()

        if (clientError || !client) {
          console.error(`  ❌ Client not found: ${pattern.client_name}`)
          errorCount++
          continue
        }

        // Get current compliance
        const { data: compliance } = await supabase
          .from('event_compliance_by_type')
          .select('*')
          .ilike('client_name', pattern.client_name)
          .eq('year', currentYear)
          .single()

        // Get current engagement
        const { data: meetings } = await supabase
          .from('unified_meetings')
          .select('*')
          .ilike('client', pattern.client_name)
          .order('date', { ascending: false })
          .limit(1)

        const lastMeeting = meetings?.[0]
        const daysSinceLastMeeting = lastMeeting
          ? Math.floor((Date.now() - new Date(lastMeeting.date).getTime()) / (1000 * 60 * 60 * 24))
          : null

        // Calculate improvements
        const healthImprovement = (client.health_score || 0) - (pattern.health_score_before || 0)
        const npsImprovement = (client.nps_score || 0) - (pattern.nps_score_before || 0)
        const complianceImprovement = (compliance?.overall_compliance_score || 0) - (pattern.compliance_score_before || 0)
        const engagementImprovement = (pattern.engagement_score_before || 0) - (daysSinceLastMeeting || 0) // Lower is better

        // Calculate overall success score (0-1)
        const successScore = Math.max(0, Math.min(1,
          (
            (healthImprovement > 0 ? 0.3 : 0) +
            (npsImprovement > 0 ? 0.3 : 0) +
            (complianceImprovement > 0 ? 0.2 : 0) +
            (engagementImprovement > 0 ? 0.2 : 0)
          ) + (healthImprovement / 100) * 0.3
        ))

        const daysToImprovement = Math.floor(
          (new Date().getTime() - new Date(pattern.applied_at).getTime()) / (1000 * 60 * 60 * 24)
        )

        // Determine confidence level
        let confidenceLevel = 'low'
        if (Math.abs(healthImprovement) > 10 || Math.abs(npsImprovement) > 15) {
          confidenceLevel = 'high'
        } else if (Math.abs(healthImprovement) > 5 || Math.abs(npsImprovement) > 5) {
          confidenceLevel = 'medium'
        }

        // Update pattern with outcome data
        const { error: updateError } = await supabase
          .from('chasen_success_patterns')
          .update({
            health_score_after: client.health_score,
            nps_score_after: client.nps_score,
            compliance_score_after: compliance?.overall_compliance_score,
            engagement_score_after: daysSinceLastMeeting,
            health_improvement: healthImprovement,
            nps_improvement: npsImprovement,
            compliance_improvement: complianceImprovement,
            engagement_improvement: engagementImprovement,
            days_to_improvement: daysToImprovement,
            success_score: successScore,
            confidence_level: confidenceLevel,
            measured_at: new Date().toISOString()
          })
          .eq('id', pattern.id)

        if (updateError) {
          console.error(`  ❌ Error updating pattern ${pattern.id}:`, updateError.message)
          errorCount++
        } else {
          console.log(`  ✅ Measured ${pattern.client_name}: Success Score = ${(successScore * 100).toFixed(0)}%, Health Δ = ${healthImprovement > 0 ? '+' : ''}${healthImprovement.toFixed(1)}`)
          measuredCount++
        }
      } catch (error) {
        console.error(`  ❌ Error processing pattern ${pattern.id}:`, error.message)
        errorCount++
      }
    }

    console.log(`✅ Outcome measurement complete: ${measuredCount} measured, ${errorCount} errors`)
  } catch (error) {
    console.error('❌ Error measuring outcomes:', error)
  }
}

// ============================================================================
// 3. UPDATE SUCCESS RATES FOR PATTERNS
// ============================================================================

async function updateSuccessRates() {
  console.log('\n📈 Updating success rates for patterns...')

  try {
    // Get all unique pattern combinations
    const { data: patterns, error } = await supabase
      .from('chasen_success_patterns')
      .select('pattern_name, client_segment, success_score, id')
      .not('success_score', 'is', null)

    if (error) throw error

    // Group by pattern_name + segment
    const patternGroups = new Map()

    patterns?.forEach(pattern => {
      const key = `${pattern.pattern_name}:${pattern.client_segment}`
      if (!patternGroups.has(key)) {
        patternGroups.set(key, [])
      }
      patternGroups.get(key).push(pattern)
    })

    console.log(`Found ${patternGroups.size} unique pattern groups`)

    for (const [key, group] of patternGroups) {
      const successCount = group.filter(p => p.success_score >= 0.6).length
      const totalCount = group.length
      const successRate = totalCount > 0 ? successCount / totalCount : 0

      // Update all patterns in this group
      const [patternName, segment] = key.split(':')

      const { error: updateError } = await supabase
        .from('chasen_success_patterns')
        .update({
          times_applied: totalCount,
          success_rate: successRate
        })
        .eq('pattern_name', patternName)
        .eq('client_segment', segment)

      if (updateError) {
        console.error(`  ❌ Error updating ${key}:`, updateError.message)
      } else {
        console.log(`  ✅ ${key}: ${successCount}/${totalCount} successful (${(successRate * 100).toFixed(0)}%)`)
      }
    }

    console.log('✅ Success rates updated')
  } catch (error) {
    console.error('❌ Error updating success rates:', error)
  }
}

// ============================================================================
// 4. REFRESH MATERIALIZED VIEW
// ============================================================================

async function refreshMaterializedView() {
  console.log('\n🔄 Refreshing recommendation effectiveness materialized view...')

  try {
    const { error } = await supabase
      .rpc('exec', {
        sql: 'REFRESH MATERIALIZED VIEW chasen_recommendation_effectiveness;'
      })

    if (error) {
      console.error('❌ Error refreshing materialized view:', error)
    } else {
      console.log('✅ Materialized view refreshed')
    }
  } catch (error) {
    console.error('❌ Error refreshing view:', error)
  }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('🧠 ChaSen Continuous Learning Job')
  console.log('═══════════════════════════════════════════════════════════')
  console.log(`Started at: ${new Date().toISOString()}`)

  const startTime = Date.now()

  try {
    // Run all tasks
    await takeClientSnapshots()
    await measureRecommendationOutcomes()
    await updateSuccessRates()
    await refreshMaterializedView()

    const duration = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log('\n═══════════════════════════════════════════════════════════')
    console.log(`✅ ChaSen learning job completed in ${duration}s`)
    console.log('═══════════════════════════════════════════════════════════\n')
  } catch (error) {
    console.error('\n❌ ChaSen learning job failed:', error)
    process.exit(1)
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}

export { main }
