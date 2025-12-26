#!/usr/bin/env node
/**
 * Execute SQL via Supabase Management API
 * Uses the Supabase database endpoint to run SQL
 */

import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs'

// Load environment variables
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

// Extract project ref from URL
const projectRef = supabaseUrl?.replace('https://', '').replace('.supabase.co', '')

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

async function executeSqlStatement(sql, description) {
  console.log(`  🔄 ${description}...`)

  try {
    // Use Supabase's SQL API endpoint
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        query: sql
      })
    })

    if (!response.ok && response.status !== 204) {
      const text = await response.text()
      throw new Error(`HTTP ${response.status}: ${text}`)
    }

    console.log(`  ✅ ${description}`)
    return true
  } catch (error) {
    console.log(`  ⚠️  ${description}: ${error.message}`)
    return false
  }
}

async function main() {
  console.log('📊 Aged Accounts Enhancements - Supabase SQL Execution')
  console.log('=======================================================')
  console.log('')
  console.log(`Project: ${projectRef}`)
  console.log('')

  // Read the SQL file
  const sqlPath = join(__dirname, '..', 'docs', 'migrations', '20251220_aged_accounts_enhancements.sql')
  const fullSql = fs.readFileSync(sqlPath, 'utf8')

  console.log('📋 Migration SQL file loaded')
  console.log('')

  // Split SQL into individual statements (more carefully)
  // We'll split on semicolons but be careful about function bodies
  const statements = []
  let current = ''
  let inFunction = false
  let dollarQuote = null

  const lines = fullSql.split('\n')

  for (const line of lines) {
    // Skip empty lines and comments at start
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('--')) {
      if (current.trim()) {
        current += '\n' + line
      }
      continue
    }

    current += '\n' + line

    // Check for dollar-quoted strings (function bodies)
    if (trimmed.includes('$$')) {
      if (!dollarQuote) {
        dollarQuote = '$$'
        inFunction = true
      } else if (inFunction && trimmed.includes(dollarQuote)) {
        // Check if this closes the function
        const matches = (line.match(/\$\$/g) || []).length
        if (matches >= 2 || (matches === 1 && current.split('$$').length > 2)) {
          inFunction = false
          dollarQuote = null
        }
      }
    }

    // If we hit a semicolon outside of a function, end the statement
    if (!inFunction && trimmed.endsWith(';')) {
      if (current.trim()) {
        statements.push(current.trim())
        current = ''
      }
    }
  }

  // Add any remaining content
  if (current.trim()) {
    statements.push(current.trim())
  }

  console.log(`📝 Found ${statements.length} SQL statements to execute`)
  console.log('')

  // Filter out comment-only statements and DO blocks that just RAISE NOTICE
  const executableStatements = statements.filter(s => {
    const clean = s.replace(/--[^\n]*\n/g, '').trim()
    return clean && !clean.startsWith('--') && clean.length > 10
  })

  console.log(`📝 ${executableStatements.length} executable statements`)
  console.log('')
  console.log('='.repeat(60))
  console.log('')

  // Since direct execution through REST may not work, let's try the Supabase CLI approach
  // or output instructions for the user

  console.log('The migration SQL has been prepared. Due to Supabase security restrictions,')
  console.log('complex DDL (CREATE TABLE, CREATE FUNCTION) must be executed via SQL Editor.')
  console.log('')
  console.log('📋 Copy the SQL from:')
  console.log(`   ${sqlPath}`)
  console.log('')
  console.log('🔗 And run it in Supabase SQL Editor:')
  console.log(`   https://supabase.com/dashboard/project/${projectRef}/sql/new`)
  console.log('')
  console.log('='.repeat(60))
  console.log('')

  // Output a simplified check that can verify if tables exist
  console.log('After running the SQL, use this script to verify:')
  console.log('   node scripts/apply-aged-accounts-enhancements.mjs')
}

main().catch(console.error)
