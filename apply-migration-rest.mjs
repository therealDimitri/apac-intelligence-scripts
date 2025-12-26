#!/usr/bin/env node
/**
 * Apply migration via Supabase REST API
 */

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

const sql = `
-- Add assignment tracking columns
ALTER TABLE actions ADD COLUMN IF NOT EXISTS assigned_at timestamptz;
ALTER TABLE actions ADD COLUMN IF NOT EXISTS assigned_by text;
ALTER TABLE actions ADD COLUMN IF NOT EXISTS assigned_by_email text;
ALTER TABLE actions ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual';
`

async function applyMigration() {
  console.log('🔄 Applying assignment tracking migration via REST API...\n')

  try {
    // Use the Supabase SQL execution endpoint
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify({ sql_query: sql })
    })

    if (!response.ok) {
      const text = await response.text()
      console.log('exec_sql not available, trying alternative...')

      // Alternative: Try using pg directly
      // For now, let's just create the columns without IF NOT EXISTS
      // by using individual API calls

      // First, let's check what columns exist
      const schemaResponse = await fetch(`${supabaseUrl}/rest/v1/actions?select=*&limit=0`, {
        headers: {
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Prefer': 'return=representation'
        }
      })

      if (schemaResponse.ok) {
        console.log('✅ Connected to Supabase')
        console.log('\n⚠️  Cannot run ALTER TABLE via REST API.')
        console.log('   Please run this SQL in Supabase Dashboard SQL Editor:\n')
        console.log(sql)
        console.log('\n   URL: https://supabase.com/dashboard/project/usoyxsunetvxdjdglkmn/sql/new')
      }
      return
    }

    console.log('✅ Migration applied successfully!')
  } catch (error) {
    console.error('Error:', error.message)
    console.log('\n⚠️  Please run this SQL manually in Supabase SQL Editor:')
    console.log(sql)
  }
}

applyMigration()
