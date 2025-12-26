#!/usr/bin/env node
/**
 * Backfill Meeting Timezone Script
 *
 * This script adjusts meeting times for Outlook-imported meetings that were
 * imported with incorrect timezone handling.
 *
 * The old import used UTC times but parsed them incorrectly.
 * This script adjusts times by a configurable offset (default: +10 hours for AEST).
 *
 * Usage:
 *   node scripts/backfill-meeting-timezone.mjs                    # Preview changes (dry run)
 *   node scripts/backfill-meeting-timezone.mjs --apply            # Apply changes
 *   node scripts/backfill-meeting-timezone.mjs --offset=11        # Use +11 hours (AEDT)
 *   node scripts/backfill-meeting-timezone.mjs --apply --offset=10 # Apply with +10 hour offset
 *
 * Run: node scripts/backfill-meeting-timezone.mjs
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

// Parse command line arguments
const args = process.argv.slice(2)
const applyChanges = args.includes('--apply')
const offsetArg = args.find(arg => arg.startsWith('--offset='))
const hourOffset = offsetArg ? parseInt(offsetArg.split('=')[1], 10) : 10

function adjustTime(meetingTime, offsetHours) {
  // Parse time (HH:MM format)
  const [hours, minutes] = meetingTime.split(':').map(Number)

  // Add offset
  let newHours = hours + offsetHours

  // Handle day overflow/underflow
  if (newHours >= 24) {
    newHours = newHours - 24
    return { time: `${String(newHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`, dayChange: 1 }
  } else if (newHours < 0) {
    newHours = newHours + 24
    return { time: `${String(newHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`, dayChange: -1 }
  }

  return { time: `${String(newHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`, dayChange: 0 }
}

function adjustDate(meetingDate, dayChange) {
  if (dayChange === 0) return meetingDate

  const date = new Date(meetingDate)
  date.setDate(date.getDate() + dayChange)

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

async function backfillTimezone() {
  console.log('🔄 Starting meeting timezone backfill...\n')
  console.log(`⏰ Offset: +${hourOffset} hours`)
  console.log(`📝 Mode: ${applyChanges ? 'APPLY CHANGES' : 'DRY RUN (preview only)'}\n`)

  if (!applyChanges) {
    console.log('💡 Tip: Run with --apply to apply changes\n')
  }

  // Fetch Outlook-imported meetings that may need timezone correction
  // We look for meetings that have unusual times (likely UTC instead of local)
  const { data: meetings, error } = await supabase
    .from('unified_meetings')
    .select('id, meeting_id, meeting_date, meeting_time, title, client_name, outlook_event_id')
    .not('outlook_event_id', 'is', null)
    .order('meeting_date', { ascending: false })

  if (error) {
    console.error('❌ Error fetching meetings:', error)
    process.exit(1)
  }

  console.log(`📊 Found ${meetings.length} Outlook-imported meetings\n`)

  // Filter to meetings that look like they have UTC times (early morning times that should be business hours)
  // This heuristic: if meeting time is between 00:00-09:59, it might have been stored in UTC
  // and should actually be 10:00-19:59 in AEST
  const meetingsToFix = meetings.filter(m => {
    const [hours] = (m.meeting_time || '00:00').split(':').map(Number)
    // UTC times for 10:00-19:59 AEST would be 00:00-09:59 UTC
    return hours >= 0 && hours < 10
  })

  console.log(`📊 ${meetingsToFix.length} meetings appear to need timezone correction\n`)

  if (meetingsToFix.length === 0) {
    console.log('✅ No meetings need timezone correction. All done!')
    return
  }

  let updated = 0
  let errors = 0
  let skipped = 0

  console.log('Preview of changes:')
  console.log('─'.repeat(80))

  for (const meeting of meetingsToFix) {
    const title = meeting.title || meeting.client_name || meeting.meeting_id
    const oldTime = meeting.meeting_time || '00:00'
    const oldDate = meeting.meeting_date

    const { time: newTime, dayChange } = adjustTime(oldTime, hourOffset)
    const newDate = adjustDate(oldDate, dayChange)

    // Show preview
    console.log(`📅 ${title.substring(0, 40).padEnd(40)} | ${oldDate} ${oldTime} → ${newDate} ${newTime}`)

    if (applyChanges) {
      const { error: updateError } = await supabase
        .from('unified_meetings')
        .update({
          meeting_time: newTime,
          meeting_date: newDate,
          updated_at: new Date().toISOString()
        })
        .eq('id', meeting.id)

      if (updateError) {
        console.error(`   ❌ Error: ${updateError.message}`)
        errors++
      } else {
        updated++
      }
    } else {
      skipped++
    }
  }

  console.log('─'.repeat(80))
  console.log('\n📈 Summary:')
  if (applyChanges) {
    console.log(`   Updated: ${updated}`)
    console.log(`   Errors: ${errors}`)
  } else {
    console.log(`   Would update: ${meetingsToFix.length}`)
    console.log(`   Run with --apply to apply these changes`)
  }
  console.log('\n✅ Backfill complete!')
}

backfillTimezone()
