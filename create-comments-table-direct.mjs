#!/usr/bin/env node

/**
 * Direct Migration: Create Unified Comments Table
 *
 * Creates the comments table directly using Supabase service role.
 * Run: node scripts/create-comments-table-direct.mjs
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
})

const createTableSQL = `
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Entity linking (polymorphic association)
  entity_type TEXT NOT NULL CHECK (entity_type IN ('action', 'meeting', 'client')),
  entity_id TEXT NOT NULL,

  -- Threading
  parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  thread_depth INTEGER DEFAULT 0 CHECK (thread_depth >= 0 AND thread_depth <= 3),

  -- Content (rich text stored as HTML)
  content TEXT NOT NULL,
  content_plain TEXT,
  mentions JSONB DEFAULT '[]'::jsonb,

  -- Author
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_avatar TEXT,

  -- Reactions
  likes_count INTEGER DEFAULT 0,
  liked_by JSONB DEFAULT '[]'::jsonb,

  -- Resolution
  is_resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,

  -- Edit tracking
  is_edited BOOLEAN DEFAULT FALSE,
  is_deleted BOOLEAN DEFAULT FALSE,

  -- Client association (for activity stream)
  client_name TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_entity ON comments(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comments_client ON comments(client_name) WHERE client_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comments_author ON comments(author_id);
CREATE INDEX IF NOT EXISTS idx_comments_created ON comments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_not_deleted ON comments(is_deleted) WHERE is_deleted = FALSE;

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all select on comments" ON comments;
CREATE POLICY "Allow all select on comments" ON comments FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow all insert on comments" ON comments;
CREATE POLICY "Allow all insert on comments" ON comments FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all update on comments" ON comments;
CREATE POLICY "Allow all update on comments" ON comments FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all delete on comments" ON comments;
CREATE POLICY "Allow all delete on comments" ON comments FOR DELETE USING (true);
`

async function createTable() {
  console.log('🚀 Creating unified comments table...\n')

  // First check if table exists
  const { data, error: checkError } = await supabase.from('comments').select('id').limit(1)

  if (!checkError) {
    console.log('✅ Comments table already exists!')
    return true
  }

  if (checkError.code !== '42P01') {
    console.log('⚠️  Unexpected error:', checkError)
  }

  // Try to create via exec_sql RPC
  console.log('Attempting to create table via exec_sql RPC...')
  const { error: rpcError } = await supabase.rpc('exec_sql', { query: createTableSQL })

  if (rpcError) {
    console.log('⚠️  RPC not available:', rpcError.message)
    console.log('\n📋 Please run the following SQL in Supabase Dashboard SQL Editor:\n')
    console.log('=' .repeat(60))
    console.log(createTableSQL)
    console.log('=' .repeat(60))
    return false
  }

  // Verify table was created
  const { error: verifyError } = await supabase.from('comments').select('id').limit(1)

  if (verifyError) {
    console.log('❌ Table verification failed:', verifyError.message)
    return false
  }

  console.log('✅ Comments table created successfully!')
  return true
}

createTable()
  .then(success => {
    if (success) {
      console.log('\n🎉 Migration complete!')
    }
    process.exit(success ? 0 : 1)
  })
  .catch(err => {
    console.error('❌ Error:', err)
    process.exit(1)
  })
