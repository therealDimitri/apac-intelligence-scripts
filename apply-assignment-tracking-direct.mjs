#!/usr/bin/env node
/**
 * Apply assignment tracking columns migration directly via Supabase RPC
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

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  db: { schema: 'public' }
})

async function applyMigration() {
  console.log('🔄 Applying assignment tracking columns...\n')

  // Test if columns exist by inserting a test record with the new fields
  const testId = `TEST-${Date.now()}`

  // Try to insert with new columns
  const { error: insertError } = await supabase
    .from('actions')
    .insert({
      Action_ID: testId,
      Action_Description: 'Test action - will delete',
      Owners: 'Test',
      Due_Date: '2025-12-31',
      Status: 'To Do',
      Priority: 'Low',
      Content_Topic: 'Test',
      Meeting_Date: '2025-12-15',
      Topic_Number: 999,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      Notes: 'Test',
      Is_Shared: false,
      client: 'Test Client',
      Category: 'Test',
      // New columns
      assigned_at: new Date().toISOString(),
      assigned_by: 'Test User',
      assigned_by_email: 'test@example.com',
      source: 'priority_matrix'
    })

  if (insertError) {
    if (insertError.message.includes('column') && insertError.message.includes('does not exist')) {
      console.log('❌ New columns do not exist yet')
      console.log('   Error:', insertError.message)
      console.log('\n📋 Please run this SQL in Supabase SQL Editor:')
      console.log(`
ALTER TABLE actions ADD COLUMN IF NOT EXISTS assigned_at timestamptz;
ALTER TABLE actions ADD COLUMN IF NOT EXISTS assigned_by text;
ALTER TABLE actions ADD COLUMN IF NOT EXISTS assigned_by_email text;
ALTER TABLE actions ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual';
CREATE INDEX IF NOT EXISTS idx_actions_assigned_at ON actions(assigned_at);
CREATE INDEX IF NOT EXISTS idx_actions_source ON actions(source);
      `)
      return false
    }
    console.log('❌ Insert error:', insertError.message)
    return false
  }

  // Delete the test record
  await supabase.from('actions').delete().eq('Action_ID', testId)
  console.log('✅ Columns exist and working!')
  return true
}

applyMigration()
  .then(success => {
    if (success) {
      console.log('\n✅ Migration verified - columns are ready')
    } else {
      console.log('\n⚠️  Migration needs to be applied manually')
    }
  })
  .catch(err => console.error('Error:', err))
