#!/usr/bin/env node
/**
 * Add is_pinned column to chasen_conversations table
 *
 * This column allows users to pin important conversations to the top of their list.
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function main() {
  console.log('🔧 Adding is_pinned column to chasen_conversations table...\n')

  // Check if column already exists by trying to query it
  const { error: checkError } = await supabase
    .from('chasen_conversations')
    .select('is_pinned')
    .limit(1)

  if (!checkError) {
    console.log('✅ Column is_pinned already exists!')
    return
  }

  if (!checkError.message.includes('is_pinned')) {
    console.error('❌ Unexpected error:', checkError)
    return
  }

  console.log('📝 Column does not exist, adding it now...')

  // Use REST API to execute raw SQL via the Supabase management API
  // Since we can't use RPC for DDL, we'll use the pg connection

  // Try using the REST API with a workaround
  const sql = `
    ALTER TABLE chasen_conversations
    ADD COLUMN IF NOT EXISTS is_pinned boolean DEFAULT false;
  `

  console.log('\n📋 Please run the following SQL in Supabase SQL Editor:')
  console.log('─'.repeat(60))
  console.log(sql)
  console.log('─'.repeat(60))
  console.log('\n🔗 Open Supabase SQL Editor: https://supabase.com/dashboard/project/usoyxsunetvxdjdglkmn/sql/new')

  // Try direct connection if available
  const DATABASE_URL = process.env.DATABASE_URL
  if (DATABASE_URL) {
    console.log('\n🔄 Attempting direct connection...')
    try {
      const { default: pg } = await import('pg')
      const client = new pg.Client({ connectionString: DATABASE_URL })
      await client.connect()
      await client.query(sql)
      await client.end()
      console.log('✅ Column added successfully via direct connection!')

      // Verify
      const { error: verifyError } = await supabase
        .from('chasen_conversations')
        .select('is_pinned')
        .limit(1)

      if (!verifyError) {
        console.log('✅ Verified: is_pinned column is now accessible!')
      }
    } catch (pgError) {
      console.log('⚠️  Direct connection failed:', pgError.message)
      console.log('\n📋 Please run the SQL manually in Supabase SQL Editor')
    }
  }
}

main().catch(console.error)
