#!/usr/bin/env node
/**
 * Migration: Add AI Context columns to actions table
 *
 * Adds columns to store ChaSen-generated context for actions created from meetings.
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
  console.error('❌ Missing required environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

async function addAIContextColumns() {
  console.log('🚀 Adding AI context columns to actions table...\n')

  // SQL to add the new columns
  const alterTableSQL = `
    -- Add AI context columns to actions table
    ALTER TABLE actions
    ADD COLUMN IF NOT EXISTS ai_context TEXT,
    ADD COLUMN IF NOT EXISTS ai_context_key_points JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS ai_context_urgency_indicators JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS ai_context_related_topics JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS ai_context_confidence INTEGER,
    ADD COLUMN IF NOT EXISTS ai_context_generated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ai_context_meeting_title TEXT;

    -- Add comment for documentation
    COMMENT ON COLUMN actions.ai_context IS 'ChaSen AI-generated context about the action based on source meeting';
    COMMENT ON COLUMN actions.ai_context_key_points IS 'Key points extracted by AI from meeting context';
    COMMENT ON COLUMN actions.ai_context_urgency_indicators IS 'Urgency factors identified by AI';
    COMMENT ON COLUMN actions.ai_context_related_topics IS 'Related topics from the meeting';
    COMMENT ON COLUMN actions.ai_context_confidence IS 'AI confidence score (0-100)';
    COMMENT ON COLUMN actions.ai_context_generated_at IS 'Timestamp when AI context was generated';
    COMMENT ON COLUMN actions.ai_context_meeting_title IS 'Title of the source meeting for context';
  `

  try {
    // Execute via RPC if available, otherwise try direct
    const { error } = await supabase.rpc('exec_sql', { sql: alterTableSQL })

    if (error) {
      // Try alternative approach - execute statements one by one
      console.log('ℹ️  RPC not available, trying alternative approach...\n')

      const columns = [
        { name: 'ai_context', type: 'TEXT' },
        { name: 'ai_context_key_points', type: "JSONB DEFAULT '[]'::jsonb" },
        { name: 'ai_context_urgency_indicators', type: "JSONB DEFAULT '[]'::jsonb" },
        { name: 'ai_context_related_topics', type: "JSONB DEFAULT '[]'::jsonb" },
        { name: 'ai_context_confidence', type: 'INTEGER' },
        { name: 'ai_context_generated_at', type: 'TIMESTAMPTZ' },
        { name: 'ai_context_meeting_title', type: 'TEXT' },
      ]

      // Check which columns already exist
      const { data: existingCols } = await supabase
        .from('actions')
        .select('*')
        .limit(1)

      if (existingCols && existingCols.length > 0) {
        const existingKeys = Object.keys(existingCols[0])

        for (const col of columns) {
          if (existingKeys.includes(col.name)) {
            console.log(`  ✓ Column ${col.name} already exists`)
          } else {
            console.log(`  → Adding column ${col.name}...`)
            // Columns will need to be added via Supabase Dashboard or direct SQL
          }
        }
      }

      console.log('\n⚠️  Please run the following SQL in the Supabase Dashboard:\n')
      console.log(alterTableSQL)
      console.log('\n📋 SQL has been output above. Copy and run in Supabase SQL Editor.')

      return
    }

    console.log('✅ AI context columns added successfully!\n')

    // Verify the columns were added
    const { data: sample } = await supabase
      .from('actions')
      .select('id, ai_context, ai_context_generated_at')
      .limit(1)

    if (sample) {
      console.log('✓ Verified: New columns are accessible')
    }

  } catch (err) {
    console.error('❌ Error:', err.message)
    console.log('\n⚠️  Please run the following SQL in the Supabase Dashboard:\n')
    console.log(alterTableSQL)
  }
}

addAIContextColumns()
