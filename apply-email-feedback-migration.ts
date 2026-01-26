/**
 * Apply email_feedback table migration
 * Uses the exec_sql RPC function for DDL operations
 */

import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !serviceKey) {
  throw new Error('Missing Supabase credentials')
}

async function execSql(sql: string): Promise<{ success: boolean; message?: string; error?: string }> {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql_query: sql }),
  })

  const result = await response.json()

  if (!response.ok) {
    return { success: false, error: result.message || result.error || 'Unknown error' }
  }

  return { success: true, message: result.message || 'OK' }
}

async function applyMigration() {
  console.log('Applying email_feedback table migration...\n')

  // Step 1: Create the table
  console.log('1. Creating email_feedback table...')
  const createTableSql = `
    CREATE TABLE IF NOT EXISTS email_feedback (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tracking_id TEXT NOT NULL,
      recipient_email TEXT NOT NULL,
      recipient_name TEXT,
      email_type TEXT NOT NULL,
      rating TEXT NOT NULL CHECK (rating IN ('helpful', 'not_helpful')),
      feedback_text TEXT,
      ai_source TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(tracking_id, recipient_email)
    )
  `

  const createResult = await execSql(createTableSql)
  if (!createResult.success) {
    console.log('   Error:', createResult.error)
    return
  }
  console.log('   ✅ Table created')

  // Step 2: Create indexes
  console.log('2. Creating indexes...')
  const indexSql = `
    CREATE INDEX IF NOT EXISTS idx_email_feedback_email_type ON email_feedback(email_type);
    CREATE INDEX IF NOT EXISTS idx_email_feedback_rating ON email_feedback(rating);
    CREATE INDEX IF NOT EXISTS idx_email_feedback_created_at ON email_feedback(created_at)
  `

  const indexResult = await execSql(indexSql)
  if (!indexResult.success) {
    console.log('   Error:', indexResult.error)
  } else {
    console.log('   ✅ Indexes created')
  }

  // Step 3: Enable RLS
  console.log('3. Enabling RLS...')
  const rlsSql = `ALTER TABLE email_feedback ENABLE ROW LEVEL SECURITY`
  const rlsResult = await execSql(rlsSql)
  if (!rlsResult.success) {
    console.log('   Warning:', rlsResult.error)
  } else {
    console.log('   ✅ RLS enabled')
  }

  // Step 4: Create policy
  console.log('4. Creating RLS policy...')
  const policySql = `
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'email_feedback' AND policyname = 'Service role full access') THEN
        CREATE POLICY "Service role full access" ON email_feedback FOR ALL USING (true) WITH CHECK (true);
      END IF;
    END
    $$
  `
  const policyResult = await execSql(policySql)
  if (!policyResult.success) {
    console.log('   Warning:', policyResult.error)
  } else {
    console.log('   ✅ RLS policy created')
  }

  console.log('\n✅ email_feedback migration complete!')
}

applyMigration()
