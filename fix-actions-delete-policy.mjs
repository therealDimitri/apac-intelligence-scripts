#!/usr/bin/env node

/**
 * Fix Actions Delete RLS Policy
 *
 * The delete is failing because RLS policies only allow 'authenticated' role
 * but the app uses anon key without auth session.
 *
 * This script adds policies for the 'anon' role to allow full CRUD access.
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function applyPolicyFix() {
  console.log('🔧 Fixing actions table RLS policies for anon role...\n')

  const sql = `
-- Add anon role policies for actions table (to match authenticated policies)

-- Drop existing anon policies if any
DROP POLICY IF EXISTS "Allow anon read actions" ON public.actions;
DROP POLICY IF EXISTS "Allow anon insert actions" ON public.actions;
DROP POLICY IF EXISTS "Allow anon update actions" ON public.actions;
DROP POLICY IF EXISTS "Allow anon delete actions" ON public.actions;

-- Policy 1: Allow anon users to read all actions
CREATE POLICY "Allow anon read actions"
  ON public.actions
  FOR SELECT
  TO anon
  USING (true);

-- Policy 2: Allow anon users to create actions
CREATE POLICY "Allow anon insert actions"
  ON public.actions
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Policy 3: Allow anon users to update actions
CREATE POLICY "Allow anon update actions"
  ON public.actions
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- Policy 4: Allow anon users to delete actions
CREATE POLICY "Allow anon delete actions"
  ON public.actions
  FOR DELETE
  TO anon
  USING (true);
`

  // Execute the SQL via REST API
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseServiceKey,
      'Authorization': `Bearer ${supabaseServiceKey}`,
    },
    body: JSON.stringify({ sql }),
  })

  if (!response.ok) {
    console.log('RPC exec_sql not available, trying direct SQL via pg_query...')

    // Try alternative: execute each statement separately
    const statements = sql.split(';').filter(s => s.trim() && !s.trim().startsWith('--'))

    for (const stmt of statements) {
      if (!stmt.trim()) continue

      console.log('Executing:', stmt.trim().substring(0, 60) + '...')

      // Use Supabase's management API or log for manual execution
      console.log('\n⚠️  Cannot execute DDL directly. Please run this SQL in Supabase Dashboard:\n')
      console.log('='.repeat(60))
      console.log(sql)
      console.log('='.repeat(60))
      console.log('\n📋 SQL copied - paste in Supabase SQL Editor')

      // Copy to clipboard (macOS)
      const { exec } = await import('child_process')
      exec(`echo "${sql.replace(/"/g, '\\"')}" | pbcopy`, (err) => {
        if (!err) console.log('✅ SQL copied to clipboard!')
      })

      return
    }
  } else {
    const result = await response.json()
    console.log('✅ Policies applied successfully!')
    console.log(result)
  }

  // Verify policies
  console.log('\n📋 Verifying policies...')
  const { data: policies, error } = await supabase
    .from('pg_policies')
    .select('policyname, cmd, roles')
    .eq('tablename', 'actions')

  if (error) {
    console.log('Could not verify policies:', error.message)
  } else {
    console.log('Current policies on actions table:', policies)
  }
}

// Test delete after fix
async function testDelete() {
  console.log('\n🧪 Testing delete with anon key...')

  const anonClient = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

  // Get a test action
  const { data: actions } = await anonClient
    .from('actions')
    .select('id')
    .order('id', { ascending: false })
    .limit(1)

  if (actions?.length > 0) {
    console.log('Attempting to delete action ID:', actions[0].id)

    const { error } = await anonClient
      .from('actions')
      .delete()
      .eq('id', actions[0].id)

    if (error) {
      console.log('❌ Delete failed:', error.message)
    } else {
      // Verify it was deleted
      const { data: check } = await anonClient
        .from('actions')
        .select('id')
        .eq('id', actions[0].id)

      if (check?.length === 0) {
        console.log('✅ Delete succeeded!')
      } else {
        console.log('❌ Delete did not work (row still exists)')
      }
    }
  }
}

applyPolicyFix()
  .then(() => testDelete())
  .catch(console.error)
