#!/usr/bin/env node

/**
 * Create notifications table directly via Postgres connection
 * Uses the pg package to execute DDL statements
 */

import pg from 'pg'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '../.env.local') })

const { Client } = pg

// Use pooler connection (DATABASE_URL) - direct connection may have DNS issues
const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  console.error('Missing DATABASE_URL or DATABASE_URL_DIRECT in environment')
  process.exit(1)
}

const createTableSQL = `
-- Create notifications table for @mentions and other notifications
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
-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_email ON notifications(user_email);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
`

const enableRLSSQL = `
-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
`

const createPoliciesSQL = `
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own notifications" ON notifications;
DROP POLICY IF EXISTS "Service can insert notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can delete their own notifications" ON notifications;

-- Create RLS policies
-- Allow all users to read notifications (filtering happens in query)
CREATE POLICY "Users can view their own notifications"
  ON notifications FOR SELECT
  USING (true);

-- Allow service role to insert notifications
CREATE POLICY "Service can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);

-- Allow users to update notifications
CREATE POLICY "Users can update their own notifications"
  ON notifications FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Allow users to delete notifications
CREATE POLICY "Users can delete their own notifications"
  ON notifications FOR DELETE
  USING (true);
`

async function createNotificationsTable() {
  console.log('=' .repeat(60))
  console.log('Creating Notifications Table via Direct Postgres Connection')
  console.log('=' .repeat(60))
  console.log('')

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  })

  try {
    console.log('Connecting to Postgres...')
    await client.connect()
    console.log('Connected successfully!')
    console.log('')

    // Check if table already exists
    const checkResult = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'notifications'
      );
    `)

    if (checkResult.rows[0].exists) {
      console.log('Notifications table already exists!')
      console.log('Verifying structure...')

      const columnsResult = await client.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'notifications'
        ORDER BY ordinal_position;
      `)

      console.log('Table columns:')
      columnsResult.rows.forEach(row => {
        console.log(`  - ${row.column_name}: ${row.data_type}`)
      })

      return true
    }

    // Create table
    console.log('Creating notifications table...')
    await client.query(createTableSQL)
    console.log('Table created!')

    // Create indexes
    console.log('Creating indexes...')
    await client.query(createIndexesSQL)
    console.log('Indexes created!')

    // Enable RLS
    console.log('Enabling Row Level Security...')
    await client.query(enableRLSSQL)
    console.log('RLS enabled!')

    // Create policies
    console.log('Creating RLS policies...')
    await client.query(createPoliciesSQL)
    console.log('Policies created!')

    console.log('')
    console.log('=' .repeat(60))
    console.log('Notifications table created successfully!')
    console.log('=' .repeat(60))

    return true
  } catch (error) {
    console.error('Error:', error.message)
    if (error.code) {
      console.error('Code:', error.code)
    }
    return false
  } finally {
    await client.end()
  }
}

createNotificationsTable()
  .then(success => {
    process.exit(success ? 0 : 1)
  })
  .catch(err => {
    console.error('Unexpected error:', err)
    process.exit(1)
  })
