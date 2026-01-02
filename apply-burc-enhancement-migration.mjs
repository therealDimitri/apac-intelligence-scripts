#!/usr/bin/env node
/**
 * Apply BURC Comprehensive Enhancement Migration
 * Creates new tables for full BURC data integration
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function applyMigration() {
  console.log('🚀 Applying BURC Comprehensive Enhancement Migration...\n')

  // Read the migration SQL
  const migrationPath = path.join(__dirname, '..', 'docs', 'migrations', '20260102_burc_comprehensive_enhancement.sql')
  const sql = fs.readFileSync(migrationPath, 'utf-8')

  // Split into individual statements (excluding comments and empty lines)
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'))

  console.log(`📋 Found ${statements.length} SQL statements to execute\n`)

  let successCount = 0
  let errorCount = 0

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i]

    // Skip pure comment blocks
    if (stmt.split('\n').every(line => line.trim().startsWith('--') || line.trim() === '')) {
      continue
    }

    // Extract table/view name for logging
    const match = stmt.match(/(?:CREATE\s+(?:TABLE|VIEW|INDEX|POLICY)|ALTER\s+TABLE|GRANT)\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:ON\s+)?["']?(\w+)["']?/i)
    const objectName = match ? match[1] : `Statement ${i + 1}`

    try {
      const { error } = await supabase.rpc('exec_sql', { sql_query: stmt + ';' })

      if (error) {
        // Try alternative approach - some statements may work directly
        console.log(`⚠️  ${objectName}: ${error.message.substring(0, 50)}...`)
        errorCount++
      } else {
        console.log(`✅ ${objectName}`)
        successCount++
      }
    } catch (err) {
      console.log(`⚠️  ${objectName}: ${err.message.substring(0, 50)}...`)
      errorCount++
    }
  }

  console.log(`\n📊 Migration Summary:`)
  console.log(`   ✅ Successful: ${successCount}`)
  console.log(`   ⚠️  Skipped/Errors: ${errorCount}`)

  if (errorCount > 0) {
    console.log(`\n💡 Note: Some statements may have failed due to:`)
    console.log(`   - Objects already existing (safe to ignore)`)
    console.log(`   - exec_sql RPC not available (run SQL directly in Supabase)`)
    console.log(`\n📋 To apply manually, run the SQL in Supabase SQL Editor:`)
    console.log(`   ${migrationPath}`)
  }

  // Verify tables were created
  console.log('\n🔍 Verifying table creation...')
  const tables = [
    'burc_historical_revenue',
    'burc_monthly_revenue_detail',
    'burc_contracts',
    'burc_attrition_risk',
    'burc_business_cases',
    'burc_cross_charges',
    'burc_fx_rates',
    'burc_arr_tracking',
    'burc_sync_audit'
  ]

  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('count').limit(1)
    if (error) {
      console.log(`   ❌ ${table}: Not found or not accessible`)
    } else {
      console.log(`   ✅ ${table}: Ready`)
    }
  }

  console.log('\n✨ Migration process complete!')
}

applyMigration().catch(console.error)
