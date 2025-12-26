#!/usr/bin/env node
/**
 * Execute SQL via Supabase's database endpoint
 * Uses the postgres REST endpoint for DDL operations
 */

import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { createClient } from '@supabase/supabase-js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '../.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  db: { schema: 'public' }
})

// SQL statements to execute one at a time
const statements = [
  // Create chasen_feedback table
  `CREATE TABLE IF NOT EXISTS chasen_feedback (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    message_index INTEGER NOT NULL,
    user_query TEXT NOT NULL,
    chasen_response TEXT NOT NULL,
    rating TEXT CHECK (rating IN ('helpful', 'not_helpful', 'missing_info')),
    feedback_text TEXT,
    knowledge_entries_used JSONB DEFAULT '[]'::jsonb,
    confidence_score DECIMAL(3,2),
    user_email TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed BOOLEAN DEFAULT false,
    processed_at TIMESTAMP WITH TIME ZONE
  )`,

  // Create chasen_knowledge_suggestions table
  `CREATE TABLE IF NOT EXISTS chasen_knowledge_suggestions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    source_type TEXT NOT NULL CHECK (source_type IN ('gap_detection', 'meeting_extraction', 'nps_mining', 'action_patterns', 'feedback_analysis', 'document_sync')),
    source_id TEXT,
    source_context JSONB DEFAULT '{}'::jsonb,
    suggested_category TEXT NOT NULL,
    suggested_key TEXT NOT NULL,
    suggested_title TEXT NOT NULL,
    suggested_content TEXT NOT NULL,
    suggested_priority INTEGER DEFAULT 50,
    confidence_score DECIMAL(3,2),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'merged')),
    reviewed_by TEXT,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    review_notes TEXT,
    merged_to_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  )`,

  // Create chasen_learning_patterns table
  `CREATE TABLE IF NOT EXISTS chasen_learning_patterns (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    pattern_type TEXT NOT NULL CHECK (pattern_type IN ('question_frequency', 'topic_trend', 'sentiment_theme', 'action_sequence', 'knowledge_gap')),
    pattern_key TEXT NOT NULL,
    pattern_data JSONB NOT NULL,
    occurrence_count INTEGER DEFAULT 1,
    first_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true,
    UNIQUE(pattern_type, pattern_key)
  )`
]

async function executeViaRpc(sql) {
  // Try various RPC function names that might exist
  const rpcNames = ['exec_sql', 'execute_sql', 'run_sql', 'sql']

  for (const rpcName of rpcNames) {
    try {
      const { data, error } = await supabase.rpc(rpcName, { sql })
      if (!error) {
        return { success: true, via: rpcName }
      }
    } catch (e) {
      // Continue to next
    }
  }

  return { success: false }
}

async function createTablesViaAPI() {
  console.log('Attempting to create tables via Supabase API...\n')

  // First, let's check if we can create a simple test to see if tables already exist
  const tables = ['chasen_feedback', 'chasen_knowledge_suggestions', 'chasen_learning_patterns']

  for (const table of tables) {
    const { error } = await supabase.from(table).select('id').limit(0)

    if (!error) {
      console.log(`✓ ${table} already exists`)
    } else if (error.message.includes('schema cache') || error.message.includes('does not exist')) {
      console.log(`✗ ${table} needs to be created`)

      // Try to insert an empty record to trigger table creation (won't work for DDL)
      // This is just to confirm the table doesn't exist
    } else {
      console.log(`? ${table}: ${error.message}`)
    }
  }

  // Since we can't execute DDL directly, let's create a workaround
  // by using the Supabase Management API if available
  const projectRef = supabaseUrl.match(/https:\/\/([^.]+)/)?.[1]

  console.log('\n' + '='.repeat(60))
  console.log('Tables need to be created via Supabase Dashboard')
  console.log('='.repeat(60))
  console.log(`\nProject ID: ${projectRef}`)
  console.log(`Dashboard URL: https://supabase.com/dashboard/project/${projectRef}/sql/new`)
  console.log('\nCopy and run the SQL from: migrations/chasen-learning-tables.sql')

  return false
}

createTablesViaAPI()
  .then(success => {
    if (!success) {
      console.log('\n📋 SQL file ready at: migrations/chasen-learning-tables.sql')
      console.log('Please execute it in the Supabase SQL Editor')
    }
    process.exit(success ? 0 : 1)
  })
  .catch(err => {
    console.error('Error:', err)
    process.exit(1)
  })
