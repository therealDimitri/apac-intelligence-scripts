#!/usr/bin/env node
/**
 * Sync segmentation_event_compliance table with actual events
 *
 * This script uses the client_name_aliases table to handle client name variations
 * between the compliance table and the events table.
 */

import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Cache for alias lookups
let aliasCache = null

/**
 * Load all client name aliases from the database
 * Returns a Map: display_name → canonical_name
 */
async function loadAliasCache() {
  if (aliasCache) return aliasCache

  const { data, error } = await supabase
    .from('client_name_aliases')
    .select('display_name, canonical_name')
    .eq('is_active', true)

  if (error) {
    console.warn('Warning: Could not load alias cache:', error.message)
    return new Map()
  }

  aliasCache = new Map()
  data.forEach(row => {
    aliasCache.set(row.display_name, row.canonical_name)
  })

  console.log(`Loaded ${aliasCache.size} client name aliases\n`)
  return aliasCache
}

/**
 * Get canonical name for a display name using the alias table
 */
function getCanonicalName(displayName, aliases) {
  return aliases.get(displayName) || displayName
}

async function syncComplianceWithEvents() {
  const currentYear = 2025

  console.log('=== Syncing Compliance Data with Events ===\n')
  console.log(`Year: ${currentYear}\n`)

  // Load the alias cache from the database
  const aliases = await loadAliasCache()

  // 1. Get all event types
  const { data: eventTypes } = await supabase
    .from('segmentation_event_types')
    .select('id, event_name')

  console.log(`Found ${eventTypes?.length || 0} event types\n`)

  let totalUpdated = 0

  // 2. For each event type
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

    // Count per client, normalising to canonical names using alias table
    const eventCountsByCanonical = {}
    completedEvents?.forEach(e => {
      const canonicalName = getCanonicalName(e.client_name, aliases)
      eventCountsByCanonical[canonicalName] = (eventCountsByCanonical[canonicalName] || 0) + 1
    })

    // Get current compliance records
    const { data: complianceRecords } = await supabase
      .from('segmentation_event_compliance')
      .select('id, client_name, expected_count, actual_count')
      .eq('event_type_id', eventType.id)
      .eq('year', currentYear)

    // Check and update each compliance record
    let updatedCount = 0
    for (const record of complianceRecords || []) {
      // Normalise compliance client name to canonical
      const canonicalName = getCanonicalName(record.client_name, aliases)

      // Look up count using canonical name
      let matchedCount = eventCountsByCanonical[canonicalName] || 0

      // If no match found, try fuzzy matching as fallback
      if (matchedCount === 0) {
        for (const [eventCanonical, count] of Object.entries(eventCountsByCanonical)) {
          const norm1 = canonicalName.toLowerCase().replace(/[^a-z0-9]/g, '')
          const norm2 = eventCanonical.toLowerCase().replace(/[^a-z0-9]/g, '')

          if (norm1 === norm2 || norm1.includes(norm2) || norm2.includes(norm1)) {
            matchedCount = count
            break
          }
        }
      }

      if (record.actual_count !== matchedCount) {
        const status = matchedCount >= record.expected_count ? '✅' : '❌'
        console.log(`  ${status} ${record.client_name}: ${record.actual_count} → ${matchedCount}`)

        // Update the compliance record
        const { error } = await supabase
          .from('segmentation_event_compliance')
          .update({
            actual_count: matchedCount,
            calculated_at: new Date().toISOString()
          })
          .eq('id', record.id)

        if (error) {
          console.error(`    ❌ Error: ${error.message}`)
        } else {
          updatedCount++
          totalUpdated++
        }
      }
    }

    if (updatedCount === 0) {
      console.log('  All records in sync')
    } else {
      console.log(`  Updated ${updatedCount} records`)
    }
  }

  console.log(`\n=== Sync Complete: ${totalUpdated} records updated ===`)
}

syncComplianceWithEvents().catch(console.error)
