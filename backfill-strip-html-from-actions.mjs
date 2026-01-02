#!/usr/bin/env node

/**
 * Backfill Script: Strip HTML from Action Descriptions
 *
 * This script removes HTML tags and decodes HTML entities from all action
 * descriptions (Notes field) in the database.
 *
 * Usage: node scripts/backfill-strip-html-from-actions.mjs
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

/**
 * Strip HTML tags and decode HTML entities from a string
 */
function stripHtml(html) {
  if (!html) return html

  return html
    // Strip HTML tags (e.g., <p>, <br>, <div>, etc.)
    .replace(/<[^>]*>/g, ' ')
    // Decode common HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    // Clean up multiple spaces
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Check if a string contains HTML tags
 */
function containsHtml(str) {
  if (!str) return false
  return /<[^>]+>/.test(str) || /&[a-z]+;|&#\d+;|&#x[0-9a-f]+;/i.test(str)
}

async function main() {
  console.log('=== Backfill: Strip HTML from Action Descriptions ===\n')

  // Fetch all actions with Notes field
  const { data: actions, error } = await supabase
    .from('actions')
    .select('Action_ID, Notes')
    .not('Notes', 'is', null)

  if (error) {
    console.error('Error fetching actions:', error)
    process.exit(1)
  }

  console.log(`Found ${actions.length} actions with descriptions\n`)

  // Filter to only actions containing HTML
  const actionsWithHtml = actions.filter(action => containsHtml(action.Notes))

  console.log(`Found ${actionsWithHtml.length} actions containing HTML tags\n`)

  if (actionsWithHtml.length === 0) {
    console.log('No actions need updating. All descriptions are already clean.')
    return
  }

  // Preview first 5 changes
  console.log('Preview of changes (first 5):')
  console.log('-'.repeat(60))
  actionsWithHtml.slice(0, 5).forEach((action, i) => {
    const cleaned = stripHtml(action.Notes)
    console.log(`\n${i + 1}. Action ID: ${action.Action_ID}`)
    console.log(`   BEFORE: ${action.Notes.substring(0, 100)}${action.Notes.length > 100 ? '...' : ''}`)
    console.log(`   AFTER:  ${cleaned.substring(0, 100)}${cleaned.length > 100 ? '...' : ''}`)
  })
  console.log('\n' + '-'.repeat(60))

  // Process updates in batches
  let updated = 0
  let failed = 0
  const batchSize = 50

  for (let i = 0; i < actionsWithHtml.length; i += batchSize) {
    const batch = actionsWithHtml.slice(i, i + batchSize)

    for (const action of batch) {
      const cleanedNotes = stripHtml(action.Notes)

      const { error: updateError } = await supabase
        .from('actions')
        .update({ Notes: cleanedNotes, updated_at: new Date().toISOString() })
        .eq('Action_ID', action.Action_ID)

      if (updateError) {
        console.error(`Failed to update ${action.Action_ID}:`, updateError.message)
        failed++
      } else {
        updated++
      }
    }

    console.log(`Progress: ${Math.min(i + batchSize, actionsWithHtml.length)}/${actionsWithHtml.length}`)
  }

  console.log('\n=== Backfill Complete ===')
  console.log(`Updated: ${updated}`)
  console.log(`Failed: ${failed}`)
  console.log(`Skipped: ${actions.length - actionsWithHtml.length} (no HTML)`)
}

main().catch(console.error)
