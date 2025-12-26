#!/usr/bin/env node
/**
 * Create ChaSen Learning System Tables via direct SQL execution
 */

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

// Extract project ref from URL
const projectRef = supabaseUrl.match(/https:\/\/([^.]+)/)?.[1]

async function executeSql(sql, description) {
  console.log(`Executing: ${description}...`)

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseServiceKey,
      'Authorization': `Bearer ${supabaseServiceKey}`,
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({ sql })
  })

  if (!response.ok) {
    const text = await response.text()
    // If exec_sql doesn't exist, we need another approach
    if (text.includes('function') || text.includes('not found') || response.status === 404) {
      return { needsManual: true }
    }
    throw new Error(`SQL execution failed: ${text}`)
  }

  return { success: true }
}

// Alternative: Use pg_query if available
async function tryPgQuery(sql) {
  const response = await fetch(`${supabaseUrl}/pg/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseServiceKey,
      'Authorization': `Bearer ${supabaseServiceKey}`
    },
    body: JSON.stringify({ query: sql })
  })

  return response.ok
}

async function createTables() {
  console.log('=' .repeat(60))
  console.log('Creating ChaSen Learning System Tables')
  console.log('=' .repeat(60))
  console.log(`Project: ${projectRef}`)
  console.log('')

  const createSQL = `
-- ChaSen Feedback Table
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

-- ChaSen Knowledge Suggestions Table
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

-- ChaSen Learning Patterns Table
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_chasen_feedback_conversation ON chasen_feedback(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chasen_feedback_rating ON chasen_feedback(rating) WHERE rating IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chasen_feedback_unprocessed ON chasen_feedback(processed) WHERE processed = false;
CREATE INDEX IF NOT EXISTS idx_chasen_suggestions_status ON chasen_knowledge_suggestions(status);
CREATE INDEX IF NOT EXISTS idx_chasen_suggestions_source ON chasen_knowledge_suggestions(source_type);
CREATE INDEX IF NOT EXISTS idx_chasen_patterns_type ON chasen_learning_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_chasen_patterns_active ON chasen_learning_patterns(is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE chasen_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE chasen_knowledge_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chasen_learning_patterns ENABLE ROW LEVEL SECURITY;

-- RLS Policies (allow service role full access)
DROP POLICY IF EXISTS "chasen_feedback_all_policy" ON chasen_feedback;
DROP POLICY IF EXISTS "chasen_suggestions_all_policy" ON chasen_knowledge_suggestions;
DROP POLICY IF EXISTS "chasen_patterns_all_policy" ON chasen_learning_patterns;

CREATE POLICY "chasen_feedback_all_policy" ON chasen_feedback FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "chasen_suggestions_all_policy" ON chasen_knowledge_suggestions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "chasen_patterns_all_policy" ON chasen_learning_patterns FOR ALL USING (true) WITH CHECK (true);
`

  // Output SQL for manual execution
  console.log('SQL to execute in Supabase Dashboard SQL Editor:')
  console.log('https://supabase.com/dashboard/project/' + projectRef + '/sql/new')
  console.log('')
  console.log('-'.repeat(60))
  console.log(createSQL)
  console.log('-'.repeat(60))
  console.log('')

  // Write to a file for easy copy
  const fs = await import('fs')
  const sqlPath = join(__dirname, '../migrations/chasen-learning-tables.sql')

  // Create migrations directory if it doesn't exist
  const migrationsDir = join(__dirname, '../migrations')
  if (!fs.existsSync(migrationsDir)) {
    fs.mkdirSync(migrationsDir, { recursive: true })
  }

  fs.writeFileSync(sqlPath, createSQL)
  console.log(`SQL saved to: ${sqlPath}`)
  console.log('')
  console.log('Please run this SQL in the Supabase Dashboard, then press Enter to verify...')

  // Try to verify if tables exist
  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  // Wait for user to run SQL manually, or proceed with verification
  const tables = ['chasen_feedback', 'chasen_knowledge_suggestions', 'chasen_learning_patterns']
  let allExist = true

  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('id').limit(1)
    if (error && (error.message.includes('not found') || error.message.includes('does not exist'))) {
      console.log(`✗ ${table} - not yet created`)
      allExist = false
    } else if (error) {
      console.log(`? ${table} - ${error.message}`)
      allExist = false
    } else {
      console.log(`✓ ${table} - exists`)
    }
  }

  if (!allExist) {
    console.log('\n⚠️  Some tables are missing. Please run the SQL above in Supabase Dashboard.')
    return false
  }

  console.log('\n✅ All tables verified!')
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
