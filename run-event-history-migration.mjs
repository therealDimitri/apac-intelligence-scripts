#!/usr/bin/env node
/**
 * Run the edit_history migration for segmentation_events table
 */

import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { createClient } from '@supabase/supabase-js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

console.log('🔄 Running Event History Migration\n')
console.log('Supabase URL:', supabaseUrl ? '✓ Set' : '✗ Not set')
console.log('Service Key:', supabaseServiceKey ? '✓ Set' : '✗ Not set')
console.log()

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function runMigration() {
  try {
    // Step 1: Check if edit_history column exists
    console.log('📋 Step 1: Checking if edit_history column exists...')

    const { data: existingEvents, error: checkError } = await supabase
      .from('segmentation_events')
      .select('id, edit_history')
      .limit(1)

    if (checkError) {
      if (checkError.message.includes('edit_history')) {
        console.log('   Column does not exist yet - proceeding with migration')
      } else {
        throw checkError
      }
    } else {
      console.log('   ✓ edit_history column already exists')
      console.log('   Sample:', existingEvents?.[0]?.edit_history)
    }

    // Step 2: Get all events without edit history
    console.log('\n📋 Step 2: Fetching events without edit_history...')

    const { data: events, error: fetchError } = await supabase
      .from('segmentation_events')
      .select('id, created_at, completed_by')

    if (fetchError) throw fetchError

    console.log(`   Found ${events?.length || 0} total events`)

    // Step 3: Backfill edit_history for events that don't have it
    console.log('\n📋 Step 3: Backfilling edit_history...')

    let updated = 0
    let skipped = 0

    for (const event of (events || [])) {
      // Check if this event already has edit_history
      const { data: existing } = await supabase
        .from('segmentation_events')
        .select('edit_history')
        .eq('id', event.id)
        .single()

      if (existing?.edit_history && Array.isArray(existing.edit_history) && existing.edit_history.length > 0) {
        skipped++
        continue
      }

      // Create initial history entry
      const initialHistory = [{
        timestamp: event.created_at,
        user: event.completed_by || 'System',
        action: 'created',
        field: null,
        old_value: null,
        new_value: null
      }]

      const { error: updateError } = await supabase
        .from('segmentation_events')
        .update({ edit_history: initialHistory })
        .eq('id', event.id)

      if (updateError) {
        console.error(`   ❌ Failed to update event ${event.id}:`, updateError.message)
      } else {
        updated++
      }
    }

    console.log(`   ✓ Updated: ${updated} events`)
    console.log(`   ⏭ Skipped: ${skipped} events (already had history)`)

    // Step 4: Verify migration
    console.log('\n📋 Step 4: Verifying migration...')

    const { data: verifyData, error: verifyError } = await supabase
      .from('segmentation_events')
      .select('id, edit_history')
      .not('edit_history', 'is', null)
      .limit(5)

    if (verifyError) throw verifyError

    console.log(`   ✓ Found ${verifyData?.length || 0} events with edit_history`)

    if (verifyData && verifyData.length > 0) {
      console.log('\n   Sample event history:')
      console.log('   ', JSON.stringify(verifyData[0].edit_history, null, 2))
    }

    console.log('\n✅ Migration completed successfully!')
    console.log('\nNote: The database trigger for auto-logging changes needs to be')
    console.log('created via the Supabase SQL Editor. Run the migration SQL file:')
    console.log('supabase/migrations/20251217_add_event_edit_history.sql')

  } catch (error) {
    console.error('\n❌ Migration failed:', error)
    process.exit(1)
  }
}

runMigration()
