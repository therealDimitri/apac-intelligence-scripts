#!/usr/bin/env node

/**
 * Backfill Alerts Script
 *
 * This script:
 * 1. Detects alerts from current data (overdue actions, health declines, NPS risks, etc.)
 * 2. Persists them to the alerts table
 * 3. Links existing actions to their source alerts where possible
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'

// Load environment variables
config({ path: resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// Generate simple hash for fingerprinting
function generateFingerprint(category, clientName, currentValue) {
  const data = `${category}|${clientName.toLowerCase().trim()}|${currentValue || ''}`
  let hash = 0
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(16).padStart(8, '0')
}

// Parse Australian date format (DD/MM/YYYY)
function parseDate(dateStr) {
  if (!dateStr) return null
  const parts = dateStr.split('/')
  if (parts.length === 3) {
    return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`)
  }
  return new Date(dateStr)
}

// Calculate days overdue
function daysOverdue(dueDate) {
  if (!dueDate) return 0
  const due = parseDate(dueDate)
  if (!due || isNaN(due.getTime())) return 0
  const now = new Date()
  const diff = Math.floor((now - due) / (1000 * 60 * 60 * 24))
  return Math.max(0, diff)
}

async function backfillAlerts() {
  console.log('🔄 Starting alert backfill...\n')

  const stats = {
    overdueActions: 0,
    healthDeclines: 0,
    npsRisks: 0,
    complianceRisks: 0,
    totalCreated: 0,
    duplicatesSkipped: 0,
    actionsLinked: 0,
    errors: []
  }

  // 1. Fetch overdue actions
  console.log('📋 Fetching overdue actions...')
  const { data: actions, error: actionsErr } = await supabase
    .from('actions')
    .select('*')
    .neq('Status', 'Complete')
    .neq('Status', 'Completed')

  if (actionsErr) {
    console.error('Error fetching actions:', actionsErr.message)
    return
  }

  const overdueActions = actions.filter(a => {
    const days = daysOverdue(a.Due_Date)
    return days > 0
  })

  console.log(`  Found ${overdueActions.length} overdue actions`)

  // Create alerts for overdue actions
  for (const action of overdueActions) {
    const days = daysOverdue(action.Due_Date)
    const severity = days > 30 ? 'critical' : days > 14 ? 'high' : days > 7 ? 'medium' : 'low'

    const alertId = `action_overdue_${action.Action_ID}`
    const fingerprint = generateFingerprint('action_overdue', action.client || 'Unknown', action.Action_ID)

    // Check for existing fingerprint
    const { data: existing } = await supabase
      .from('alert_fingerprints')
      .select('alert_id')
      .eq('fingerprint', fingerprint)
      .single()

    if (existing) {
      stats.duplicatesSkipped++
      continue
    }

    // Create alert
    const { data: newAlert, error: insertErr } = await supabase
      .from('alerts')
      .insert({
        alert_id: alertId,
        category: 'action_overdue',
        severity,
        title: `Overdue Action: ${action.Action_Description?.substring(0, 50) || action.Action_ID}`,
        description: `Action ${action.Action_ID} is ${days} days past due date. ${action.Action_Description || ''}`,
        client_name: action.client || 'Unknown',
        cse_name: action.Owners,
        current_value: `${days} days overdue`,
        threshold_value: '0 days',
        recommendation: 'Review and complete this action or update the due date if still in progress.',
        metadata: {
          action_id: action.Action_ID,
          days_overdue: days,
          due_date: action.Due_Date,
          priority: action.Priority,
          status: action.Status
        },
        detected_at: new Date().toISOString(),
        auto_action_created: true,
        linked_action_id: action.Action_ID
      })
      .select()
      .single()

    if (insertErr) {
      stats.errors.push({ alertId, error: insertErr.message })
      continue
    }

    // Create fingerprint
    await supabase.from('alert_fingerprints').insert({
      fingerprint,
      alert_id: newAlert.id
    })

    // Link action to alert
    await supabase
      .from('actions')
      .update({
        source_alert_id: newAlert.id,
        source_alert_text_id: alertId,
        source: 'Alert'
      })
      .eq('Action_ID', action.Action_ID)

    stats.overdueActions++
    stats.totalCreated++
    stats.actionsLinked++
  }

  // 2. Fetch health score data for declines
  console.log('\n📊 Checking health score declines...')
  const { data: healthData, error: healthErr } = await supabase
    .from('client_health_scores_materialized')
    .select('*')

  if (!healthErr && healthData) {
    const criticalHealth = healthData.filter(h => h.health_score && h.health_score < 50)
    console.log(`  Found ${criticalHealth.length} clients with critical health scores`)

    for (const client of criticalHealth) {
      const severity = client.health_score < 30 ? 'critical' : client.health_score < 40 ? 'high' : 'medium'
      const alertId = `health_decline_${client.client_name?.replace(/\s+/g, '_')}_${Date.now()}`
      const fingerprint = generateFingerprint('health_decline', client.client_name || 'Unknown', String(client.health_score))

      const { data: existing } = await supabase
        .from('alert_fingerprints')
        .select('alert_id')
        .eq('fingerprint', fingerprint)
        .single()

      if (existing) {
        stats.duplicatesSkipped++
        continue
      }

      const { data: newAlert, error: insertErr } = await supabase
        .from('alerts')
        .insert({
          alert_id: alertId,
          category: 'health_decline',
          severity,
          title: `Low Health Score: ${client.client_name}`,
          description: `${client.client_name} has a health score of ${client.health_score}%, which is below the critical threshold.`,
          client_name: client.client_name || 'Unknown',
          cse_name: client.cse_name,
          current_value: `${client.health_score}%`,
          threshold_value: '50%',
          recommendation: 'Schedule a client review meeting to understand concerns and develop an improvement plan.',
          metadata: {
            health_score: client.health_score,
            compliance_score: client.compliance_score,
            nps_score: client.nps_score,
            segment: client.segment
          },
          detected_at: new Date().toISOString()
        })
        .select()
        .single()

      if (insertErr) {
        stats.errors.push({ alertId, error: insertErr.message })
        continue
      }

      await supabase.from('alert_fingerprints').insert({
        fingerprint,
        alert_id: newAlert.id
      })

      stats.healthDeclines++
      stats.totalCreated++
    }
  }

  // 3. Check for NPS detractors
  console.log('\n😟 Checking NPS detractors...')
  const { data: npsData, error: npsErr } = await supabase
    .from('nps_responses')
    .select('*')
    .lte('nps_score', 6)
    .order('created_at', { ascending: false })
    .limit(50)

  if (!npsErr && npsData) {
    console.log(`  Found ${npsData.length} recent detractors`)

    for (const response of npsData) {
      const severity = response.nps_score <= 3 ? 'critical' : response.nps_score <= 5 ? 'high' : 'medium'
      const alertId = `nps_risk_${response.client_name?.replace(/\s+/g, '_')}_${response.id}`
      const fingerprint = generateFingerprint('nps_risk', response.client_name || 'Unknown', String(response.nps_score))

      const { data: existing } = await supabase
        .from('alert_fingerprints')
        .select('alert_id')
        .eq('fingerprint', fingerprint)
        .single()

      if (existing) {
        stats.duplicatesSkipped++
        continue
      }

      const { data: newAlert, error: insertErr } = await supabase
        .from('alerts')
        .insert({
          alert_id: alertId,
          category: 'nps_risk',
          severity,
          title: `NPS Detractor: ${response.client_name}`,
          description: `${response.client_name} gave an NPS score of ${response.nps_score}. ${response.feedback ? `Feedback: "${response.feedback.substring(0, 200)}"` : ''}`,
          client_name: response.client_name || 'Unknown',
          current_value: String(response.nps_score),
          threshold_value: '7',
          recommendation: 'Follow up with the client to understand their concerns and address any issues.',
          metadata: {
            nps_score: response.nps_score,
            feedback: response.feedback,
            response_date: response.created_at,
            survey_period: response.survey_period
          },
          detected_at: new Date().toISOString()
        })
        .select()
        .single()

      if (insertErr) {
        stats.errors.push({ alertId, error: insertErr.message })
        continue
      }

      await supabase.from('alert_fingerprints').insert({
        fingerprint,
        alert_id: newAlert.id
      })

      stats.npsRisks++
      stats.totalCreated++
    }
  }

  // 4. Check compliance risks
  console.log('\n📋 Checking compliance risks...')
  const { data: complianceData, error: compErr } = await supabase
    .from('client_health_scores_materialized')
    .select('client_name, compliance_score, cse_name, segment')
    .lt('compliance_score', 50)

  if (!compErr && complianceData) {
    console.log(`  Found ${complianceData.length} clients with low compliance`)

    for (const client of complianceData) {
      if (!client.compliance_score) continue

      const severity = client.compliance_score < 30 ? 'critical' : client.compliance_score < 40 ? 'high' : 'medium'
      const alertId = `compliance_risk_${client.client_name?.replace(/\s+/g, '_')}_${Date.now()}`
      const fingerprint = generateFingerprint('compliance_risk', client.client_name || 'Unknown', String(client.compliance_score))

      const { data: existing } = await supabase
        .from('alert_fingerprints')
        .select('alert_id')
        .eq('fingerprint', fingerprint)
        .single()

      if (existing) {
        stats.duplicatesSkipped++
        continue
      }

      const { data: newAlert, error: insertErr } = await supabase
        .from('alerts')
        .insert({
          alert_id: alertId,
          category: 'compliance_risk',
          severity,
          title: `Low Compliance: ${client.client_name}`,
          description: `${client.client_name} has a compliance score of ${client.compliance_score}%, indicating missed or overdue engagement activities.`,
          client_name: client.client_name || 'Unknown',
          cse_name: client.cse_name,
          current_value: `${client.compliance_score}%`,
          threshold_value: '50%',
          recommendation: 'Review engagement calendar and schedule required touchpoints.',
          metadata: {
            compliance_score: client.compliance_score,
            segment: client.segment
          },
          detected_at: new Date().toISOString()
        })
        .select()
        .single()

      if (insertErr) {
        stats.errors.push({ alertId, error: insertErr.message })
        continue
      }

      await supabase.from('alert_fingerprints').insert({
        fingerprint,
        alert_id: newAlert.id
      })

      stats.complianceRisks++
      stats.totalCreated++
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(50))
  console.log('📊 BACKFILL SUMMARY')
  console.log('='.repeat(50))
  console.log(`✅ Total alerts created: ${stats.totalCreated}`)
  console.log(`   - Overdue actions: ${stats.overdueActions}`)
  console.log(`   - Health declines: ${stats.healthDeclines}`)
  console.log(`   - NPS risks: ${stats.npsRisks}`)
  console.log(`   - Compliance risks: ${stats.complianceRisks}`)
  console.log(`⏭️  Duplicates skipped: ${stats.duplicatesSkipped}`)
  console.log(`🔗 Actions linked: ${stats.actionsLinked}`)

  if (stats.errors.length > 0) {
    console.log(`\n❌ Errors (${stats.errors.length}):`)
    stats.errors.slice(0, 5).forEach(e => console.log(`   - ${e.alertId}: ${e.error}`))
    if (stats.errors.length > 5) {
      console.log(`   ... and ${stats.errors.length - 5} more`)
    }
  }

  console.log('\n✅ Backfill complete!')
}

backfillAlerts().catch(console.error)
