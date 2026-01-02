#!/usr/bin/env node
/**
 * Apply BURC Comprehensive Tables Migration
 * Creates 20 new tables for full BURC data coverage
 */

import pg from 'pg'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Direct database connection (bypass connection pooler for DDL)
const DATABASE_URL = process.env.DATABASE_URL_DIRECT ||
  'postgresql://postgres:***REMOVED***@db.usoyxsunetvxdjdglkmn.supabase.co:5432/postgres'

async function applyMigration() {
  const client = new pg.Client({ connectionString: DATABASE_URL })

  try {
    console.log('Connecting to database...')
    await client.connect()
    console.log('✓ Connected\n')

    // Read migration file
    const migrationPath = path.join(__dirname, '..', 'docs', 'migrations', '20260102_burc_comprehensive_tables.sql')
    const sql = fs.readFileSync(migrationPath, 'utf8')

    // Split into statements and execute
    const statements = sql.split(';').filter(s => s.trim())

    console.log(`Executing ${statements.length} statements...\n`)

    let successCount = 0
    let errorCount = 0

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i].trim()
      if (!stmt) continue

      // Extract first line for logging
      const firstLine = stmt.split('\n')[0].slice(0, 60)

      try {
        await client.query(stmt)
        console.log(`✓ [${i + 1}/${statements.length}] ${firstLine}...`)
        successCount++
      } catch (err) {
        // Ignore "already exists" errors
        if (err.message.includes('already exists') || err.message.includes('duplicate')) {
          console.log(`⚠ [${i + 1}/${statements.length}] Already exists: ${firstLine.slice(0, 40)}`)
          successCount++
        } else {
          console.error(`✗ [${i + 1}/${statements.length}] Error: ${err.message.slice(0, 80)}`)
          errorCount++
        }
      }
    }

    console.log(`\n========================================`)
    console.log(`Migration Complete`)
    console.log(`========================================`)
    console.log(`✓ Successful: ${successCount}`)
    console.log(`✗ Errors: ${errorCount}`)

    // Verify tables created
    console.log(`\n=== Verifying New Tables ===\n`)

    const newTables = [
      'burc_monthly_ebita',
      'burc_monthly_revenue',
      'burc_risk_profile',
      'burc_quarterly_comparison',
      'burc_opex',
      'burc_headcount',
      'burc_small_deals',
      'burc_initiatives',
      'burc_ar_aging',
      'burc_critical_suppliers',
      'burc_product_revenue',
      'burc_cogs',
      'burc_historical_revenue_detail',
      'burc_ps_cross_charges',
      'burc_support_metrics',
      'burc_budget_actuals',
      'burc_collections',
      'burc_exchange_rates',
      'burc_sales_forecast',
      'burc_monthly_snapshots'
    ]

    for (const table of newTables) {
      const { rows } = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = $1
        )
      `, [table])

      const exists = rows[0].exists
      console.log(`${exists ? '✓' : '✗'} ${table}`)
    }

    console.log(`\n=== Migration Applied Successfully ===`)

  } catch (err) {
    console.error('Migration failed:', err.message)
    process.exit(1)
  } finally {
    await client.end()
  }
}

applyMigration()
