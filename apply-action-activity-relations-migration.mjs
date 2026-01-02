#!/usr/bin/env node

/**
 * Apply Action Activity Log and Relations Migration
 *
 * Creates the action_activity_log and action_relations tables
 * needed for the History and Related Actions features.
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
})

async function createTables() {
  console.log('Creating action_activity_log and action_relations tables...\n')

  // Create action_activity_log table
  const { error: activityError } = await supabase.rpc('exec_sql', {
    sql: `
      CREATE TABLE IF NOT EXISTS action_activity_log (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        action_id text NOT NULL,
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
    `
  })

  if (activityError) {
    // Try raw SQL via the REST API
    console.log('RPC not available, trying direct table creation...')

    // Check if table exists
    const { data: existingTable } = await supabase
      .from('action_activity_log')
      .select('id')
      .limit(1)

    if (existingTable === null) {
      console.log('Table does not exist yet. Please run the migration manually in Supabase SQL Editor.')
      console.log('Migration file: docs/migrations/20260102_action_activity_and_relations.sql')
    } else {
      console.log('✓ action_activity_log table already exists')
    }
  } else {
    console.log('✓ Created action_activity_log table')
  }

  // Check action_relations table
  const { data: relationsTable } = await supabase
    .from('action_relations')
    .select('id')
    .limit(1)

  if (relationsTable === null) {
    console.log('action_relations table does not exist yet.')
  } else {
    console.log('✓ action_relations table exists')
  }

  console.log('\n=== Summary ===')
  console.log('If tables do not exist, please run the migration manually:')
  console.log('1. Open Supabase SQL Editor')
  console.log('2. Copy contents from: docs/migrations/20260102_action_activity_and_relations.sql')
  console.log('3. Execute the SQL')
}

createTables().catch(console.error)
