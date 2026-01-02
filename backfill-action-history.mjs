#!/usr/bin/env node

/**
 * Backfill action history for all existing actions
 *
 * This script:
 * 1. Creates "created" activity entries for all existing actions
 * 2. Optionally infers tags from action data (category, description keywords)
 * 3. Updates the actions table with initial tags
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load environment variables
config({ path: join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
})

// Tag inference rules
function inferTags(action) {
  const tags = new Set()

  // From category
  if (action.Category) {
    const category = action.Category.toLowerCase()
    if (category !== 'general') {
      tags.add(category.replace(/\s+/g, '-'))
    }
  }

  // From priority
  if (action.Priority?.toLowerCase() === 'critical') {
    tags.add('urgent')
  }

  // From client type
  if (action.client?.toLowerCase() === 'internal' || action.is_internal) {
    tags.add('internal')
  } else if (action.client) {
    tags.add('client-facing')
  }

  // From description keywords
  const description = (action.Action_Description + ' ' + (action.Notes || '')).toLowerCase()
  if (description.includes('follow up') || description.includes('followup') || description.includes('follow-up')) {
    tags.add('follow-up')
  }
  if (description.includes('review')) {
    tags.add('review')
  }
  if (description.includes('renewal')) {
    tags.add('renewal')
  }
  if (description.includes('escalat')) {
    tags.add('escalation')
  }
  if (description.includes('blocked') || description.includes('waiting for') || description.includes('waiting on')) {
    tags.add('blocked')
  }
  if (description.includes('document')) {
    tags.add('documentation')
  }

  return Array.from(tags)
}

async function backfillHistory() {
  console.log('\n🚀 Backfilling action history...\n')

  try {
    // Get all actions
    console.log('📋 Fetching all actions...')
    const { data: actions, error: fetchError } = await supabase
      .from('actions')
      .select('id, Action_ID, Action_Description, Category, Priority, Status, Owners, client, Due_Date, is_internal, Notes, created_at, tags')
      .order('created_at', { ascending: true })

    if (fetchError) {
      throw new Error(`Failed to fetch actions: ${fetchError.message}`)
    }

    console.log(`   Found ${actions.length} actions\n`)

    // Check existing activity entries
    const { data: existingActivities } = await supabase
      .from('action_activity_log')
      .select('action_id')
      .eq('activity_type', 'created')

    const existingActionIds = new Set(existingActivities?.map(a => a.action_id) || [])
    console.log(`   ${existingActionIds.size} actions already have 'created' activity\n`)

    // Process each action
    let createdCount = 0
    let taggedCount = 0
    let skippedCount = 0

    for (const action of actions) {
      const actionId = action.Action_ID

      // Skip if already has created activity
      if (existingActionIds.has(actionId)) {
        skippedCount++
        continue
      }

      // Create "created" activity
      const createdAt = action.created_at || new Date().toISOString()

      const { error: activityError } = await supabase
        .from('action_activity_log')
        .insert({
          action_id: actionId,
          activity_type: 'created',
          user_name: 'System (Backfill)',
          description: `Action created: ${action.Action_Description?.substring(0, 100) || 'Untitled'}`,
          metadata: {
            client: action.client,
            priority: action.Priority,
            status: action.Status,
            owners: action.Owners,
            backfilled: true
          },
          created_at: createdAt
        })

      if (activityError) {
        console.warn(`   ⚠️  Failed to create activity for ${actionId}: ${activityError.message}`)
      } else {
        createdCount++
      }

      // Infer and update tags if action has none
      if (!action.tags || action.tags.length === 0) {
        const inferredTags = inferTags(action)

        if (inferredTags.length > 0) {
          const { error: tagError } = await supabase
            .from('actions')
            .update({ tags: inferredTags })
            .eq('Action_ID', actionId)

          if (!tagError) {
            taggedCount++
          }
        }
      }

      // Progress indicator
      if ((createdCount + skippedCount) % 10 === 0) {
        process.stdout.write(`\r   Processed ${createdCount + skippedCount}/${actions.length} actions...`)
      }
    }

    console.log('\n')
    console.log('📊 Backfill Summary:')
    console.log('─'.repeat(50))
    console.log(`   ✅ Created activity entries: ${createdCount}`)
    console.log(`   🏷️  Actions with inferred tags: ${taggedCount}`)
    console.log(`   ⏭️  Skipped (already had history): ${skippedCount}`)
    console.log(`   📝 Total actions processed: ${actions.length}`)

    // Verify
    console.log('\n🔍 Verifying backfill...')
    const { count: activityCount } = await supabase
      .from('action_activity_log')
      .select('*', { count: 'exact', head: true })

    const { data: taggedActions } = await supabase
      .from('actions')
      .select('Action_ID')
      .not('tags', 'eq', '{}')

    console.log(`   Activity log entries: ${activityCount}`)
    console.log(`   Actions with tags: ${taggedActions?.length || 0}`)

    console.log('\n✅ Backfill complete!')

  } catch (error) {
    console.error('\n❌ Backfill failed:', error.message)
    process.exit(1)
  }
}

backfillHistory()
