#!/usr/bin/env node

/**
 * Apply SQL migration via Supabase Management API
 * Uses the SUPABASE_ACCESS_TOKEN for DDL operations
 */

import dotenv from 'dotenv'
import { readFileSync } from 'fs'

dotenv.config({ path: '.env.local' })

const PROJECT_REF = 'usoyxsunetvxdjdglkmn'
const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN

if (!SUPABASE_ACCESS_TOKEN) {
  console.error('Missing SUPABASE_ACCESS_TOKEN in .env.local')
  process.exit(1)
}

const migrationFile = process.argv[2]
if (!migrationFile) {
  console.error('Usage: node scripts/apply-migration-api.mjs <migration-file.sql>')
  process.exit(1)
}

async function applyMigration() {
  console.log(`Reading migration file: ${migrationFile}`)
  const sql = readFileSync(migrationFile, 'utf8')

  console.log(`Applying migration to project ${PROJECT_REF}...`)
  console.log(`SQL length: ${sql.length} characters`)

  try {
    const response = await fetch(
      `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: sql })
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`API Error (${response.status}): ${errorText}`)
      return false
    }

    const result = await response.json()
    console.log('Migration applied successfully!')
    console.log('Result:', JSON.stringify(result, null, 2).substring(0, 500))
    return true
  } catch (err) {
    console.error('Error applying migration:', err.message)
    return false
  }
}

async function main() {
  const success = await applyMigration()
  process.exit(success ? 0 : 1)
}

main()
