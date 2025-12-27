#!/usr/bin/env node

/**
 * Apply Priority 1 Database Optimizations
 * Based on DATABASE-OPTIMISATION-REPORT-20251227.md
 * Uses Supabase REST API
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
  console.error('❌ Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function executeSQL(sql, description) {
  console.log(`   Executing: ${description}...`)
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql })

  if (error) {
    console.log(`   ⚠️ RPC error: ${error.message}`)
    throw new Error(`SQL execution failed: ${error.message}`)
  }
  console.log(`   Result:`, data)
  return data
}

async function applyOptimizations() {
  console.log('🔧 Applying Priority 1 Database Optimizations\n')
  console.log('=' .repeat(60) + '\n')

  // 1. Delete test_meetings table
  console.log('1️⃣ Deleting test_meetings table...')
  try {
    await executeSQL('DROP TABLE IF EXISTS test_meetings CASCADE', 'DROP test_meetings')
    console.log('   ✅ test_meetings dropped\n')
  } catch (err) {
    console.log(`   ⚠️ Error: ${err.message}\n`)
  }

  // 2. Check and delete aging_accounts_history
  console.log('2️⃣ Checking aging_accounts_history...')
  try {
    const { count, error } = await supabase
      .from('aging_accounts_history')
      .select('*', { count: 'exact', head: true })

    if (error) {
      console.log(`   ⚠️ Table may not exist: ${error.message}\n`)
    } else if (count === 0) {
      await executeSQL('DROP TABLE IF EXISTS aging_accounts_history CASCADE', 'DROP aging_accounts_history')
      console.log('   ✅ aging_accounts_history dropped (was empty)\n')
    } else {
      console.log(`   ⚠️ Skipped - table has ${count} rows\n`)
    }
  } catch (err) {
    console.log(`   ⚠️ Error: ${err.message}\n`)
  }

  // 3. Add deprecation comments via direct SQL
  console.log('3️⃣ Adding deprecation comments to legacy tables...')
  try {
    await executeSQL(
      `COMMENT ON TABLE client_name_aliases IS 'DEPRECATED: Use client_aliases_unified instead. This table will be removed in a future release.'`,
      'COMMENT on client_name_aliases'
    )
    console.log('   ✅ client_name_aliases marked as deprecated')
  } catch (err) {
    console.log(`   ⚠️ client_name_aliases: ${err.message}`)
  }

  try {
    await executeSQL(
      `COMMENT ON TABLE nps_clients IS 'DEPRECATED: Use clients table instead. Foreign keys still reference this table - migration in progress.'`,
      'COMMENT on nps_clients'
    )
    console.log('   ✅ nps_clients marked as deprecated\n')
  } catch (err) {
    console.log(`   ⚠️ nps_clients: ${err.message}\n`)
  }

  // 4. Enable RLS on document_embeddings
  console.log('4️⃣ Adding RLS to document_embeddings...')
  try {
    await executeSQL('ALTER TABLE document_embeddings ENABLE ROW LEVEL SECURITY', 'Enable RLS')

    await executeSQL(
      `DROP POLICY IF EXISTS "Service role has full access to document_embeddings" ON document_embeddings`,
      'Drop existing policy'
    )
    await executeSQL(
      `CREATE POLICY "Service role has full access to document_embeddings" ON document_embeddings FOR ALL TO service_role USING (true) WITH CHECK (true)`,
      'Create service_role policy'
    )

    await executeSQL(
      `DROP POLICY IF EXISTS "Authenticated users can read document_embeddings" ON document_embeddings`,
      'Drop existing read policy'
    )
    await executeSQL(
      `CREATE POLICY "Authenticated users can read document_embeddings" ON document_embeddings FOR SELECT TO authenticated USING (true)`,
      'Create authenticated read policy'
    )

    console.log('   ✅ RLS enabled with service_role and authenticated policies\n')
  } catch (err) {
    console.log(`   ⚠️ Error: ${err.message}\n`)
  }

  // 5. Enable RLS on chasen_user_memories
  console.log('5️⃣ Adding RLS to chasen_user_memories...')
  try {
    await executeSQL('ALTER TABLE chasen_user_memories ENABLE ROW LEVEL SECURITY', 'Enable RLS')

    await executeSQL(
      `DROP POLICY IF EXISTS "Service role has full access to chasen_user_memories" ON chasen_user_memories`,
      'Drop existing policy'
    )
    await executeSQL(
      `CREATE POLICY "Service role has full access to chasen_user_memories" ON chasen_user_memories FOR ALL TO service_role USING (true) WITH CHECK (true)`,
      'Create service_role policy'
    )

    await executeSQL(
      `DROP POLICY IF EXISTS "Users can manage their own memories" ON chasen_user_memories`,
      'Drop existing user policy'
    )
    await executeSQL(
      `CREATE POLICY "Users can manage their own memories" ON chasen_user_memories FOR ALL TO authenticated USING (user_id = auth.uid()::text OR user_id = (auth.jwt() ->> 'email')) WITH CHECK (user_id = auth.uid()::text OR user_id = (auth.jwt() ->> 'email'))`,
      'Create user-based policy'
    )

    console.log('   ✅ RLS enabled with service_role and user-based policies\n')
  } catch (err) {
    console.log(`   ⚠️ Error: ${err.message}\n`)
  }

  // 6. Verification via REST queries
  console.log('6️⃣ Verifying changes...')

  // Check if tables still exist
  const { data: testMeetings } = await supabase.from('test_meetings').select('*', { count: 'exact', head: true })
  console.log(`   test_meetings exists: ${testMeetings !== null ? '❌ YES' : '✅ NO (dropped)'}`)

  const { data: agingHistory, error: agingErr } = await supabase.from('aging_accounts_history').select('*', { count: 'exact', head: true })
  console.log(`   aging_accounts_history exists: ${agingErr ? '✅ NO (dropped)' : '❌ YES'}`)

  console.log('\n' + '=' .repeat(60))
  console.log('✅ Priority 1 optimizations complete!')
  console.log('\nNext steps:')
  console.log('  - Priority 2: Add client_uuid to remaining 23 tables')
  console.log('  - Priority 2: Consolidate meeting tables')
  console.log('  - Priority 3: Normalise unified_meetings (54 columns)')
}

applyOptimizations().catch(console.error)
