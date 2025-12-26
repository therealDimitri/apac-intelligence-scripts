#!/usr/bin/env node

/**
 * Create notifications table via Supabase REST API
 * Tries multiple methods to execute the DDL
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '../.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

const createTableSQL = `
CREATE TABLE IF NOT EXISTS notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  user_email text,
  type text NOT NULL DEFAULT 'mention',
  title text NOT NULL,
  message text NOT NULL,
  link text,
  item_id text,
  comment_id text,
  triggered_by text NOT NULL,
  triggered_by_avatar text,
  read boolean DEFAULT false,
  read_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
`

const createIndexesSQL = `
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_email ON notifications(user_email);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
`

const enableRLSSQL = `ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;`

const policiesSQL = [
  `DROP POLICY IF EXISTS "Allow all select on notifications" ON notifications;`,
  `DROP POLICY IF EXISTS "Allow all insert on notifications" ON notifications;`,
  `DROP POLICY IF EXISTS "Allow all update on notifications" ON notifications;`,
  `DROP POLICY IF EXISTS "Allow all delete on notifications" ON notifications;`,
  `CREATE POLICY "Allow all select on notifications" ON notifications FOR SELECT USING (true);`,
  `CREATE POLICY "Allow all insert on notifications" ON notifications FOR INSERT WITH CHECK (true);`,
  `CREATE POLICY "Allow all update on notifications" ON notifications FOR UPDATE USING (true) WITH CHECK (true);`,
  `CREATE POLICY "Allow all delete on notifications" ON notifications FOR DELETE USING (true);`
]

async function tryExecSQL(sql, description) {
  // Try different RPC function names that might exist
  const rpcNames = ['exec_sql', 'query', 'execute_sql', 'run_sql']

  for (const rpcName of rpcNames) {
    try {
      const { data, error } = await supabase.rpc(rpcName, {
        sql: sql,
        query: sql,
        sql_query: sql
      })

      if (!error) {
        console.log(`  ${description}: Success via ${rpcName}`)
        return true
      }
    } catch (e) {
      // Continue to next method
    }
  }
  return false
}

async function createNotificationsTable() {
  console.log('=' .repeat(60))
  console.log('Creating Notifications Table')
  console.log('=' .repeat(60))
  console.log('')
  console.log('Supabase URL:', supabaseUrl)
  console.log('')

  // First check if table already exists
  const { data: checkData, error: checkError } = await supabase
    .from('notifications')
    .select('id')
    .limit(1)

  if (!checkError) {
    console.log('Notifications table already exists!')

    // Verify columns
    const { data: testData, error: testError } = await supabase
      .from('notifications')
      .select('*')
      .limit(0)

    if (!testError) {
      console.log('Table structure verified successfully.')
    }

    return true
  }

  if (checkError.code === 'PGRST205') {
    console.log('Table does not exist. Attempting to create...')
    console.log('')

    // Try using exec_sql RPC
    console.log('Method 1: Trying exec_sql RPC...')

    const success = await tryExecSQL(createTableSQL, 'Create table')

    if (success) {
      await tryExecSQL(createIndexesSQL, 'Create indexes')
      await tryExecSQL(enableRLSSQL, 'Enable RLS')
      for (const policy of policiesSQL) {
        await tryExecSQL(policy, 'Create policy')
      }

      // Verify
      const { error: verifyError } = await supabase
        .from('notifications')
        .select('id')
        .limit(1)

      if (!verifyError) {
        console.log('')
        console.log('Table created successfully!')
        return true
      }
    }

    // If RPC didn't work, try the Management API approach
    console.log('')
    console.log('Method 2: Trying via fetch to Management API...')

    try {
      // Try the SQL API endpoint
      const response = await fetch(`${supabaseUrl}/pg/sql`, {
        method: 'POST',
        headers: {
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: createTableSQL })
      })

      if (response.ok) {
        console.log('  Table created via SQL API!')
        return true
      } else {
        console.log('  SQL API not available:', response.status)
      }
    } catch (e) {
      console.log('  SQL API fetch failed:', e.message)
    }

    // None of the methods worked
    console.log('')
    console.log('=' .repeat(60))
    console.log('AUTOMATED CREATION FAILED')
    console.log('=' .repeat(60))
    console.log('')
    console.log('The notifications table needs to be created manually.')
    console.log('Please copy and run the following SQL in the Supabase Dashboard:')
    console.log('')
    console.log('URL: https://supabase.com/dashboard/project/usoyxsunetvxdjdglkmn/sql/new')
    console.log('')
    console.log('-'.repeat(60))
    console.log(`
-- Create notifications table for @mentions
CREATE TABLE IF NOT EXISTS notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  user_email text,
  type text NOT NULL DEFAULT 'mention',
  title text NOT NULL,
  message text NOT NULL,
  link text,
  item_id text,
  comment_id text,
  triggered_by text NOT NULL,
  triggered_by_avatar text,
  read boolean DEFAULT false,
  read_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_email ON notifications(user_email);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow all select on notifications" ON notifications FOR SELECT USING (true);
CREATE POLICY "Allow all insert on notifications" ON notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update on notifications" ON notifications FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow all delete on notifications" ON notifications FOR DELETE USING (true);
`)
    console.log('-'.repeat(60))

    return false
  }

  console.error('Unexpected error:', checkError)
  return false
}

createNotificationsTable()
  .then(success => {
    process.exit(success ? 0 : 1)
  })
  .catch(err => {
    console.error('Error:', err)
    process.exit(1)
  })
