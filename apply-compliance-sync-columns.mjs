#!/usr/bin/env node

/**
 * Add columns to segmentation_events for Briefing Room sync
 *
 * Adds:
 * - linked_meeting_id: Links to unified_meetings
 * - scheduled_date: When the event is scheduled (separate from event_date)
 * - source: Where the event originated ('manual', 'briefing_room', 'import')
 */

import 'dotenv/config'
import postgres from 'postgres'

const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable not set')
  process.exit(1)
}

const sql = postgres(DATABASE_URL, { ssl: 'require' })

async function applyMigration() {
  console.log('🚀 Adding compliance sync columns to segmentation_events...\n')

  try {
    // Add linked_meeting_id column
    console.log('Adding linked_meeting_id column...')
    await sql`
      ALTER TABLE segmentation_events
      ADD COLUMN IF NOT EXISTS linked_meeting_id TEXT
    `
    console.log('  ✅ linked_meeting_id added')

    // Add scheduled_date column
    console.log('Adding scheduled_date column...')
    await sql`
      ALTER TABLE segmentation_events
      ADD COLUMN IF NOT EXISTS scheduled_date DATE
    `
    console.log('  ✅ scheduled_date added')

    // Add source column with default
    console.log('Adding source column...')
    await sql`
      ALTER TABLE segmentation_events
      ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual'
    `
    console.log('  ✅ source added')

    // Create index on linked_meeting_id for faster lookups
    console.log('Creating index on linked_meeting_id...')
    await sql`
      CREATE INDEX IF NOT EXISTS idx_seg_events_linked_meeting
      ON segmentation_events(linked_meeting_id)
      WHERE linked_meeting_id IS NOT NULL
    `
    console.log('  ✅ Index created')

    // Create index on source for filtering
    console.log('Creating index on source...')
    await sql`
      CREATE INDEX IF NOT EXISTS idx_seg_events_source
      ON segmentation_events(source)
    `
    console.log('  ✅ Index created')

    console.log('\n✅ Migration completed successfully!')
  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    throw error
  } finally {
    await sql.end()
  }
}

applyMigration().catch(() => process.exit(1))
