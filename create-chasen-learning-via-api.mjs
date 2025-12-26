#!/usr/bin/env node
/**
 * Create ChaSen Learning System Tables via Supabase API
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

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
  auth: { autoRefreshToken: false, persistSession: false }
})

async function createTables() {
  console.log('=' .repeat(60))
  console.log('Creating ChaSen Learning System Tables via Supabase API')
  console.log('=' .repeat(60))
  console.log('')

  // SQL statements to execute
  const statements = [
    {
      name: 'chasen_feedback table',
      sql: `
        CREATE TABLE IF NOT EXISTS chasen_feedback (
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
        );
      `
    },
    {
      name: 'chasen_knowledge_suggestions table',
      sql: `
        CREATE TABLE IF NOT EXISTS chasen_knowledge_suggestions (
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
        );
      `
    },
    {
      name: 'chasen_learning_patterns table',
      sql: `
        CREATE TABLE IF NOT EXISTS chasen_learning_patterns (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          pattern_type TEXT NOT NULL CHECK (pattern_type IN ('question_frequency', 'topic_trend', 'sentiment_theme', 'action_sequence', 'knowledge_gap')),
          pattern_key TEXT NOT NULL,
          pattern_data JSONB NOT NULL,
          occurrence_count INTEGER DEFAULT 1,
          first_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          is_active BOOLEAN DEFAULT true,
          UNIQUE(pattern_type, pattern_key)
        );
      `
    }
  ]

  // Try to execute via RPC if available, otherwise test with insert
  for (const stmt of statements) {
    console.log(`Creating ${stmt.name}...`)

    try {
      // Use the exec_sql RPC function if it exists
      const { error: rpcError } = await supabase.rpc('exec_sql', { sql: stmt.sql })

      if (rpcError) {
        // RPC doesn't exist, tables need to be created via Supabase dashboard
        console.log(`Note: ${stmt.name} needs to be created via dashboard`)
        console.log('SQL:', stmt.sql.trim().substring(0, 100) + '...')
      } else {
        console.log(`✓ ${stmt.name} created`)
      }
    } catch (e) {
      console.log(`Note: ${stmt.name} - RPC not available, checking if table exists...`)
    }
  }

  // Check if tables exist by trying to select from them
  console.log('\nVerifying tables exist...')

  const tables = ['chasen_feedback', 'chasen_knowledge_suggestions', 'chasen_learning_patterns']
  const existingTables = []
  const missingTables = []

  for (const table of tables) {
    const { error } = await supabase.from(table).select('id').limit(1)
    if (error && error.code === '42P01') {
      missingTables.push(table)
      console.log(`✗ ${table} - does not exist`)
    } else if (error) {
      console.log(`? ${table} - ${error.message}`)
    } else {
      existingTables.push(table)
      console.log(`✓ ${table} - exists`)
    }
  }

  if (missingTables.length > 0) {
    console.log('\n' + '=' .repeat(60))
    console.log('ACTION REQUIRED: Create tables via Supabase Dashboard')
    console.log('=' .repeat(60))
    console.log('\nGo to: https://supabase.com/dashboard/project/[your-project]/sql')
    console.log('\nRun the following SQL:\n')

    for (const stmt of statements) {
      if (missingTables.some(t => stmt.name.includes(t))) {
        console.log('-- ' + stmt.name)
        console.log(stmt.sql.trim())
        console.log('')
      }
    }

    // Enable RLS
    console.log('-- Enable RLS')
    for (const table of missingTables) {
      console.log(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`)
    }
    console.log('')

    // Create policies
    console.log('-- Create policies')
    for (const table of missingTables) {
      console.log(`CREATE POLICY "${table}_all_policy" ON ${table} FOR ALL USING (true) WITH CHECK (true);`)
    }

    return false
  }

  console.log('\n' + '=' .repeat(60))
  console.log('All ChaSen Learning tables are ready!')
  console.log('=' .repeat(60))
  return true
}

createTables()
  .then(success => {
    process.exit(success ? 0 : 1)
  })
  .catch(err => {
    console.error('Unexpected error:', err)
    process.exit(1)
  })
