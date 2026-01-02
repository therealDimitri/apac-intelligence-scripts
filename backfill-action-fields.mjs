#!/usr/bin/env node

/**
 * Backfill Script: Add default values for new action fields
 *
 * This script adds default values for:
 * - department_code: Default to 'CS' (Client Success)
 * - activity_type_code: Default to 'FOLLOW_UP'
 * - cross_functional: Default to false
 *
 * Run with: node scripts/backfill-action-fields.mjs
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:')
  console.error('   NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✓' : '✗')
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✓' : '✗')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function backfillActionFields() {
  console.log('🔄 Starting action fields backfill...\n')

  try {
    // Fetch all actions that need backfilling
    const { data: actions, error: fetchError } = await supabase
      .from('actions')
      .select('Action_ID, department_code, activity_type_code, cross_functional, Category')
      .or('department_code.is.null,activity_type_code.is.null')

    if (fetchError) {
      console.error('❌ Failed to fetch actions:', fetchError.message)
      return
    }

    console.log(`📋 Found ${actions?.length || 0} actions that may need backfilling\n`)

    if (!actions || actions.length === 0) {
      console.log('✅ All actions already have required fields populated!')
      return
    }

    let updatedCount = 0
    let skippedCount = 0

    for (const action of actions) {
      const updates = {}

      // Set default department_code if missing
      if (!action.department_code) {
        updates.department_code = 'CLIENT_SUCCESS' // Client Success department
      }

      // Set default activity_type_code based on category if missing
      if (!action.activity_type_code) {
        // Map existing category to valid activity type codes
        // Valid codes: IMPLEMENTATION, TRAINING, SUPPORT, OPTIMIZATION, STRATEGIC_REVIEW,
        //              HEALTH_CHECK, PLANNING, PROCESS_IMPROVEMENT, TEAM_DEVELOPMENT,
        //              REPORTING, GOVERNANCE, CLIENT_ENABLEMENT, RESEARCH
        const categoryToActivity = {
          'Meeting': 'STRATEGIC_REVIEW',
          'General': 'SUPPORT',
          'Planning': 'PLANNING',
          'Escalation': 'SUPPORT',
          'Documentation': 'REPORTING',
          'Customer Success': 'CLIENT_ENABLEMENT',
          'Support': 'SUPPORT',
          'Technical': 'IMPLEMENTATION',
          'Training': 'TRAINING',
          'Review': 'STRATEGIC_REVIEW',
        }
        updates.activity_type_code = categoryToActivity[action.Category] || 'SUPPORT'
      }

      // Set default cross_functional if missing
      if (action.cross_functional === null || action.cross_functional === undefined) {
        updates.cross_functional = false
      }

      // Only update if there are changes
      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await supabase
          .from('actions')
          .update(updates)
          .eq('Action_ID', action.Action_ID)

        if (updateError) {
          console.error(`❌ Failed to update action ${action.Action_ID}:`, updateError.message)
          skippedCount++
        } else {
          console.log(`✓ Updated action ${action.Action_ID}:`, updates)
          updatedCount++
        }
      } else {
        skippedCount++
      }
    }

    console.log('\n📊 Backfill Summary:')
    console.log(`   ✓ Updated: ${updatedCount} actions`)
    console.log(`   ⏭ Skipped: ${skippedCount} actions`)
    console.log('\n✅ Backfill complete!')

  } catch (error) {
    console.error('❌ Unexpected error:', error)
  }
}

// Run the backfill
backfillActionFields()
