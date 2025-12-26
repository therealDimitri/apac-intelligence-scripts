#!/usr/bin/env node
/**
 * Execute Aged Accounts Migration v2
 * Tries multiple connection methods
 */

import pg from 'pg'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs'

const { Client } = pg

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env.local') })

// Connection strings to try
const connectionStrings = [
  // Try DATABASE_URL first
  {
    name: 'DATABASE_URL (Pooler)',
    url: process.env.DATABASE_URL
  },
  // Try DATABASE_URL_DIRECT
  {
    name: 'DATABASE_URL_DIRECT',
    url: process.env.DATABASE_URL_DIRECT
  },
  // Try session mode pooler (port 5432)
  {
    name: 'Session Mode Pooler',
    url: process.env.DATABASE_URL?.replace(':6543/', ':5432/')
  },
  // Try with the database password from DIRECT URL
  {
    name: 'Pooler with DB Password',
    url: `postgresql://postgres.usoyxsunetvxdjdglkmn:NkrK6QiN4wwOB5xs@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`
  }
]

// Read migration SQL
const migrationPath = join(__dirname, '../docs/migrations/20251220_aged_accounts_enhancements.sql')

async function tryConnection(config) {
  console.log(`\n🔌 Trying: ${config.name}`)

  if (!config.url) {
    console.log('   ⚠️  URL not defined, skipping')
    return null
  }

  const client = new Client({
    connectionString: config.url,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000
  })

  try {
    await client.connect()
    console.log('   ✅ Connected!')
    return client
  } catch (error) {
    console.log(`   ❌ Failed: ${error.message}`)
    return null
  }
}

async function runMigration() {
  console.log('📊 Aged Accounts Enhancements Migration v2')
  console.log('==========================================')

  // Try each connection
  let client = null

  for (const config of connectionStrings) {
    client = await tryConnection(config)
    if (client) break
  }

  if (!client) {
    console.log('\n❌ All connection attempts failed.')
    console.log('\n📋 Please run the migration SQL manually in Supabase SQL Editor:')
    console.log('   File: docs/migrations/20251220_aged_accounts_enhancements.sql')
    console.log('   URL: https://supabase.com/dashboard/project/usoyxsunetvxdjdglkmn/sql/new')
    process.exit(1)
  }

  try {
    // Read and execute migration
    console.log('\n📋 Reading migration SQL...')
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8')

    console.log('🔄 Executing migration...')
    await client.query(migrationSQL)
    console.log('✅ Migration executed successfully!')

    // Verify tables
    console.log('\n🔍 Verifying tables...')
    const tables = [
      'aged_accounts_history',
      'webhook_subscriptions',
      'aging_alert_config',
      'aging_alerts_log',
      'cse_assignment_suggestions'
    ]

    for (const table of tables) {
      try {
        const result = await client.query(`SELECT COUNT(*) FROM ${table}`)
        console.log(`   ✅ ${table} - ${result.rows[0].count} rows`)
      } catch (err) {
        console.log(`   ❌ ${table} - ${err.message}`)
      }
    }

    // Verify functions
    console.log('\n🔍 Verifying functions...')
    const functions = ['capture_aged_accounts_snapshot', 'check_aging_threshold_breaches']

    for (const fn of functions) {
      const result = await client.query(
        `SELECT proname FROM pg_proc WHERE proname = $1`,
        [fn]
      )
      if (result.rows.length > 0) {
        console.log(`   ✅ ${fn}()`)
      } else {
        console.log(`   ❌ ${fn}() - not found`)
      }
    }

    // Capture initial snapshot
    console.log('\n📸 Capturing initial snapshot...')
    try {
      const result = await client.query('SELECT capture_aged_accounts_snapshot()')
      console.log(`   ✅ Captured ${result.rows[0].capture_aged_accounts_snapshot} records`)
    } catch (err) {
      console.log(`   ⚠️  Snapshot failed: ${err.message}`)
    }

    // Check alert configs
    console.log('\n🔍 Alert configurations:')
    const configs = await client.query('SELECT name, severity FROM aging_alert_config')
    for (const config of configs.rows) {
      console.log(`   ✅ ${config.name} (${config.severity})`)
    }

    console.log('\n🎉 Migration complete!')

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message)
    if (error.message.includes('already exists')) {
      console.log('\n✅ Objects already exist - migration may have run before')
    }
    process.exit(1)
  } finally {
    await client.end()
  }
}

runMigration()
