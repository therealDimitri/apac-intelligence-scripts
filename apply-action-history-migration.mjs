#!/usr/bin/env node

/**
 * Apply Action History, Tags, and Related Actions migration
 * Uses postgres.js for direct database connection
 */

import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

dotenv.config({ path: '.env.local' })

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DATABASE_URL = process.env.DATABASE_URL_DIRECT || process.env.SUPABASE_DB_URL || process.env.DATABASE_URL

if (!DATABASE_URL) {
  console.error('❌ Missing DATABASE_URL environment variable')
  console.log('Please add DATABASE_URL to .env.local')
  console.log('Format: postgresql://postgres:[password]@[host]:5432/postgres')
  process.exit(1)
}

// Read the migration SQL
const migrationPath = path.join(__dirname, '../docs/migrations/20260101_action_history_tags_related.sql')
const migrationSQL = fs.readFileSync(migrationPath, 'utf-8')

async function main() {
  console.log('\n🚀 Applying Action History, Tags, and Relations migration...\n')

  try {
    const { default: postgres } = await import('postgres')
    const sql = postgres(DATABASE_URL, {
      ssl: { rejectUnauthorized: false },
      connection: { application_name: 'action-history-migration' },
      connect_timeout: 30,
    })

    console.log('📋 Connected to database, executing migration...')

    // Execute the migration
    await sql.unsafe(migrationSQL)

    console.log('✅ Migration executed successfully!\n')

    // Verify tables
    console.log('🔍 Verifying tables...')

    const activityLogCheck = await sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'action_activity_log'
      ) as exists
    `
    console.log(`   action_activity_log: ${activityLogCheck[0].exists ? '✅' : '❌'}`)

    const tagsCheck = await sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'actions' AND column_name = 'tags'
      ) as exists
    `
    console.log(`   actions.tags column: ${tagsCheck[0].exists ? '✅' : '❌'}`)

    const relationsCheck = await sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'action_relations'
      ) as exists
    `
    console.log(`   action_relations: ${relationsCheck[0].exists ? '✅' : '❌'}`)

    await sql.end()

    console.log('\n✅ Migration complete!')
    console.log('\nNext steps:')
    console.log('1. Run the backfill script: node scripts/backfill-action-history.mjs')
    console.log('2. Restart your dev server to pick up schema changes')

  } catch (err) {
    console.error('\n❌ Migration failed:', err.message)

    if (err.message.includes('pg_hba.conf')) {
      console.log('\n📝 Connection rejected. Try using the pooler URL:')
      console.log('   DATABASE_URL=postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres')
    }

    console.log('\n📝 Or run the SQL manually:')
    console.log('   1. Go to Supabase Dashboard → SQL Editor')
    console.log('   2. Paste contents of: docs/migrations/20260101_action_history_tags_related.sql')
    console.log('   3. Click Run')

    process.exit(1)
  }
}

main()
