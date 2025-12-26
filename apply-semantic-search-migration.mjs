#!/usr/bin/env node

/**
 * Apply Semantic Search Migration
 *
 * Creates the match_documents and match_conversation_embeddings RPC functions
 * required for ChaSen AI semantic search and workflows.
 */

import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

dotenv.config({ path: '.env.local' })

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

async function executeSql(sql, description) {
  console.log(`\n📝 ${description}...`)

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql }),
    })

    if (response.status === 404) {
      // exec_sql doesn't exist, try alternative approach
      console.log('   exec_sql not available, using direct query...')
      return await executeViaPgRest(sql)
    }

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`HTTP ${response.status}: ${error}`)
    }

    const result = await response.json()
    console.log(`   ✓ Success`)
    return result
  } catch (error) {
    console.error(`   ❌ Failed: ${error.message}`)
    throw error
  }
}

async function executeViaPgRest(sql) {
  // For Supabase, we can't execute raw SQL via REST API
  // We need to use the Supabase Management API or run via psql
  console.log('   ⚠ Cannot execute raw SQL via REST API')
  console.log('   Please run the migration manually in Supabase SQL Editor')
  return null
}

async function checkFunctionExists(funcName) {
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${funcName}`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    })

    // 400 means function exists but wrong params
    // 404 means function doesn't exist
    return response.status !== 404
  } catch {
    return false
  }
}

async function main() {
  console.log('=' .repeat(60))
  console.log('SEMANTIC SEARCH MIGRATION')
  console.log('=' .repeat(60))

  // Check current state
  console.log('\n📋 Checking current state...')

  const matchDocsExists = await checkFunctionExists('match_documents')
  const matchConvExists = await checkFunctionExists('match_conversation_embeddings')

  console.log(`   match_documents: ${matchDocsExists ? '✓ exists' : '✗ missing'}`)
  console.log(`   match_conversation_embeddings: ${matchConvExists ? '✓ exists' : '✗ missing'}`)

  if (matchDocsExists && matchConvExists) {
    console.log('\n✓ All functions already exist!')
    console.log('  Run workflows should now work.')
    return
  }

  // Read migration file
  const migrationPath = path.join(__dirname, '..', 'docs', 'migrations', '20251224_add_semantic_search_functions.sql')
  const migrationSql = fs.readFileSync(migrationPath, 'utf-8')

  console.log('\n⚠ Migration Required')
  console.log('=' .repeat(60))
  console.log('')
  console.log('The following functions need to be created:')
  if (!matchDocsExists) console.log('  - match_documents')
  if (!matchConvExists) console.log('  - match_conversation_embeddings')
  console.log('')
  console.log('Please run the following SQL in Supabase SQL Editor:')
  console.log('')
  console.log('Migration file location:')
  console.log(`  ${migrationPath}`)
  console.log('')
  console.log('Quick steps:')
  console.log('1. Open Supabase Dashboard')
  console.log('2. Go to SQL Editor')
  console.log('3. Copy and paste the contents of the migration file')
  console.log('4. Click "Run"')
  console.log('')
  console.log('Or open the file directly:')
  console.log(`  open "${migrationPath}"`)
  console.log('')

  // Open the migration file
  const { exec } = await import('child_process')
  exec(`open "${migrationPath}"`, (err) => {
    if (err) {
      console.log('Could not auto-open file, please open manually.')
    }
  })
}

main().catch(console.error)
