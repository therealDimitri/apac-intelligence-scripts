#!/usr/bin/env node

/**
 * Create Action Enhanced Tables Migration
 *
 * This script creates the following tables required for enhanced action features:
 * 1. action_activity_log - For action history tracking
 * 2. action_relations - For explicit action relationships
 * 3. tags column on actions table - For action tagging
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function runMigration() {
  console.log('🚀 Starting Action Enhanced Tables Migration...\n')

  // 1. Add tags column to actions table
  console.log('📋 Step 1: Adding tags column to actions table...')
  try {
    const { error: tagsError } = await supabase.rpc('exec_sql', {
      sql: `
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'actions' AND column_name = 'tags'
          ) THEN
            ALTER TABLE actions ADD COLUMN tags jsonb DEFAULT '[]'::jsonb;
            COMMENT ON COLUMN actions.tags IS 'Array of tag strings for categorisation';
          END IF;
        END $$;
      `
    })

    if (tagsError) {
      console.warn('⚠️  Could not add tags column via RPC, trying direct approach...')
      // Try direct REST API approach
      const { error: directError } = await supabase
        .from('actions')
        .update({ tags: [] })
        .eq('Action_ID', 'NONEXISTENT')

      if (directError && directError.code === '42703') {
        console.log('   Tags column needs to be added manually via Supabase Dashboard')
        console.log('   SQL: ALTER TABLE actions ADD COLUMN tags jsonb DEFAULT \'[]\'::jsonb;')
      } else {
        console.log('✅ Tags column already exists or was added')
      }
    } else {
      console.log('✅ Tags column added to actions table')
    }
  } catch (err) {
    console.warn('⚠️  Could not add tags column:', err.message)
    console.log('   Please add manually: ALTER TABLE actions ADD COLUMN tags jsonb DEFAULT \'[]\'::jsonb;')
  }

  // 2. Create action_activity_log table
  console.log('\n📋 Step 2: Creating action_activity_log table...')
  try {
    // Check if table exists by trying to select from it
    const { error: checkError } = await supabase
      .from('action_activity_log')
      .select('id')
      .limit(1)

    if (checkError && checkError.code === '42P01') {
      console.log('   Table does not exist, creating...')

      // Create via management API if exec_sql not available
      const createTableSQL = `
        CREATE TABLE IF NOT EXISTS action_activity_log (
          id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          action_id text NOT NULL REFERENCES actions(Action_ID) ON DELETE CASCADE,
          activity_type text NOT NULL,
          user_name text NOT NULL,
          user_email text,
          description text NOT NULL,
          metadata jsonb DEFAULT '{}'::jsonb,
          created_at timestamptz DEFAULT now()
        );

        CREATE INDEX IF NOT EXISTS idx_action_activity_log_action_id
          ON action_activity_log(action_id);
        CREATE INDEX IF NOT EXISTS idx_action_activity_log_created_at
          ON action_activity_log(created_at DESC);

        COMMENT ON TABLE action_activity_log IS 'Tracks all changes to actions for history/audit';
      `

      console.log('   SQL to run in Supabase Dashboard:')
      console.log('   ' + createTableSQL.replace(/\n/g, '\n   '))

      // Try RPC approach
      const { error: rpcError } = await supabase.rpc('exec_sql', { sql: createTableSQL })
      if (!rpcError) {
        console.log('✅ action_activity_log table created')
      } else {
        console.log('⚠️  Please create table manually via Supabase Dashboard')
      }
    } else {
      console.log('✅ action_activity_log table already exists')
    }
  } catch (err) {
    console.warn('⚠️  Error checking action_activity_log:', err.message)
  }

  // 3. Create action_relations table
  console.log('\n📋 Step 3: Creating action_relations table...')
  try {
    const { error: checkError } = await supabase
      .from('action_relations')
      .select('id')
      .limit(1)

    if (checkError && checkError.code === '42P01') {
      console.log('   Table does not exist, creating...')

      const createTableSQL = `
        CREATE TABLE IF NOT EXISTS action_relations (
          id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          source_action_id text NOT NULL REFERENCES actions(Action_ID) ON DELETE CASCADE,
          target_action_id text NOT NULL REFERENCES actions(Action_ID) ON DELETE CASCADE,
          relation_type text NOT NULL CHECK (relation_type IN (
            'related_to', 'blocks', 'blocked_by', 'duplicates', 'parent_of', 'child_of'
          )),
          created_by text NOT NULL,
          created_at timestamptz DEFAULT now(),
          UNIQUE(source_action_id, target_action_id, relation_type)
        );

        CREATE INDEX IF NOT EXISTS idx_action_relations_source
          ON action_relations(source_action_id);
        CREATE INDEX IF NOT EXISTS idx_action_relations_target
          ON action_relations(target_action_id);

        COMMENT ON TABLE action_relations IS 'Stores explicit relationships between actions';
      `

      console.log('   SQL to run in Supabase Dashboard:')
      console.log('   ' + createTableSQL.replace(/\n/g, '\n   '))

      const { error: rpcError } = await supabase.rpc('exec_sql', { sql: createTableSQL })
      if (!rpcError) {
        console.log('✅ action_relations table created')
      } else {
        console.log('⚠️  Please create table manually via Supabase Dashboard')
      }
    } else {
      console.log('✅ action_relations table already exists')
    }
  } catch (err) {
    console.warn('⚠️  Error checking action_relations:', err.message)
  }

  console.log('\n✨ Migration script complete!')
  console.log('\n📝 If tables were not created automatically, please run the following SQL in Supabase Dashboard:\n')

  console.log(`
-- 1. Add tags column to actions table
ALTER TABLE actions ADD COLUMN IF NOT EXISTS tags jsonb DEFAULT '[]'::jsonb;
COMMENT ON COLUMN actions.tags IS 'Array of tag strings for categorisation';

-- 2. Create action_activity_log table
CREATE TABLE IF NOT EXISTS action_activity_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  action_id text NOT NULL REFERENCES actions("Action_ID") ON DELETE CASCADE,
  activity_type text NOT NULL,
  user_name text NOT NULL,
  user_email text,
  description text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_action_activity_log_action_id
  ON action_activity_log(action_id);
CREATE INDEX IF NOT EXISTS idx_action_activity_log_created_at
  ON action_activity_log(created_at DESC);

-- Enable RLS
ALTER TABLE action_activity_log ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow all operations for authenticated users" ON action_activity_log
  FOR ALL USING (true) WITH CHECK (true);

-- 3. Create action_relations table
CREATE TABLE IF NOT EXISTS action_relations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  source_action_id text NOT NULL REFERENCES actions("Action_ID") ON DELETE CASCADE,
  target_action_id text NOT NULL REFERENCES actions("Action_ID") ON DELETE CASCADE,
  relation_type text NOT NULL CHECK (relation_type IN (
    'related_to', 'blocks', 'blocked_by', 'duplicates', 'parent_of', 'child_of'
  )),
  created_by text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(source_action_id, target_action_id, relation_type)
);

CREATE INDEX IF NOT EXISTS idx_action_relations_source
  ON action_relations(source_action_id);
CREATE INDEX IF NOT EXISTS idx_action_relations_target
  ON action_relations(target_action_id);

-- Enable RLS
ALTER TABLE action_relations ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow all operations for authenticated users" ON action_relations
  FOR ALL USING (true) WITH CHECK (true);
  `)
}

runMigration().catch(console.error)
