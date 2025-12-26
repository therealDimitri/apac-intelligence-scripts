#!/usr/bin/env node
/**
 * Create ChaSen Learning System Tables
 * - chasen_feedback: Stores user feedback on ChaSen responses
 * - chasen_knowledge_suggestions: Auto-generated knowledge entry suggestions
 * - chasen_learning_patterns: Extracted patterns from meetings, NPS, actions
 */

import pg from 'pg'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '../.env.local') })

const { Client } = pg

const connectionString = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL

if (!connectionString) {
  console.error('Missing DATABASE_URL in environment')
  process.exit(1)
}

const createFeedbackTableSQL = `
-- ChaSen Feedback Table - stores user ratings on responses
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

const createSuggestionsTableSQL = `
-- ChaSen Knowledge Suggestions - auto-generated entries for review
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
    merged_to_id UUID REFERENCES chasen_knowledge(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
`

const createPatternsTableSQL = `
-- ChaSen Learning Patterns - extracted intelligence from various sources
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

const createIndexesSQL = `
-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_chasen_feedback_conversation ON chasen_feedback(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chasen_feedback_rating ON chasen_feedback(rating) WHERE rating IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chasen_feedback_unprocessed ON chasen_feedback(processed) WHERE processed = false;
CREATE INDEX IF NOT EXISTS idx_chasen_suggestions_status ON chasen_knowledge_suggestions(status);
CREATE INDEX IF NOT EXISTS idx_chasen_suggestions_source ON chasen_knowledge_suggestions(source_type);
CREATE INDEX IF NOT EXISTS idx_chasen_patterns_type ON chasen_learning_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_chasen_patterns_active ON chasen_learning_patterns(is_active) WHERE is_active = true;
`

const enableRLSSQL = `
-- Enable RLS on all tables
ALTER TABLE chasen_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE chasen_knowledge_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chasen_learning_patterns ENABLE ROW LEVEL SECURITY;
`

const createPoliciesSQL = `
-- Drop existing policies
DROP POLICY IF EXISTS "chasen_feedback_all_policy" ON chasen_feedback;
DROP POLICY IF EXISTS "chasen_suggestions_all_policy" ON chasen_knowledge_suggestions;
DROP POLICY IF EXISTS "chasen_patterns_all_policy" ON chasen_learning_patterns;

-- Allow service role full access
CREATE POLICY "chasen_feedback_all_policy"
  ON chasen_feedback FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "chasen_suggestions_all_policy"
  ON chasen_knowledge_suggestions FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "chasen_patterns_all_policy"
  ON chasen_learning_patterns FOR ALL
  USING (true)
  WITH CHECK (true);
`

async function createTables() {
  console.log('=' .repeat(60))
  console.log('Creating ChaSen Learning System Tables')
  console.log('=' .repeat(60))
  console.log('')

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  })

  try {
    console.log('Connecting to Postgres...')
    await client.connect()
    console.log('Connected successfully!\n')

    // Create feedback table
    console.log('Creating chasen_feedback table...')
    await client.query(createFeedbackTableSQL)
    console.log('✓ chasen_feedback table ready')

    // Create suggestions table
    console.log('Creating chasen_knowledge_suggestions table...')
    await client.query(createSuggestionsTableSQL)
    console.log('✓ chasen_knowledge_suggestions table ready')

    // Create patterns table
    console.log('Creating chasen_learning_patterns table...')
    await client.query(createPatternsTableSQL)
    console.log('✓ chasen_learning_patterns table ready')

    // Create indexes
    console.log('\nCreating indexes...')
    await client.query(createIndexesSQL)
    console.log('✓ Indexes created')

    // Enable RLS
    console.log('\nEnabling Row Level Security...')
    await client.query(enableRLSSQL)
    console.log('✓ RLS enabled')

    // Create policies
    console.log('Creating RLS policies...')
    await client.query(createPoliciesSQL)
    console.log('✓ Policies created')

    // Verify tables
    console.log('\n' + '=' .repeat(60))
    console.log('Verifying tables...')

    const tables = ['chasen_feedback', 'chasen_knowledge_suggestions', 'chasen_learning_patterns']
    for (const table of tables) {
      const result = await client.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = $1
        ORDER BY ordinal_position
      `, [table])

      console.log(`\n${table} (${result.rows.length} columns):`)
      result.rows.forEach(row => {
        console.log(`  - ${row.column_name}: ${row.data_type}`)
      })
    }

    console.log('\n' + '=' .repeat(60))
    console.log('ChaSen Learning System tables created successfully!')
    console.log('=' .repeat(60))

    return true
  } catch (error) {
    console.error('Error:', error.message)
    if (error.code) {
      console.error('Code:', error.code)
    }
    return false
  } finally {
    await client.end()
  }
}

createTables()
  .then(success => {
    process.exit(success ? 0 : 1)
  })
  .catch(err => {
    console.error('Unexpected error:', err)
    process.exit(1)
  })
