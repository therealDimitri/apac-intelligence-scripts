#!/usr/bin/env node
/**
 * Execute AI Context Migration via direct PostgreSQL connection
 */

import pg from 'pg'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '..', '.env.local') })

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  console.error('❌ DATABASE_URL not found in environment')
  process.exit(1)
}

const { Client } = pg

async function runMigration() {
  const client = new Client({ connectionString: databaseUrl })

  try {
    console.log('🔌 Connecting to database...')
    await client.connect()

    console.log('🚀 Adding AI context columns to actions table...\n')

    // Add columns one by one to handle IF NOT EXISTS properly
    const columns = [
      { sql: 'ALTER TABLE actions ADD COLUMN IF NOT EXISTS ai_context TEXT', name: 'ai_context' },
      { sql: "ALTER TABLE actions ADD COLUMN IF NOT EXISTS ai_context_key_points JSONB DEFAULT '[]'::jsonb", name: 'ai_context_key_points' },
      { sql: "ALTER TABLE actions ADD COLUMN IF NOT EXISTS ai_context_urgency_indicators JSONB DEFAULT '[]'::jsonb", name: 'ai_context_urgency_indicators' },
      { sql: "ALTER TABLE actions ADD COLUMN IF NOT EXISTS ai_context_related_topics JSONB DEFAULT '[]'::jsonb", name: 'ai_context_related_topics' },
      { sql: 'ALTER TABLE actions ADD COLUMN IF NOT EXISTS ai_context_confidence INTEGER', name: 'ai_context_confidence' },
      { sql: 'ALTER TABLE actions ADD COLUMN IF NOT EXISTS ai_context_generated_at TIMESTAMPTZ', name: 'ai_context_generated_at' },
      { sql: 'ALTER TABLE actions ADD COLUMN IF NOT EXISTS ai_context_meeting_title TEXT', name: 'ai_context_meeting_title' },
    ]

    for (const col of columns) {
      try {
        await client.query(col.sql)
        console.log(`  ✓ Added column: ${col.name}`)
      } catch (err) {
        if (err.message.includes('already exists')) {
          console.log(`  ✓ Column already exists: ${col.name}`)
        } else {
          console.error(`  ✗ Error adding ${col.name}:`, err.message)
        }
      }
    }

    // Add comments
    const comments = [
      "COMMENT ON COLUMN actions.ai_context IS 'ChaSen AI-generated context about the action based on source meeting'",
      "COMMENT ON COLUMN actions.ai_context_key_points IS 'Key points extracted by AI from meeting context'",
      "COMMENT ON COLUMN actions.ai_context_urgency_indicators IS 'Urgency factors identified by AI'",
      "COMMENT ON COLUMN actions.ai_context_related_topics IS 'Related topics from the meeting'",
      "COMMENT ON COLUMN actions.ai_context_confidence IS 'AI confidence score (0-100)'",
      "COMMENT ON COLUMN actions.ai_context_generated_at IS 'Timestamp when AI context was generated'",
      "COMMENT ON COLUMN actions.ai_context_meeting_title IS 'Title of the source meeting for context'",
    ]

    console.log('\n📝 Adding column comments...')
    for (const comment of comments) {
      try {
        await client.query(comment)
      } catch (err) {
        // Ignore comment errors
      }
    }

    console.log('\n✅ Migration complete!')

    // Verify
    const { rows } = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'actions' AND column_name LIKE 'ai_context%'
      ORDER BY column_name
    `)

    console.log('\n📋 New columns:')
    rows.forEach(row => {
      console.log(`  - ${row.column_name} (${row.data_type})`)
    })

  } catch (err) {
    console.error('❌ Migration failed:', err.message)
  } finally {
    await client.end()
  }
}

runMigration()
