#!/usr/bin/env node

/**
 * Sync Alert Priorities Script
 *
 * This script:
 * 1. Recalculates alert severity based on current conditions (e.g., days overdue)
 * 2. Updates the alert severity in the database
 * 3. Syncs the linked action's priority to match
 *
 * Run this periodically (e.g., daily cron) to keep priorities current.
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

// Map alert severity to action priority
const severityToPriority = {
  'critical': 'Critical',
  'high': 'High',
  'medium': 'Medium',
  'low': 'Low'
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

// Calculate severity based on days overdue
function calculateSeverity(days) {
  if (days > 30) return 'critical'
  if (days > 14) return 'high'
  if (days > 7) return 'medium'
  return 'low'
}

async function syncPriorities() {
  console.log('🔄 Syncing alert severities and action priorities...\n')

  const stats = {
    alertsChecked: 0,
    alertsUpdated: 0,
    actionsUpdated: 0,
    errors: []
  }

  // Get all active/acknowledged alerts with linked actions
  const { data: alerts, error } = await supabase
    .from('alerts')
    .select('*')
    .in('status', ['active', 'acknowledged'])
    .not('linked_action_id', 'is', null)

  if (error) {
    console.error('Error fetching alerts:', error.message)
    return
  }

  console.log(`Found ${alerts.length} active alerts with linked actions\n`)

  for (const alert of alerts) {
    stats.alertsChecked++

    // For overdue action alerts, recalculate severity
    if (alert.category === 'action_overdue') {
      // Get the linked action to check current due date
      const { data: action } = await supabase
        .from('actions')
        .select('Due_Date, Status')
        .eq('Action_ID', alert.linked_action_id)
        .single()

      if (!action) continue

      // Skip if action is complete
      if (action.Status === 'Complete' || action.Status === 'Completed') {
        // Mark alert as resolved
        await supabase
          .from('alerts')
          .update({
            status: 'resolved',
            resolved_at: new Date().toISOString(),
            resolved_by: 'system'
          })
          .eq('id', alert.id)
        console.log(`✅ ${alert.linked_action_id} completed → Alert resolved`)
        continue
      }

      const days = daysOverdue(action.Due_Date)
      const newSeverity = calculateSeverity(days)

      // Update alert if severity changed
      if (newSeverity !== alert.severity) {
        const { error: alertErr } = await supabase
          .from('alerts')
          .update({
            severity: newSeverity,
            current_value: `${days} days overdue`,
            metadata: {
              ...alert.metadata,
              days_overdue: days,
              last_recalculated: new Date().toISOString()
            }
          })
          .eq('id', alert.id)

        if (alertErr) {
          stats.errors.push({ id: alert.id, error: alertErr.message })
          continue
        }

        stats.alertsUpdated++
        console.log(`📊 ${alert.linked_action_id}: ${alert.severity} → ${newSeverity} (${days} days overdue)`)
      }

      // Update action priority to match
      const newPriority = severityToPriority[newSeverity]
      const { error: actionErr } = await supabase
        .from('actions')
        .update({ Priority: newPriority })
        .eq('Action_ID', alert.linked_action_id)

      if (!actionErr) {
        stats.actionsUpdated++
      }
    } else {
      // For other alert types, just sync priority
      const newPriority = severityToPriority[alert.severity]
      const { error: actionErr } = await supabase
        .from('actions')
        .update({ Priority: newPriority })
        .eq('Action_ID', alert.linked_action_id)

      if (!actionErr) {
        stats.actionsUpdated++
      }
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(50))
  console.log('📊 SYNC SUMMARY')
  console.log('='.repeat(50))
  console.log(`🔍 Alerts checked: ${stats.alertsChecked}`)
  console.log(`📊 Alert severities updated: ${stats.alertsUpdated}`)
  console.log(`✅ Action priorities synced: ${stats.actionsUpdated}`)

  if (stats.errors.length > 0) {
    console.log(`\n❌ Errors (${stats.errors.length}):`)
    stats.errors.forEach(e => console.log(`   - ${e.id}: ${e.error}`))
  }

  console.log('\n✅ Sync complete!')
}

syncPriorities().catch(console.error)
