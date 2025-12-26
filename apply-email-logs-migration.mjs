#!/usr/bin/env node

/**
 * Apply email_logs table migration
 * Run: node scripts/apply-email-logs-migration.mjs
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
})

const createTableSQL = `
CREATE TABLE IF NOT EXISTS email_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email_type VARCHAR(50) NOT NULL,
    recipient_name VARCHAR(255) NOT NULL,
    recipient_email VARCHAR(255) NOT NULL,
    subject VARCHAR(500),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    error_message TEXT,
    external_email_id VARCHAR(255),
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_email_logs_email_type ON email_logs(email_type);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs(status);
CREATE INDEX IF NOT EXISTS idx_email_logs_created_at ON email_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_logs_type_date ON email_logs(email_type, created_at DESC);

ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all select on email_logs" ON email_logs;
CREATE POLICY "Allow all select on email_logs" ON email_logs FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow all insert on email_logs" ON email_logs;
CREATE POLICY "Allow all insert on email_logs" ON email_logs FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all update on email_logs" ON email_logs;
CREATE POLICY "Allow all update on email_logs" ON email_logs FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all delete on email_logs" ON email_logs;
CREATE POLICY "Allow all delete on email_logs" ON email_logs FOR DELETE USING (true);
`

async function applyMigration() {
  console.log('Applying email_logs table migration...\n')

  // Check if table already exists
  const { error: checkError } = await supabase
    .from('email_logs')
    .select('id')
    .limit(1)

  if (!checkError) {
    console.log('email_logs table already exists!')

    // Show recent logs
    const { data: logs } = await supabase
      .from('email_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5)

    if (logs?.length > 0) {
      console.log('\nRecent email logs:')
      logs.forEach(log => {
        console.log(`  - ${log.email_type} to ${log.recipient_name} (${log.status}) at ${log.created_at}`)
      })
    } else {
      console.log('\nNo email logs yet.')
    }
    return true
  }

  if (checkError.code !== '42P01') {
    console.log('Unexpected error:', checkError)
  }

  // Try to create via exec_sql RPC
  console.log('Attempting to create table via exec_sql RPC...')
  const { error: rpcError } = await supabase.rpc('exec_sql', { query: createTableSQL })

  if (rpcError) {
    console.log('RPC not available:', rpcError.message)
    console.log('\nPlease run the following SQL in Supabase Dashboard SQL Editor:\n')
    console.log('='.repeat(60))
    console.log(createTableSQL)
    console.log('='.repeat(60))
    console.log(`\nURL: https://supabase.com/dashboard/project/usoyxsunetvxdjdglkmn/sql/new`)

    // Try opening browser
    try {
      const { exec } = await import('child_process')
      exec('open "https://supabase.com/dashboard/project/usoyxsunetvxdjdglkmn/sql/new"')
      console.log('\nOpening Supabase SQL Editor in browser...')
    } catch {
      // Ignore
    }
    return false
  }

  // Verify table was created
  const { error: verifyError } = await supabase.from('email_logs').select('id').limit(1)

  if (verifyError) {
    console.log('Table verification failed:', verifyError.message)
    return false
  }

  console.log('email_logs table created successfully!')
  return true
}

applyMigration()
  .then(success => {
    if (success) {
      console.log('\nMigration complete!')
    }
    process.exit(success ? 0 : 1)
  })
  .catch(err => {
    console.error('Error:', err)
    process.exit(1)
  })
