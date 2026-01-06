#!/usr/bin/env node
/**
 * Backfill Meeting Titles Script (v2)
 *
 * This script fixes meetings where:
 * 1. title is NULL
 * 2. client_name contains what should be the title (not a real client)
 * 3. meeting_notes contains the actual subject
 *
 * It sets title from meeting_notes or client_name when the client_name
 * doesn't look like a real client.
 *
 * Run: node scripts/backfill-meeting-titles.mjs                # Preview
 * Run: node scripts/backfill-meeting-titles.mjs --apply        # Apply changes
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

// Known actual client names - used to determine if client_name is a real client
const KNOWN_CLIENTS = [
  'SingHealth', 'Singhealth', 'Epworth', 'Barwon', 'WA Health', 'SA Health',
  'Grampians', 'Western Health', 'Albury Wodonga', 'AWH', 'RVEEH', 'Te Whatu Ora',
  'Waikato', 'NCS', 'MinDef', 'Ministry of Defence', 'GHA', 'Gippsland',
  'SLMC', 'St Luke', 'GRMC', 'Guam', 'Mount Alvernia', 'MAH', 'Department of Health',
  'DoH Victoria', 'Mater Health', 'NCIG', 'Internal', 'Mater', 'LRH', 'St John of God'
]

// Patterns that indicate the client_name field contains a subject, not a client
const NOT_CLIENT_PATTERNS = [
  /^(NPS|CS|APAC|Monthly|Weekly|Quarterly|Annual|Daily)/i,
  /^(Check-in|Meeting|Call|Sync|Review|Update|Session|Reminder)/i,
  /^(Action|Client Success|Team|Project|Planning|Status)/i,
  /Reminder|Update|Session|Overview|Declined:|Agenda/i,
  /^(Create|Do a weekly|SAH -|Monthly Client)/i,
  /^(FW:|RE:|Fwd:)/i,
  /\d{4}/, // Contains a year
]

function isActualClientName(clientName) {
  if (!clientName) return false

  const lower = clientName.toLowerCase()

  // Check if it's a known client
  for (const client of KNOWN_CLIENTS) {
    if (lower.includes(client.toLowerCase())) {
      return true
    }
  }

  // Check if it matches patterns that indicate it's NOT a client
  for (const pattern of NOT_CLIENT_PATTERNS) {
    if (pattern.test(clientName)) {
      return false
    }
  }

  // If short (3 words or less) and starts with capital, might be a client
  const words = clientName.trim().split(/\s+/)
  if (words.length <= 3 && /^[A-Z]/.test(clientName)) {
    return true
  }

  return false
}

// Parse command line arguments
const args = process.argv.slice(2)
const applyChanges = args.includes('--apply')

async function backfillTitles() {
  console.log('🔄 Starting meeting title backfill (v2)...\n')
  console.log(`📝 Mode: ${applyChanges ? 'APPLY CHANGES' : 'DRY RUN (preview only)'}\n`)

  if (!applyChanges) {
    console.log('💡 Tip: Run with --apply to apply changes\n')
  }

  // Fetch meetings that have issues:
  // - title is null AND client_name looks like a subject
  const { data: meetings, error } = await supabase
    .from('unified_meetings')
    .select('id, meeting_id, title, client_name, meeting_type, meeting_notes')
    .is('title', null)
    .order('meeting_date', { ascending: false })

  if (error) {
    console.error('❌ Error fetching meetings:', error)
    process.exit(1)
  }

  console.log(`📊 Found ${meetings.length} meetings with NULL title\n`)

  // Filter to those where client_name looks like a subject (not a real client)
  const meetingsToFix = meetings.filter(m => {
    return m.client_name && !isActualClientName(m.client_name)
  })

  console.log(`📊 ${meetingsToFix.length} meetings have client_name that looks like a subject\n`)

  if (meetingsToFix.length === 0) {
    console.log('✅ No meetings need title correction. All done!')
    return
  }

  let updated = 0
  let errors = 0

  console.log('Preview of changes:')
  console.log('─'.repeat(100))
  console.log('ID'.padEnd(35) + '| Current Client (wrong)'.padEnd(45) + '| New Title')
  console.log('─'.repeat(100))

  for (const meeting of meetingsToFix) {
    // Determine the new title - use meeting_notes or client_name
    const newTitle = meeting.meeting_notes || meeting.client_name

    // Determine what client should be - either Internal or detect from the content
    let newClient = 'Internal'

    // Check if there's a real client mentioned in the subject
    const contentToCheck = (meeting.meeting_notes || '') + ' ' + (meeting.client_name || '')
    for (const client of KNOWN_CLIENTS) {
      if (contentToCheck.toLowerCase().includes(client.toLowerCase())) {
        newClient = client
        break
      }
    }

    const displayTitle = (newTitle || '').substring(0, 40)
    const displayClient = (meeting.client_name || '').substring(0, 40)

    console.log(`${meeting.meeting_id.substring(0, 33).padEnd(35)}| ${displayClient.padEnd(43)} | ${displayTitle}`)

    if (applyChanges) {
      const { error: updateError } = await supabase
        .from('unified_meetings')
        .update({
          title: newTitle,
          client_name: newClient,
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
    console.log(`   Errors: ${errors}`)
  } else {
    console.log(`   Would update: ${meetingsToFix.length}`)
    console.log(`   Run with --apply to apply these changes`)
  }
  console.log('\n✅ Backfill complete!')
}

backfillTitles()
