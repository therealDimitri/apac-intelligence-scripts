#!/usr/bin/env node
/**
 * Apply Priority Matrix Assignments Migration
 * Creates the priority_matrix_assignments table for cross-device sync
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { readFileSync } from 'fs'

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

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function applyMigration() {
  console.log('🚀 Applying Priority Matrix Assignments migration...\n')

  // Read and execute each statement separately
  const statements = [
    // Create table
    `CREATE TABLE IF NOT EXISTS public.priority_matrix_assignments (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      item_id TEXT NOT NULL UNIQUE,
      owner TEXT,
      quadrant TEXT,
      client_assignments JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,

    // Create indexes
    `CREATE INDEX IF NOT EXISTS idx_priority_matrix_assignments_item_id
     ON public.priority_matrix_assignments(item_id)`,

    `CREATE INDEX IF NOT EXISTS idx_priority_matrix_assignments_owner
     ON public.priority_matrix_assignments(owner)`,

    // Enable RLS
    `ALTER TABLE public.priority_matrix_assignments ENABLE ROW LEVEL SECURITY`,

    // Drop existing policies first (to allow re-running)
    `DROP POLICY IF EXISTS "Allow anon read priority_matrix_assignments" ON public.priority_matrix_assignments`,
    `DROP POLICY IF EXISTS "Allow anon insert priority_matrix_assignments" ON public.priority_matrix_assignments`,
    `DROP POLICY IF EXISTS "Allow anon update priority_matrix_assignments" ON public.priority_matrix_assignments`,
    `DROP POLICY IF EXISTS "Allow anon delete priority_matrix_assignments" ON public.priority_matrix_assignments`,

    // Create RLS policies
    `CREATE POLICY "Allow anon read priority_matrix_assignments"
     ON public.priority_matrix_assignments FOR SELECT TO anon USING (true)`,

    `CREATE POLICY "Allow anon insert priority_matrix_assignments"
     ON public.priority_matrix_assignments FOR INSERT TO anon WITH CHECK (true)`,

    `CREATE POLICY "Allow anon update priority_matrix_assignments"
     ON public.priority_matrix_assignments FOR UPDATE TO anon
     USING (true) WITH CHECK (true)`,

    `CREATE POLICY "Allow anon delete priority_matrix_assignments"
     ON public.priority_matrix_assignments FOR DELETE TO anon USING (true)`,
  ]

  for (const sql of statements) {
    const shortSql = sql.replace(/\s+/g, ' ').slice(0, 60) + '...'
    try {
      const { error } = await supabase.rpc('exec_sql', { sql_query: sql })
      if (error) {
        // Try direct query if exec_sql not available
        const { error: directError } = await supabase.from('priority_matrix_assignments').select('id').limit(0)
        if (directError && !directError.message.includes('does not exist')) {
          console.log(`⚠️  ${shortSql}`)
          console.log(`   Error: ${error.message}`)
        }
      } else {
        console.log(`✅ ${shortSql}`)
      }
    } catch (err) {
      console.log(`⚠️  ${shortSql}`)
      console.log(`   ${err.message}`)
    }
  }

  // Verify table exists
  console.log('\n📋 Verifying table creation...')
  const { data, error } = await supabase
    .from('priority_matrix_assignments')
    .select('*')
    .limit(1)

  if (error) {
    console.error('❌ Table verification failed:', error.message)
    console.log('\n⚠️  Please run the SQL migration manually in Supabase SQL Editor:')
    console.log('   docs/migrations/20251230_priority_matrix_assignments.sql')
  } else {
    console.log('✅ Table priority_matrix_assignments is ready!')
    console.log(`   Current rows: ${data.length}`)
  }
}

applyMigration().catch(console.error)
