#!/usr/bin/env node

/**
 * Create notifications table for @mention notifications
 * This script creates the notifications table using Supabase REST API
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

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

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_email ON notifications(user_email);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

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
  console.log('Creating notifications table in Supabase...')
  console.log('Supabase URL:', supabaseUrl)

  // First check if table exists
  const { data: checkData, error: checkError } = await supabase
    .from('notifications')
    .select('id')
    .limit(1)

  if (!checkError) {
    console.log('✅ Notifications table already exists!')
    return true
  }

  if (checkError.code !== 'PGRST205') {
    console.log('Unexpected error checking table:', checkError)
  }

  console.log('Table does not exist, need to create it.')
  console.log('\n' + '='.repeat(60))
  console.log('Please run the following SQL in Supabase SQL Editor:')
  console.log('='.repeat(60) + '\n')
  console.log(createTableSQL)
  console.log('\n' + '='.repeat(60))
  console.log('\nSteps:')
  console.log('1. Go to your Supabase dashboard')
  console.log('2. Navigate to SQL Editor')
  console.log('3. Paste the SQL above')
  console.log('4. Click "Run"')
  console.log('='.repeat(60))

  return false
}

async function main() {
  console.log('='.repeat(60))
  console.log('Notifications Table Setup')
  console.log('='.repeat(60) + '\n')

  const success = await createNotificationsTable()

  if (success) {
    console.log('\n✅ Notifications table is ready!')
  } else {
    console.log('\n⚠️ Manual intervention required - please run the SQL in Supabase.')
  }
}

main().catch(console.error)
