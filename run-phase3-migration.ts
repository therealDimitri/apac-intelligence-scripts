#!/usr/bin/env tsx
import { Client } from 'pg'
import * as fs from 'fs'
import * as path from 'path'

const dbPassword = process.env.SUPABASE_DB_PASSWORD
const connectionString = `postgresql://postgres.usoyxsunetvxdjdglkmn:${dbPassword}@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`

async function runMigration() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  })

  try {
    console.log('Connecting to database...')
    await client.connect()
    console.log('Connected!')

    const migrationFile = process.argv[2] || path.join(__dirname, '../docs/migrations/20260119_chasen_phase3_multiagent.sql')
    const sql = fs.readFileSync(migrationFile, 'utf8')
    console.log(`Executing migration from ${migrationFile} (${sql.length} bytes)...`)

    // Execute the SQL
    await client.query(sql)
    console.log('✅ Migration executed successfully!')
  } catch (err: any) {
    console.error('❌ Migration failed:', err.message)
    if (err.detail) console.error('Detail:', err.detail)
    if (err.where) console.error('Where:', err.where)
    process.exit(1)
  } finally {
    await client.end()
  }
}

runMigration()
