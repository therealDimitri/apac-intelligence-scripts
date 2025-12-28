#!/usr/bin/env node
/**
 * Apply Client Financials Migration via PostgreSQL
 */

import pg from 'pg'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { readFileSync } from 'fs'
import dotenv from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env.local') })

// Use direct URL if available, otherwise fall back to pooler
const databaseUrl = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL

if (!databaseUrl) {
  console.error('❌ DATABASE_URL not found in .env.local')
  process.exit(1)
}

console.log(`Using: ${databaseUrl.includes('pooler') ? 'Pooler' : 'Direct'} connection`)

const { Client } = pg

async function applyMigration() {
  console.log('🚀 Applying Client Financials Migration via PostgreSQL...\n')

  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  })

  try {
    await client.connect()
    console.log('✅ Connected to database\n')

    // Read and execute the full SQL file
    const sqlPath = join(__dirname, '..', 'docs', 'migrations', '20251228_client_financials.sql')
    const sql = readFileSync(sqlPath, 'utf8')

    // Execute the entire script
    console.log('📝 Executing migration...\n')
    await client.query(sql)

    console.log('✅ Migration applied successfully!\n')

    // Verify tables
    console.log('🔍 Verifying tables...\n')

    const tables = [
      'client_financials',
      'contract_renewals',
      'attrition_risk',
      'business_case_pipeline'
    ]

    for (const table of tables) {
      const result = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = $1
        )
      `, [table])

      if (result.rows[0].exists) {
        console.log(`✅ ${table}: Created`)
      } else {
        console.log(`❌ ${table}: Missing`)
      }
    }

    // Verify views
    console.log('\n🔍 Verifying views...\n')

    const views = [
      'client_revenue_summary',
      'upcoming_renewals',
      'revenue_at_risk_summary',
      'business_case_summary'
    ]

    for (const view of views) {
      const result = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.views
          WHERE table_schema = 'public'
          AND table_name = $1
        )
      `, [view])

      if (result.rows[0].exists) {
        console.log(`✅ ${view}: Created`)
      } else {
        console.log(`❌ ${view}: Missing`)
      }
    }

    console.log('\n✨ Migration complete!\n')

  } catch (err) {
    console.error('❌ Migration failed:', err.message)

    // If there's a syntax error, try to identify the problematic statement
    if (err.position) {
      console.error(`   Position: ${err.position}`)
    }

    process.exit(1)
  } finally {
    await client.end()
  }
}

applyMigration()
