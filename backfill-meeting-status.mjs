#!/usr/bin/env node
/**
 * Backfill Meeting Status Script
 *
 * This script updates meetings that have a meeting_date in the past but
 * do not have their status set to 'completed'. This ensures historical
 * meetings are correctly marked as completed.
 *
 * Run: node scripts/backfill-meeting-status.mjs
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing environment variables')
  console.error('Please ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function backfillStatus() {
  console.log('🔄 Starting meeting status backfill...\n')

  // Get today's date in YYYY-MM-DD format
  const today = new Date().toISOString().split('T')[0]
  console.log(`📅 Today's date: ${today}\n`)

  // Fetch meetings that are in the past but not marked as completed
  const { data: meetings, error } = await supabase
    .from('unified_meetings')
    .select('id, meeting_id, meeting_date, status, client_name, title')
    .lt('meeting_date', today)
    .or('status.is.null,status.neq.completed')

  if (error) {
    console.error('❌ Error fetching meetings:', error)
    process.exit(1)
  }

  // Filter to only those that need updating (status is not 'completed')
  const meetingsToUpdate = meetings.filter(m => m.status !== 'completed')

  console.log(`📊 Found ${meetings.length} past meetings`)
  console.log(`📊 ${meetingsToUpdate.length} need status update to 'completed'\n`)

  if (meetingsToUpdate.length === 0) {
    console.log('✅ All past meetings already have correct status. Nothing to update.')
    return
  }

  let updated = 0
  let errors = 0

  for (const meeting of meetingsToUpdate) {
    const { error: updateError } = await supabase
      .from('unified_meetings')
      .update({
        status: 'completed',
        updated_at: new Date().toISOString()
      })
      .eq('id', meeting.id)

    if (updateError) {
      console.error(`❌ Error updating ${meeting.meeting_id}:`, updateError.message)
      errors++
    } else {
      const title = meeting.title || meeting.client_name || meeting.meeting_id
      console.log(`✅ Updated: ${title} (${meeting.meeting_date}) → completed`)
      updated++
    }
  }

  console.log('\n📈 Summary:')
  console.log(`   Updated: ${updated}`)
  console.log(`   Errors: ${errors}`)
  console.log(`   Already completed: ${meetings.length - meetingsToUpdate.length}`)
  console.log('\n✅ Backfill complete!')
}

backfillStatus()
