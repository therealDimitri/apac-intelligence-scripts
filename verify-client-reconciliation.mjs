#!/usr/bin/env node

/**
 * Verify Client Reconciliation - Checks if all client data is reconciling correctly
 *
 * Compares:
 * - client_health_summary (action count, NPS, compliance, health score)
 * - actions table (with alias resolution)
 * - nps_responses table
 * - segmentation_event_compliance
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function getClientAliases() {
  const { data, error } = await supabase
    .from('client_name_aliases')
    .select('display_name, canonical_name')

  if (error) throw error

  const aliasMap = new Map()
  data?.forEach(alias => {
    aliasMap.set(alias.display_name.toLowerCase(), alias.canonical_name.toLowerCase())
  })

  return aliasMap
}

function resolveClientName(name, aliasMap) {
  if (!name) return ''
  const cleaned = name.trim().replace(/[,;.]+$/, '').toLowerCase()
  return aliasMap.get(cleaned) || cleaned
}

async function main() {
  console.log('🔍 Client Reconciliation Verification\n')
  console.log('='.repeat(80))

  // Get aliases
  const aliasMap = await getClientAliases()
  console.log(`📚 Loaded ${aliasMap.size} client aliases\n`)

  // Get all clients from health summary
  const { data: clients, error: clientsError } = await supabase
    .from('client_health_summary')
    .select('client_name, health_score, status, nps_score, total_actions_count, completed_actions_count, completion_rate')
    .order('client_name')

  if (clientsError) throw clientsError

  // Get all actions - note: column names are case-sensitive (Status, not status)
  const { data: actions, error: actionsError } = await supabase
    .from('actions')
    .select('id, client, Status')

  if (actionsError) throw actionsError

  // Get all NPS responses - note: column is 'score' not 'nps_score'
  const { data: npsResponses, error: npsError } = await supabase
    .from('nps_responses')
    .select('id, client_name, score')

  if (npsError) throw npsError

  // Get compliance data - table may not exist, handle gracefully
  let compliance = []
  try {
    const { data, error } = await supabase
      .from('segmentation_event_compliance')
      .select('client, events_completed, total_events')
    if (!error) compliance = data || []
  } catch (e) {
    console.log('⚠️  segmentation_event_compliance table not available')
  }

  const issues = []

  for (const client of clients) {
    const clientNameLower = client.client_name.toLowerCase()

    // Count actions with alias resolution
    const clientActions = actions.filter(action => {
      const resolved = resolveClientName(action.client, aliasMap)
      return resolved === clientNameLower
    })

    // Also count by exact match only (to show difference)
    const exactMatchActions = actions.filter(
      action => action.client && action.client.toLowerCase() === clientNameLower
    )

    // Count NPS with alias resolution
    const clientNps = npsResponses.filter(nps => {
      const resolved = resolveClientName(nps.client_name || '', aliasMap)
      return resolved === clientNameLower
    })

    // Count compliance with alias resolution
    const clientCompliance = compliance.filter(c => {
      const resolved = resolveClientName(c.client || '', aliasMap)
      return resolved === clientNameLower
    })

    // Get summary values (note: column is total_actions_count, not action_count)
    const summaryActionCount = client.total_actions_count || 0
    const summaryNpsScore = client.nps_score
    const aliasActionCount = clientActions.length
    const exactActionCount = exactMatchActions.length

    const clientIssues = []

    // Check for action count mismatch
    if (summaryActionCount !== aliasActionCount) {
      clientIssues.push(`Actions: Summary=${summaryActionCount}, WithAliases=${aliasActionCount}, ExactMatch=${exactActionCount}`)
    }

    // Check for NPS mismatches
    if (clientNps.length > 0 && summaryNpsScore !== null) {
      const promoters = clientNps.filter(n => n.score >= 9).length
      const detractors = clientNps.filter(n => n.score <= 6).length
      const calculatedNps = Math.round(((promoters - detractors) / clientNps.length) * 100)

      if (Math.abs(calculatedNps - summaryNpsScore) > 5) {
        clientIssues.push(`NPS: Summary=${summaryNpsScore}, Calculated=${calculatedNps} (P=${promoters}, D=${detractors}, N=${clientNps.length})`)
      }
    }

    // Check for compliance data presence (only if compliance table exists)
    if (compliance.length > 0 && clientCompliance.length === 0) {
      clientIssues.push('Compliance: No compliance data found')
    }

    if (clientIssues.length > 0) {
      issues.push({
        client: client.client_name,
        healthScore: client.health_score,
        status: client.health_status,
        issues: clientIssues
      })
    }
  }

  // Print results
  console.log(`\n📊 Clients Analyzed: ${clients.length}`)
  console.log(`⚠️  Clients with Issues: ${issues.length}`)
  console.log('')

  if (issues.length === 0) {
    console.log('✅ All clients reconcile correctly!')
  } else {
    console.log('Issues Found:\n')

    for (const issue of issues) {
      console.log(`\n📋 ${issue.client}`)
      console.log(`   Health Score: ${issue.healthScore} (${issue.status})`)
      for (const i of issue.issues) {
        console.log(`   ⚠️  ${i}`)
      }
    }
  }

  console.log('\n' + '='.repeat(80))
  console.log('Done!')
}

main().catch(console.error)
