#!/usr/bin/env node
/**
 * Run SQL Migration Directly via PostgreSQL
 * Uses the pg library to connect directly to Supabase PostgreSQL
 */

import pg from 'pg'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { readFileSync } from 'fs'

const { Client } = pg

// Load environment variables
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const databaseUrl = process.env.DATABASE_URL_DIRECT

if (!databaseUrl) {
  console.error('❌ Missing DATABASE_URL_DIRECT in .env.local')
  process.exit(1)
}

async function runMigration() {
  console.log('🚀 Running Client Email Domain Mapping Migration via Direct PostgreSQL...\n')

  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  })

  try {
    console.log('📡 Connecting to database...')
    await client.connect()
    console.log('✅ Connected to Supabase PostgreSQL\n')

    // Read the migration SQL file
    const migrationPath = join(__dirname, '..', 'docs', 'migrations', '20260109_client_email_domains.sql')
    const sqlContent = readFileSync(migrationPath, 'utf-8')

    console.log('📦 Executing migration SQL...\n')

    // Execute the entire migration
    await client.query(sqlContent)

    console.log('✅ Migration SQL executed successfully\n')

    // Verify the table was created
    console.log('📋 Verifying migration...')
    const { rows: tableCheck } = await client.query(`
      SELECT COUNT(*) as count FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'client_email_domains'
    `)

    if (tableCheck[0].count === '1') {
      console.log('✅ Table client_email_domains created\n')
    } else {
      console.log('⚠️ Table client_email_domains not found\n')
    }

    // Check domain count
    const { rows: domainCount } = await client.query(`
      SELECT COUNT(*) as count FROM client_email_domains
    `)
    console.log(`📊 Total domains seeded: ${domainCount[0].count}\n`)

    // List all domains with their clients
    const { rows: domains } = await client.query(`
      SELECT
        ced.domain,
        ced.is_primary,
        c.canonical_name
      FROM client_email_domains ced
      JOIN clients c ON ced.client_id = c.id
      ORDER BY c.canonical_name, ced.is_primary DESC
    `)

    if (domains.length > 0) {
      console.log('📋 Configured domain mappings:\n')
      domains.forEach(d => {
        const primary = d.is_primary ? '(primary)' : ''
        console.log(`  ${d.domain} → ${d.canonical_name} ${primary}`)
      })
    }

    // Check functions exist
    const { rows: functions } = await client.query(`
      SELECT routine_name FROM information_schema.routines
      WHERE routine_schema = 'public'
      AND routine_name IN ('resolve_client_by_domain', 'resolve_client_by_email')
    `)

    console.log(`\n✅ RPC functions created: ${functions.map(f => f.routine_name).join(', ')}`)

    console.log('\n🎉 Migration completed successfully!')
    return true

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message)
    if (error.detail) console.error('   Detail:', error.detail)
    if (error.hint) console.error('   Hint:', error.hint)
    return false
  } finally {
    await client.end()
    console.log('\n📡 Database connection closed')
  }
}

// Run the migration
runMigration()
  .then(success => {
    process.exit(success ? 0 : 1)
  })
  .catch(err => {
    console.error('\n❌ Fatal error:', err)
    process.exit(1)
  })
