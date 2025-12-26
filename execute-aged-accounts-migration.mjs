#!/usr/bin/env node
/**
 * Execute Aged Accounts Enhancements Migration
 * Uses PostgreSQL client to execute the migration SQL directly
 */

import pg from 'pg'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs'

const { Pool } = pg

// Load environment variables
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  console.error('❌ Missing DATABASE_URL')
  process.exit(1)
}

async function main() {
  console.log('📊 Aged Accounts Enhancements - PostgreSQL Migration')
  console.log('====================================================')
  console.log('')

  // Create PostgreSQL pool
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  })

  try {
    // Test connection
    console.log('🔌 Connecting to database...')
    const client = await pool.connect()
    console.log('✅ Connected to PostgreSQL')
    console.log('')

    // Read the SQL file
    const sqlPath = join(__dirname, '..', 'docs', 'migrations', '20251220_aged_accounts_enhancements.sql')
    const fullSql = fs.readFileSync(sqlPath, 'utf8')

    console.log('📋 Executing migration SQL...')
    console.log('')

    // Execute the SQL
    await client.query(fullSql)

    console.log('✅ Migration SQL executed successfully!')
    console.log('')

    // Verify tables were created
    console.log('🔍 Verifying tables...')
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
        console.log(`   ✅ ${table} - exists (${result.rows[0].count} rows)`)
      } catch (err) {
        console.log(`   ❌ ${table} - ${err.message}`)
      }
    }

    console.log('')

    // Verify functions
    console.log('🔍 Verifying functions...')
    const functions = [
      'capture_aged_accounts_snapshot',
      'check_aging_threshold_breaches'
    ]

    for (const fn of functions) {
      try {
        const result = await client.query(
          `SELECT proname FROM pg_proc WHERE proname = $1`,
          [fn]
        )
        if (result.rows.length > 0) {
          console.log(`   ✅ ${fn}() - exists`)
        } else {
          console.log(`   ❌ ${fn}() - not found`)
        }
      } catch (err) {
        console.log(`   ❌ ${fn}() - ${err.message}`)
      }
    }

    console.log('')

    // Capture initial snapshot
    console.log('📸 Capturing initial aged accounts snapshot...')
    try {
      const result = await client.query('SELECT capture_aged_accounts_snapshot()')
      console.log(`✅ Snapshot captured: ${result.rows[0].capture_aged_accounts_snapshot} records`)
    } catch (err) {
      console.log('⚠️  Could not capture snapshot:', err.message)
    }

    // Check default alert configs
    console.log('')
    console.log('🔍 Checking default alert configurations...')
    const { rows: alertConfigs } = await client.query('SELECT name, severity FROM aging_alert_config')
    for (const config of alertConfigs) {
      console.log(`   ✅ ${config.name} (${config.severity})`)
    }

    // Release client
    client.release()

    console.log('')
    console.log('🎉 Migration complete! Aged accounts enhancements are ready.')
    console.log('')
    console.log('Tables created:')
    console.log('  - aged_accounts_history (for historical tracking)')
    console.log('  - webhook_subscriptions (for outbound webhooks)')
    console.log('  - aging_alert_config (for configurable alerts)')
    console.log('  - aging_alerts_log (for alert audit trail)')
    console.log('  - cse_assignment_suggestions (for CSE recommendations)')
    console.log('')
    console.log('Functions created:')
    console.log('  - capture_aged_accounts_snapshot() - for daily snapshots')
    console.log('  - check_aging_threshold_breaches() - for threshold checking')

  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    console.error('')
    console.error('Error details:', error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

main().catch(console.error)
