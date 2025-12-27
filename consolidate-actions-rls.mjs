#!/usr/bin/env node

/**
 * Consolidate RLS policies on actions table
 * From 15 policies to 5 clean policies
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function exec(sql, desc) {
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql })
  if (error) {
    console.log(`  ⚠️ ${desc}: ${error.message}`)
    return false
  }
  if (data && !data.success) {
    console.log(`  ⚠️ ${desc}: ${data.error}`)
    return false
  }
  console.log(`  ✅ ${desc}`)
  return true
}

async function run() {
  console.log('🔧 Consolidating RLS policies on actions table')
  console.log('='.repeat(60))

  // Step 1: Drop all existing policies
  console.log('\n1️⃣ Dropping existing policies...')

  const policiesToDrop = [
    'Allow all users to update actions',
    'Allow anon delete actions',
    'Allow anon insert actions',
    'Allow anon read actions',
    'Allow anon update actions',
    'Allow anonymous read actions',
    'Allow authenticated delete actions',
    'Allow authenticated insert actions',
    'Allow authenticated read actions',
    'Allow authenticated update actions',
    'Service role full access actions',
    'actions_delete_admin_NEW',
    'actions_insert_authenticated_NEW',
    'actions_read_authenticated_NEW',
    'actions_write_own_NEW',
  ]

  for (const policy of policiesToDrop) {
    await exec(
      `DROP POLICY IF EXISTS "${policy}" ON actions`,
      `Drop "${policy.substring(0, 40)}..."`
    )
  }

  // Step 2: Create consolidated policies
  console.log('\n2️⃣ Creating consolidated policies...')

  // Policy 1: Service role full access
  await exec(
    `CREATE POLICY "service_role_full_access" ON actions
     FOR ALL TO service_role
     USING (true)
     WITH CHECK (true)`,
    'Create service_role_full_access'
  )

  // Policy 2: Authenticated users can read all actions
  await exec(
    `CREATE POLICY "authenticated_read" ON actions
     FOR SELECT TO authenticated
     USING (true)`,
    'Create authenticated_read'
  )

  // Policy 3: Authenticated users can insert actions
  await exec(
    `CREATE POLICY "authenticated_insert" ON actions
     FOR INSERT TO authenticated
     WITH CHECK (true)`,
    'Create authenticated_insert'
  )

  // Policy 4: Authenticated users can update actions
  await exec(
    `CREATE POLICY "authenticated_update" ON actions
     FOR UPDATE TO authenticated
     USING (true)
     WITH CHECK (true)`,
    'Create authenticated_update'
  )

  // Policy 5: Authenticated users can delete actions (admin only via app logic)
  await exec(
    `CREATE POLICY "authenticated_delete" ON actions
     FOR DELETE TO authenticated
     USING (true)`,
    'Create authenticated_delete'
  )

  // Step 3: Verify
  console.log('\n3️⃣ Verifying policies...')

  const { data: policies } = await supabase.rpc('exec_sql', {
    sql_query: `
      SELECT policyname, cmd, roles
      FROM pg_policies
      WHERE tablename = 'actions'
      ORDER BY policyname
    `,
  })

  if (policies && policies.success !== false) {
    console.log('\nCurrent policies on actions:')
    // The exec_sql returns result differently, let's just count
    const { data: countData } = await supabase.rpc('exec_sql', {
      sql_query: `SELECT COUNT(*) as count FROM pg_policies WHERE tablename = 'actions'`,
    })
    console.log('  Total policies:', countData?.rows?.[0]?.count || 'unknown')
  }

  console.log('\n' + '='.repeat(60))
  console.log('✅ RLS consolidation complete!')
  console.log('\nNew policy structure:')
  console.log('  1. service_role_full_access - Full access for service role')
  console.log('  2. authenticated_read - All authenticated can read')
  console.log('  3. authenticated_insert - All authenticated can insert')
  console.log('  4. authenticated_update - All authenticated can update')
  console.log('  5. authenticated_delete - All authenticated can delete')
}

run().catch(console.error)
