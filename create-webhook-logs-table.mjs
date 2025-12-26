#!/usr/bin/env node

/**
 * Direct Migration: Create Webhook Logs Table
 *
 * Creates the webhook_logs table for tracking webhook delivery history.
 * Run: node scripts/create-webhook-logs-table.mjs
 */

import pg from 'pg'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const { Pool } = pg

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env.local') })

// Use direct connection URL for DDL operations (pooler doesn't support all session-level features)
const connectionString = process.env.DATABASE_URL_DIRECT ||
  'postgresql://postgres:***REMOVED***@db.usoyxsunetvxdjdglkmn.supabase.co:5432/postgres'

if (!connectionString) {
  console.error('❌ Missing DATABASE_URL_DIRECT environment variable')
  process.exit(1)
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
})

const createTableSQL = `
-- Webhook delivery logs table
CREATE TABLE IF NOT EXISTS webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Subscription reference
  subscription_id UUID REFERENCES webhook_subscriptions(id) ON DELETE SET NULL,
  subscription_name TEXT,

  -- Event details
  event TEXT NOT NULL,
  payload JSONB NOT NULL,

  -- Delivery tracking
  url TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'success', 'failed', 'retrying')),
  status_code INTEGER,
  response_body TEXT,
  error_message TEXT,

  -- Retry tracking
  attempt_number INTEGER DEFAULT 1,
  max_attempts INTEGER DEFAULT 3,
  next_retry_at TIMESTAMPTZ,

  -- Timing
  sent_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  duration_ms INTEGER,

  -- Source tracking
  source TEXT,
  triggered_by TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_webhook_logs_subscription ON webhook_logs(subscription_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_event ON webhook_logs(event);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_status ON webhook_logs(status);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created ON webhook_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_pending_retry ON webhook_logs(next_retry_at)
  WHERE status IN ('pending', 'retrying');

-- Enable RLS
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
DROP POLICY IF EXISTS "Allow all select on webhook_logs" ON webhook_logs;
CREATE POLICY "Allow all select on webhook_logs" ON webhook_logs FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow all insert on webhook_logs" ON webhook_logs;
CREATE POLICY "Allow all insert on webhook_logs" ON webhook_logs FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all update on webhook_logs" ON webhook_logs;
CREATE POLICY "Allow all update on webhook_logs" ON webhook_logs FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all delete on webhook_logs" ON webhook_logs;
CREATE POLICY "Allow all delete on webhook_logs" ON webhook_logs FOR DELETE USING (true);
`

async function createTable() {
  console.log('🚀 Creating webhook_logs table via direct PostgreSQL connection...\n')

  const client = await pool.connect()

  try {
    // Check if table exists
    const checkResult = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'webhook_logs'
      );
    `)

    if (checkResult.rows[0].exists) {
      console.log('✅ webhook_logs table already exists!')
      return true
    }

    // Create the table
    console.log('Creating table...')
    await client.query(createTableSQL)

    // Verify
    const verifyResult = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'webhook_logs'
      );
    `)

    if (verifyResult.rows[0].exists) {
      console.log('✅ webhook_logs table created successfully!')
      return true
    } else {
      console.log('❌ Table creation failed - table not found after creation')
      return false
    }
  } catch (error) {
    console.error('❌ Error:', error.message)
    return false
  } finally {
    client.release()
  }
}

createTable()
  .then(success => {
    if (success) {
      console.log('\n🎉 Migration complete!')
    }
    pool.end()
    process.exit(success ? 0 : 1)
  })
  .catch(err => {
    console.error('❌ Error:', err)
    pool.end()
    process.exit(1)
  })
