#!/usr/bin/env node
/**
 * Apply enhanced BURC tables migration
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function applyMigration() {
  console.log('🔄 Applying Enhanced BURC Tables Migration...\n')

  // Read migration file
  const migrationPath = path.join(__dirname, '..', 'docs', 'migrations', '20260103_enhanced_burc_tables.sql')
  const sql = fs.readFileSync(migrationPath, 'utf-8')

  // Split into individual statements
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'))

  console.log(`📝 Found ${statements.length} SQL statements\n`)

  let success = 0
  let failed = 0

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i]
    const preview = stmt.substring(0, 60).replace(/\n/g, ' ') + '...'

    try {
      const { error } = await supabase.rpc('exec_sql', { sql: stmt })

      if (error) {
        // Try alternative approach for CREATE TABLE
        if (stmt.toLowerCase().includes('create table')) {
          const tableName = stmt.match(/create table (?:if not exists )?(\w+)/i)?.[1]
          console.log(`   [${i+1}] Creating ${tableName}...`)

          // Execute via REST API
          const { error: err2 } = await supabase.from(tableName).select('*').limit(0)
          if (err2?.message?.includes('does not exist')) {
            // Table doesn't exist, which is expected
            console.log(`   ⚠️ Table ${tableName} needs manual creation`)
            failed++
          } else {
            console.log(`   ✅ Table ${tableName} already exists`)
            success++
          }
        } else {
          throw error
        }
      } else {
        console.log(`   [${i+1}] ✅ ${preview}`)
        success++
      }
    } catch (err) {
      console.log(`   [${i+1}] ⚠️ ${preview}`)
      console.log(`        Error: ${err.message?.substring(0, 80)}`)
      failed++
    }
  }

  console.log(`\n${'='.repeat(50)}`)
  console.log(`✅ Success: ${success}`)
  console.log(`⚠️ Failed/Manual: ${failed}`)
  console.log(`${'='.repeat(50)}`)

  // Verify tables exist
  console.log('\n📋 Verifying tables...')

  const tables = [
    'burc_monthly_metrics',
    'burc_quarterly_data',
    'burc_pipeline_detail',
    'burc_waterfall',
    'burc_product_revenue'
  ]

  for (const table of tables) {
    const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true })

    if (error) {
      console.log(`   ❌ ${table}: ${error.message}`)
    } else {
      console.log(`   ✅ ${table}: exists (${count || 0} rows)`)
    }
  }
}

applyMigration().catch(console.error)
