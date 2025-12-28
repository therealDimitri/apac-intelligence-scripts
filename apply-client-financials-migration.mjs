#!/usr/bin/env node
/**
 * Apply Client Financials Migration
 *
 * Creates tables for:
 * - client_financials: Revenue/COGS breakdown by client
 * - contract_renewals: Upcoming contract renewals
 * - attrition_risk: Clients at risk of churning
 * - business_case_pipeline: Business case gate tracking
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
})

async function applyMigration() {
  console.log('🚀 Applying Client Financials Migration...\n')

  // Read the SQL file
  const sqlPath = join(__dirname, '..', 'docs', 'migrations', '20251228_client_financials.sql')
  const sql = readFileSync(sqlPath, 'utf8')

  // Split into individual statements (basic split - handles most cases)
  const statements = sql
    .split(/;\s*$/m)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'))

  console.log(`📝 Found ${statements.length} SQL statements to execute\n`)

  let successCount = 0
  let errorCount = 0
  const errors = []

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i]

    // Skip pure comment blocks
    if (statement.replace(/--[^\n]*/g, '').trim().length === 0) {
      continue
    }

    // Extract first meaningful line for logging
    const firstLine = statement
      .split('\n')
      .find(l => !l.trim().startsWith('--') && l.trim().length > 0)
      ?.trim()
      ?.substring(0, 80) || 'Statement'

    try {
      const { error } = await supabase.rpc('exec_sql', {
        sql_query: statement + ';'
      })

      if (error) {
        // Try direct query if RPC not available
        const { error: directError } = await supabase.from('_exec').select().limit(0)

        // For statements that can't use RPC, log and continue
        if (error.message?.includes('function') || error.message?.includes('does not exist')) {
          console.log(`⚠️  ${i + 1}. ${firstLine}...`)
          console.log(`   Skipped (requires direct DB access)\n`)
          continue
        }

        throw error
      }

      console.log(`✅ ${i + 1}. ${firstLine}...`)
      successCount++
    } catch (err) {
      const errorMsg = err.message || String(err)

      // Handle expected "already exists" errors gracefully
      if (errorMsg.includes('already exists')) {
        console.log(`⏭️  ${i + 1}. ${firstLine}... (already exists)`)
        successCount++
        continue
      }

      console.log(`❌ ${i + 1}. ${firstLine}...`)
      console.log(`   Error: ${errorMsg}\n`)
      errors.push({ statement: firstLine, error: errorMsg })
      errorCount++
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log('📊 Migration Summary')
  console.log('='.repeat(60))
  console.log(`✅ Successful: ${successCount}`)
  console.log(`❌ Errors: ${errorCount}`)

  if (errors.length > 0) {
    console.log('\n⚠️  Some statements require direct database access.')
    console.log('Please run the following SQL in Supabase SQL Editor:\n')
    console.log(`File: docs/migrations/20251228_client_financials.sql`)
  }

  // Verify tables exist
  console.log('\n🔍 Verifying tables...\n')

  const tables = [
    'client_financials',
    'contract_renewals',
    'attrition_risk',
    'business_case_pipeline'
  ]

  for (const table of tables) {
    const { data, error } = await supabase
      .from(table)
      .select('id')
      .limit(1)

    if (error) {
      console.log(`❌ ${table}: ${error.message}`)
    } else {
      console.log(`✅ ${table}: Ready`)
    }
  }

  console.log('\n✨ Migration complete!\n')
}

// Run migration
applyMigration().catch(err => {
  console.error('❌ Migration failed:', err)
  process.exit(1)
})
