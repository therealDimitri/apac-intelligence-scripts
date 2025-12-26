#!/usr/bin/env tsx
/**
 * Automated Database Migration Script
 *
 * Executes Client Segmentation Event Tracking System database migrations
 * Uses direct PostgreSQL connection to run DDL operations
 *
 * Required Environment Variables:
 * - SUPABASE_DB_PASSWORD (Postgres database password from Supabase dashboard)
 *
 * Usage:
 *   SUPABASE_DB_PASSWORD=your_password npm run migrate
 */

import { Client } from 'pg'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// ES Module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PROJECT_REF = 'usoyxsunetvxdjdglkmn'
const REGION = 'ap-southeast-1' // APAC region
const DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD

async function runMigrations() {
  console.log('='.repeat(80))
  console.log('DATABASE MIGRATION SCRIPT')
  console.log('Client Segmentation Event Tracking System')
  console.log('='.repeat(80))
  console.log('')

  // Validate environment variable
  if (!DB_PASSWORD) {
    console.error('❌ ERROR: SUPABASE_DB_PASSWORD environment variable not set')
    console.error('')
    console.error('To find your database password:')
    console.error('1. Go to: https://supabase.com/dashboard/project/usoyxsunetvxdjdglkmn/settings/database')
    console.error('2. Copy the database password')
    console.error('3. Run: SUPABASE_DB_PASSWORD=your_password npm run migrate')
    console.error('')
    process.exit(1)
  }

  // Construct connection string
  const connectionString = `postgresql://postgres.${PROJECT_REF}:${DB_PASSWORD}@aws-0-${REGION}.pooler.supabase.com:6543/postgres`

  console.log('📡 Connecting to Supabase PostgreSQL database...')
  console.log(`   Project: ${PROJECT_REF}`)
  console.log(`   Region: ${REGION}`)
  console.log('')

  const client = new Client({
    connectionString,
    ssl: {
      rejectUnauthorized: false, // Required for Supabase connection pooler
    },
  })

  try {
    await client.connect()
    console.log('✅ Connected to database successfully')
    console.log('')

    // Define migrations in execution order
    const migrations = [
      {
        file: '20251127_migrate_tier_requirements_schema.sql',
        description: 'Migrate tier_event_requirements schema (tier_id → segment)',
      },
      {
        file: '20251127_seed_tier_requirements.sql',
        description: 'Seed tier_event_requirements with 72 official requirements',
      },
      {
        file: '20251127_add_event_tracking_schema.sql',
        description: 'Create event tracking tables (segmentation_events, etc.)',
      },
    ]

    console.log('📋 Migrations to execute:')
    migrations.forEach((m, i) => {
      console.log(`   ${i + 1}. ${m.description}`)
    })
    console.log('')

    // Execute each migration
    for (const migration of migrations) {
      const migrationPath = path.join(
        __dirname,
        '..',
        'supabase',
        'migrations',
        migration.file
      )

      console.log(`⏳ Executing: ${migration.file}`)
      console.log(`   ${migration.description}`)

      // Check if file exists
      if (!fs.existsSync(migrationPath)) {
        console.error(`❌ ERROR: Migration file not found: ${migrationPath}`)
        process.exit(1)
      }

      // Read migration SQL
      const sql = fs.readFileSync(migrationPath, 'utf8')

      try {
        // Execute migration
        await client.query(sql)
        console.log(`✅ ${migration.file} completed successfully`)
        console.log('')
      } catch (error: any) {
        console.error(`❌ ERROR executing ${migration.file}:`)
        console.error(`   ${error.message}`)
        console.error('')
        console.error('Migration rolled back. Database unchanged.')
        process.exit(1)
      }
    }

    // Verify migration success
    console.log('🔍 Verifying migration results...')
    console.log('')

    // Check tier_event_requirements schema
    const schemaCheck = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'tier_event_requirements'
      ORDER BY ordinal_position;
    `)
    console.log('✅ tier_event_requirements schema:')
    schemaCheck.rows.forEach(row => {
      console.log(`   - ${row.column_name} (${row.data_type})`)
    })
    console.log('')

    // Check data count
    const countCheck = await client.query(`
      SELECT segment, COUNT(*) as event_types
      FROM tier_event_requirements
      GROUP BY segment
      ORDER BY segment;
    `)
    console.log('✅ tier_event_requirements data:')
    countCheck.rows.forEach(row => {
      console.log(`   - ${row.segment}: ${row.event_types} event types`)
    })
    console.log('')

    // Check total rows
    const totalCheck = await client.query(`
      SELECT COUNT(*) as total FROM tier_event_requirements;
    `)
    console.log(`✅ Total rows: ${totalCheck.rows[0].total} (expected: 72)`)
    console.log('')

    // Check backup table exists
    const backupCheck = await client.query(`
      SELECT COUNT(*) as total FROM tier_event_requirements_backup;
    `)
    console.log(`✅ Backup table: ${backupCheck.rows[0].total} rows preserved`)
    console.log('')

    console.log('='.repeat(80))
    console.log('✅ MIGRATION COMPLETED SUCCESSFULLY')
    console.log('='.repeat(80))
    console.log('')
    console.log('Next steps:')
    console.log('1. Navigate to https://apac-cs-dashboards.com/segmentation')
    console.log('2. Verify client event compliance tracking displays correctly')
    console.log('3. Test "Schedule Event" functionality')
    console.log('4. Check AI compliance predictions generate recommendations')
    console.log('')

  } catch (error: any) {
    console.error('='.repeat(80))
    console.error('❌ MIGRATION FAILED')
    console.error('='.repeat(80))
    console.error('')
    console.error('Error:', error.message)
    console.error('')
    console.error('Stack trace:')
    console.error(error.stack)
    console.error('')
    console.error('Database may be in inconsistent state.')
    console.error('Check the rollback plan in docs/DATABASE-MIGRATION-GUIDE.md')
    console.error('')
    process.exit(1)
  } finally {
    await client.end()
    console.log('📡 Database connection closed')
  }
}

// Run migrations
runMigrations().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
