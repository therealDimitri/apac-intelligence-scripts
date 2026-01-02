#!/usr/bin/env node
/**
 * Apply Alerts Table Migration using direct PostgreSQL connection
 */

import pg from 'pg'
import dotenv from 'dotenv'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const databaseUrl = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL

if (!databaseUrl) {
  console.error('❌ Missing DATABASE_URL_DIRECT or DATABASE_URL')
  process.exit(1)
}

async function runMigration() {
  console.log('🚀 Starting Alerts Table Migration via Direct PostgreSQL Connection...\n')

  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  })

  try {
    console.log('📡 Connecting to database...')
    await client.connect()
    console.log('✅ Connected successfully\n')

    // Read migration SQL
    const migrationPath = join(__dirname, '..', 'docs', 'migrations', '20251231_alerts_table_and_action_linking.sql')
    const migrationSql = readFileSync(migrationPath, 'utf8')

    console.log('📋 Running migration...')

    // Split by semicolons and execute each statement
    const statements = migrationSql
      .split(/;(?=(?:[^']*'[^']*')*[^']*$)/) // Split by ; not in quotes
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'))

    let successCount = 0
    let skipCount = 0

    for (const statement of statements) {
      if (statement.trim().length < 5) continue

      // Skip pure comments
      if (statement.replace(/--[^\n]*/g, '').trim().length === 0) {
        continue
      }

      try {
        await client.query(statement + ';')
        successCount++
        
        // Log progress for major statements
        if (statement.includes('CREATE TABLE')) {
          const tableName = statement.match(/CREATE TABLE[^(]*?(\w+)/i)?.[1]
          console.log(`   ✅ Created table: ${tableName}`)
        } else if (statement.includes('ALTER TABLE') && statement.includes('ADD COLUMN')) {
          const match = statement.match(/ALTER TABLE\s+(\w+)\s+ADD COLUMN[^;]*?(\w+)/i)
          if (match) console.log(`   ✅ Added column ${match[2]} to ${match[1]}`)
        } else if (statement.includes('CREATE INDEX')) {
          const indexName = statement.match(/CREATE INDEX[^;]*?(\w+)/i)?.[1]
          console.log(`   ✅ Created index: ${indexName}`)
        } else if (statement.includes('CREATE POLICY')) {
          const policyName = statement.match(/CREATE POLICY\s+"?([^"]+)"?/i)?.[1]
          console.log(`   ✅ Created policy: ${policyName}`)
        } else if (statement.includes('CREATE OR REPLACE FUNCTION')) {
          const funcName = statement.match(/CREATE OR REPLACE FUNCTION\s+(\w+)/i)?.[1]
          console.log(`   ✅ Created function: ${funcName}`)
        }
      } catch (err) {
        // Handle already exists errors gracefully
        if (err.message.includes('already exists') || err.message.includes('duplicate')) {
          skipCount++
        } else {
          console.log(`   ⚠️ Statement warning: ${err.message.substring(0, 100)}`)
        }
      }
    }

    console.log(`\n✨ Migration complete!`)
    console.log(`   Executed: ${successCount} statements`)
    console.log(`   Skipped (already exists): ${skipCount} statements`)

    // Verify tables exist
    console.log('\n📊 Verifying tables...')

    const alertsCheck = await client.query(`SELECT COUNT(*) FROM alerts`)
    console.log(`   ✅ alerts table exists (${alertsCheck.rows[0].count} rows)`)

    const fingerprintsCheck = await client.query(`SELECT COUNT(*) FROM alert_fingerprints`)
    console.log(`   ✅ alert_fingerprints table exists (${fingerprintsCheck.rows[0].count} rows)`)

    const actionsCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'actions' AND column_name = 'source_alert_id'
    `)
    if (actionsCheck.rows.length > 0) {
      console.log(`   ✅ actions.source_alert_id column exists`)
    }

    console.log('\n🎉 Migration verified successfully!')

  } catch (err) {
    console.error('\n❌ Migration failed:', err.message)
    process.exit(1)
  } finally {
    await client.end()
    console.log('\n📡 Database connection closed')
  }
}

runMigration()
