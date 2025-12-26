#!/usr/bin/env node

/**
 * Run Comments Table Migration
 * Uses pg library to execute SQL directly against the database
 */

import pg from 'pg'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env.local') })

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  console.error('❌ DATABASE_URL not found in .env.local')
  process.exit(1)
}

// Read migration SQL
const migrationPath = join(__dirname, '../supabase/migrations/20251220_create_comments_table.sql')
const migrationSQL = fs.readFileSync(migrationPath, 'utf8')

async function runMigration() {
  console.log('🚀 Running comments table migration...\n')

  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  })

  try {
    await client.connect()
    console.log('✅ Connected to database\n')

    // Execute the migration
    await client.query(migrationSQL)
    console.log('✅ Migration executed successfully!\n')

    // Verify table exists
    const result = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'comments'
      ORDER BY ordinal_position
    `)

    if (result.rows.length > 0) {
      console.log('📊 Comments table columns:')
      result.rows.forEach(row => {
        console.log(`   - ${row.column_name}: ${row.data_type}`)
      })
      console.log('\n🎉 Comments table is ready!')
    } else {
      console.log('⚠️  Table created but no columns found - please verify')
    }

  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    if (error.message.includes('already exists')) {
      console.log('\n✅ Table already exists - migration may have run before')
    }
    process.exit(1)
  } finally {
    await client.end()
  }
}

runMigration()
