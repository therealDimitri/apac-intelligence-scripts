#!/usr/bin/env node
/**
 * Backfill Meeting Organizer Script
 *
 * This script updates meetings that have NULL organizer field.
 * For Outlook-imported meetings, we don't have the original organizer data,
 * so this script sets organizer to match cse_name (the person who synced it)
 * which is a reasonable default for most cases.
 *
 * For meetings where the user wants the correct organizer, they should
 * re-import from Outlook which will now correctly populate the organizer field.
 *
 * Usage:
 *   node scripts/backfill-meeting-organizer.mjs                # Preview changes (dry run)
 *   node scripts/backfill-meeting-organizer.mjs --apply        # Apply changes
 *
 * Run: node scripts/backfill-meeting-organizer.mjs
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

async function backfillOrganizer() {
  console.log('🔄 Starting meeting organizer backfill...\n')
  console.log(`📝 Mode: ${applyChanges ? 'APPLY CHANGES' : 'DRY RUN (preview only)'}\n`)

  if (!applyChanges) {
    console.log('💡 Tip: Run with --apply to apply changes\n')
  }

  // Fetch meetings that have NULL organizer
  const { data: meetings, error } = await supabase
    .from('unified_meetings')
    .select('id, meeting_id, title, client_name, cse_name, organizer, outlook_event_id')
    .is('organizer', null)
    .order('meeting_date', { ascending: false })

  if (error) {
    console.error('❌ Error fetching meetings:', error)
    process.exit(1)
  }

  console.log(`📊 Found ${meetings.length} meetings with NULL organizer\n`)

  if (meetings.length === 0) {
    console.log('✅ No meetings need organizer update. All done!')
    return
  }

  let updated = 0
  let errors = 0
  let skipped = 0

  console.log('Preview of changes:')
  console.log('─'.repeat(100))
  console.log('ID'.padEnd(35) + '| CSE Name'.padEnd(30) + '| Title/Client')
  console.log('─'.repeat(100))

  for (const meeting of meetings) {
    const title = meeting.title || meeting.client_name || 'Untitled'
    const cseName = meeting.cse_name || null

    // Show preview
    console.log(
      `${(meeting.meeting_id || meeting.id).toString().substring(0, 33).padEnd(35)}| ` +
      `${(cseName || 'NULL').substring(0, 28).padEnd(28)} | ` +
      `${title.substring(0, 35)}`
    )

    if (!cseName) {
      console.log(`   ⚠️  No cse_name available - skipping`)
      skipped++
      continue
    }

    if (applyChanges) {
      // Set organizer to cse_name (the person who synced the meeting)
      // This is a reasonable default since for most synced meetings,
      // the person syncing is often the organizer
      const { error: updateError } = await supabase
        .from('unified_meetings')
        .update({
          organizer: cseName,
          updated_at: new Date().toISOString()
        })
        .eq('id', meeting.id)

      if (updateError) {
        console.error(`   ❌ Error: ${updateError.message}`)
        errors++
      } else {
        updated++
      }
    }
  }

  console.log('─'.repeat(100))
  console.log('\n📈 Summary:')
  if (applyChanges) {
    console.log(`   Updated: ${updated}`)
    console.log(`   Skipped: ${skipped}`)
    console.log(`   Errors: ${errors}`)
  } else {
    console.log(`   Would update: ${meetings.length - skipped}`)
    console.log(`   Would skip: ${skipped}`)
    console.log(`   Run with --apply to apply these changes`)
  }

  console.log('\n⚠️  Note: This sets organizer to cse_name (the person who synced the meeting).')
  console.log('   For correct organizer data, users should re-import from Outlook.')
  console.log('\n✅ Backfill complete!')
}

backfillOrganizer()
