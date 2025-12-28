#!/usr/bin/env node
/**
 * Apply Financial Analytics Migration
 *
 * Creates 15 new tables for enhanced financial analytics
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

// Split SQL into statements properly handling multi-line CREATE TABLE
function splitStatements(sql) {
  const statements = []
  let current = ''
  let parenDepth = 0

  // Remove comments
  const lines = sql.split('\n')
  const cleanLines = lines.filter(line => {
    const trimmed = line.trim()
    return !trimmed.startsWith('--') && trimmed.length > 0
  })
  const cleanSql = cleanLines.join('\n')

  for (let i = 0; i < cleanSql.length; i++) {
    const char = cleanSql[i]
    current += char

    if (char === '(') parenDepth++
    if (char === ')') parenDepth--

    if (char === ';' && parenDepth === 0) {
      const stmt = current.trim()
      if (stmt.length > 1) {
        statements.push(stmt.slice(0, -1)) // Remove trailing semicolon
      }
      current = ''
    }
  }

  if (current.trim().length > 0) {
    statements.push(current.trim())
  }

  return statements
}

async function applyMigration() {
  console.log('🚀 Applying Financial Analytics Migration...\n')

  // Read the SQL file
  const sqlPath = join(__dirname, '..', 'docs', 'migrations', '20251229_enhanced_financial_analytics.sql')
  const sql = readFileSync(sqlPath, 'utf8')

  // Split into individual statements properly
  const statements = splitStatements(sql)

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
        // Check if it's a "does not exist" error for exec_sql
        if (error.message?.includes('function') || error.message?.includes('does not exist')) {
          console.log(`⚠️  ${i + 1}. ${firstLine}... (RPC not available, skipping)`)
          errors.push({ statement: firstLine, error: 'RPC not available' })
          errorCount++
          continue
        }
        throw error
      }

      console.log(`✅ ${i + 1}. ${firstLine}...`)
      successCount++
    } catch (err) {
      // Already exists is OK
      if (err.message?.includes('already exists')) {
        console.log(`⏭️  ${i + 1}. ${firstLine}... (already exists)`)
        successCount++
      } else {
        console.log(`❌ ${i + 1}. ${firstLine}...`)
        console.log(`   Error: ${err.message}`)
        errors.push({ statement: firstLine, error: err.message })
        errorCount++
      }
    }
  }

  console.log(`\n📊 Migration Summary:`)
  console.log(`   ✅ Success: ${successCount}`)
  console.log(`   ❌ Errors: ${errorCount}`)

  if (errorCount > 0) {
    console.log('\n⚠️  Some statements failed. You may need to apply them manually via Supabase SQL Editor.')
    console.log('📂 Migration file: docs/migrations/20251229_enhanced_financial_analytics.sql')
  } else {
    console.log('\n✨ Migration completed successfully!')
  }
}

applyMigration().catch(console.error)
