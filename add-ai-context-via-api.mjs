#!/usr/bin/env node
/**
 * Add AI Context columns via Supabase Management API
 */

import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

// Extract project ref from URL
const projectRef = supabaseUrl?.match(/https:\/\/([^.]+)\./)?.[1]

if (!projectRef || !serviceRoleKey) {
  console.error('❌ Missing required environment variables')
  process.exit(1)
}

async function addColumns() {
  console.log('🚀 Adding AI context columns via Supabase API...\n')
  console.log(`   Project: ${projectRef}\n`)

  const sql = `
    ALTER TABLE actions
    ADD COLUMN IF NOT EXISTS ai_context TEXT,
    ADD COLUMN IF NOT EXISTS ai_context_key_points JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS ai_context_urgency_indicators JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS ai_context_related_topics JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS ai_context_confidence INTEGER,
    ADD COLUMN IF NOT EXISTS ai_context_generated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ai_context_meeting_title TEXT;
  `

  // Try using the SQL endpoint
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/`, {
    method: 'POST',
    headers: {
      'apikey': serviceRoleKey,
      'Authorization': `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: sql
    })
  })

  if (!response.ok) {
    console.log('ℹ️  RPC endpoint not available, using alternative approach...\n')

    // Alternative: Try to verify if columns already exist by attempting to select them
    const checkResponse = await fetch(`${supabaseUrl}/rest/v1/actions?select=ai_context&limit=1`, {
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
      }
    })

    if (checkResponse.ok) {
      console.log('✅ Columns already exist! Migration not needed.')
      return
    }

    // Columns don't exist, need manual SQL execution
    console.log('⚠️  Columns need to be added manually.\n')
    console.log('📋 Please run this SQL in Supabase Dashboard → SQL Editor:\n')
    console.log('─'.repeat(60))
    console.log(sql)
    console.log('─'.repeat(60))
    console.log('\n🔗 Open: https://supabase.com/dashboard/project/' + projectRef + '/sql/new')

    // Open the dashboard
    const { exec } = await import('child_process')
    exec(`open "https://supabase.com/dashboard/project/${projectRef}/sql/new"`)

    return
  }

  console.log('✅ Columns added successfully!')
}

addColumns().catch(console.error)
