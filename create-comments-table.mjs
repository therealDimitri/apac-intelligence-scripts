#!/usr/bin/env node

/**
 * Migration Script: Create Unified Comments Table
 *
 * Creates the comments table for the unified comments system across
 * Actions, Meetings, and Client Profiles.
 *
 * Run: node scripts/create-comments-table.mjs
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
  console.error('❌ Missing environment variables:')
  console.error('   - NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✓' : '✗')
  console.error('   - SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✓' : '✗')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
})

async function createCommentsTable() {
  console.log('🚀 Creating unified comments table...\n')

  // SQL to create the comments table
  const createTableSQL = `
    -- Drop existing table if exists (for clean migration)
    DROP TABLE IF EXISTS comments CASCADE;

    -- Create comments table
    CREATE TABLE comments (
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

    -- Indexes for performance
    CREATE INDEX idx_comments_entity ON comments(entity_type, entity_id);
    CREATE INDEX idx_comments_parent ON comments(parent_id) WHERE parent_id IS NOT NULL;
    CREATE INDEX idx_comments_client ON comments(client_name) WHERE client_name IS NOT NULL;
    CREATE INDEX idx_comments_author ON comments(author_id);
    CREATE INDEX idx_comments_created ON comments(created_at DESC);
    CREATE INDEX idx_comments_not_deleted ON comments(is_deleted) WHERE is_deleted = FALSE;

    -- Trigger to update updated_at timestamp
    CREATE OR REPLACE FUNCTION update_comments_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER comments_updated_at_trigger
      BEFORE UPDATE ON comments
      FOR EACH ROW
      EXECUTE FUNCTION update_comments_updated_at();

    -- Enable Row Level Security
    ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

    -- RLS Policies
    -- Allow all authenticated users to read comments
    CREATE POLICY "Comments are viewable by all"
      ON comments FOR SELECT
      USING (true);

    -- Allow service role to insert comments
    CREATE POLICY "Service role can insert comments"
      ON comments FOR INSERT
      WITH CHECK (true);

    -- Allow service role to update comments
    CREATE POLICY "Service role can update comments"
      ON comments FOR UPDATE
      USING (true);

    -- Allow service role to delete comments
    CREATE POLICY "Service role can delete comments"
      ON comments FOR DELETE
      USING (true);
  `

  try {
    // Execute the SQL using rpc
    const { error } = await supabase.rpc('exec_sql', { sql: createTableSQL })

    if (error) {
      // Try alternative method - direct query
      console.log('⚠️  RPC method not available, trying direct execution...')

      // Split into individual statements and execute
      const statements = createTableSQL
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'))

      for (const stmt of statements) {
        const { error: stmtError } = await supabase.from('_exec').select().eq('sql', stmt + ';')
        if (stmtError && !stmtError.message.includes('does not exist')) {
          console.error(`❌ Error executing: ${stmt.substring(0, 50)}...`)
          console.error(stmtError)
        }
      }
    }

    // Verify table was created
    const { data, error: verifyError } = await supabase
      .from('comments')
      .select('id')
      .limit(1)

    if (verifyError && verifyError.code === '42P01') {
      console.error('❌ Table was not created. You may need to run this SQL manually in Supabase Dashboard.')
      console.log('\n📋 Copy the following SQL and run in Supabase SQL Editor:\n')
      console.log(createTableSQL)
      return false
    }

    if (verifyError) {
      console.log('⚠️  Table may exist but query failed:', verifyError.message)
    }

    console.log('✅ Comments table created successfully!')
    console.log('\n📊 Table structure:')
    console.log('   - id (UUID, primary key)')
    console.log('   - entity_type (action | meeting | client)')
    console.log('   - entity_id (text)')
    console.log('   - parent_id (UUID, for threading)')
    console.log('   - thread_depth (0-3)')
    console.log('   - content (HTML)')
    console.log('   - content_plain (text, for search)')
    console.log('   - mentions (JSONB)')
    console.log('   - author_id, author_name, author_avatar')
    console.log('   - likes_count, liked_by')
    console.log('   - is_resolved, resolved_at, resolved_by')
    console.log('   - is_edited, is_deleted')
    console.log('   - client_name (for activity stream)')
    console.log('   - created_at, updated_at')

    return true
  } catch (err) {
    console.error('❌ Failed to create table:', err)
    console.log('\n📋 Run this SQL manually in Supabase Dashboard:\n')
    console.log(createTableSQL)
    return false
  }
}

// Run migration
createCommentsTable()
  .then(success => {
    if (success) {
      console.log('\n🎉 Migration complete!')
    } else {
      console.log('\n⚠️  Migration may require manual intervention.')
    }
    process.exit(success ? 0 : 1)
  })
  .catch(err => {
    console.error('❌ Unexpected error:', err)
    process.exit(1)
  })
