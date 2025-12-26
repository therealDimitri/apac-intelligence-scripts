/**
 * Refresh segmentation_event_compliance table from actual segmentation_events
 *
 * The compliance table stores expected/actual counts but can get out of sync
 * with the actual events. This script recalculates actual_count from the
 * completed events in segmentation_events table.
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function refreshComplianceFromEvents() {
  const currentYear = new Date().getFullYear()

  console.log('=== Refreshing Compliance Data from Events ===\n')
  console.log(`Year: ${currentYear}\n`)

  // 1. Get all event types
  const { data: eventTypes } = await supabase
    .from('segmentation_event_types')
    .select('id, event_name')

  console.log(`Found ${eventTypes?.length || 0} event types\n`)

  // 2. For each event type, count completed events per client from segmentation_events
  for (const eventType of eventTypes || []) {
    console.log(`\n--- ${eventType.event_name} ---`)

    // Get completed events grouped by client
    const { data: completedEvents } = await supabase
      .from('segmentation_events')
      .select('client_name')
      .eq('event_type_id', eventType.id)
      .eq('completed', true)
      .gte('event_date', `${currentYear}-01-01`)
      .lte('event_date', `${currentYear}-12-31`)

    // Count per client
    const clientCounts = {}
    completedEvents?.forEach(e => {
      const name = e.client_name
      clientCounts[name] = (clientCounts[name] || 0) + 1
    })

    // Get current compliance records for this event type
    const { data: complianceRecords } = await supabase
      .from('segmentation_event_compliance')
      .select('id, client_name, expected_count, actual_count')
      .eq('event_type_id', eventType.id)
      .eq('year', currentYear)

    // Check for mismatches and update
    let updatedCount = 0
    for (const record of complianceRecords || []) {
      // Try to match client name (handle variations)
      let matchedCount = 0

      // Try exact match first
      if (clientCounts[record.client_name]) {
        matchedCount = clientCounts[record.client_name]
      } else {
        // Try partial match for name variations
        for (const [clientName, count] of Object.entries(clientCounts)) {
          const normalizedRecord = record.client_name.toLowerCase().replace(/[^a-z]/g, '')
          const normalizedClient = clientName.toLowerCase().replace(/[^a-z]/g, '')

          if (normalizedRecord.includes(normalizedClient) || normalizedClient.includes(normalizedRecord)) {
            matchedCount = count
            break
          }
        }
      }

      if (record.actual_count !== matchedCount) {
        console.log(`  ${record.client_name}: ${record.actual_count} → ${matchedCount} (from events table)`)

        // Update the compliance record
        const { error } = await supabase
          .from('segmentation_event_compliance')
          .update({ actual_count: matchedCount })
          .eq('id', record.id)

        if (error) {
          console.error(`    ❌ Error updating: ${error.message}`)
        } else {
          console.log(`    ✅ Updated`)
          updatedCount++
        }
      }
    }

    if (updatedCount === 0) {
      console.log('  All records in sync')
    } else {
      console.log(`  Updated ${updatedCount} records`)
    }
  }

  console.log('\n=== Compliance Refresh Complete ===')
}

refreshComplianceFromEvents().catch(console.error)
