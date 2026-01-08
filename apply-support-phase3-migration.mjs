#!/usr/bin/env node

/**
 * Apply Support Health Phase 3 Database Migration
 * Creates service credits, known problems, and case details tables
 */

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required')
  process.exit(1)
}

async function main() {
  console.log('🔄 Applying Support Health Phase 3 Migration')
  console.log('=' .repeat(50))

  const migrationPath = path.join(__dirname, '..', 'docs', 'migrations', '20260108_support_phase3_tables.sql')

  if (!fs.existsSync(migrationPath)) {
    console.error('❌ Migration file not found:', migrationPath)
    process.exit(1)
  }

  console.log('\n📄 Migration file:', migrationPath)

  try {
    // Execute the migration using psql
    console.log('\n🚀 Executing migration...')

    const result = execSync(
      `/opt/homebrew/opt/libpq/bin/psql "${DATABASE_URL}" -f "${migrationPath}"`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    )

    console.log('\n✅ Migration executed successfully!')
    console.log(result)

    // Verify tables were created
    console.log('\n🔍 Verifying tables...')

    const verifyQuery = `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('support_service_credits', 'support_known_problems', 'support_case_details')
      ORDER BY table_name;
    `

    const verifyResult = execSync(
      `/opt/homebrew/opt/libpq/bin/psql "${DATABASE_URL}" -t -c "${verifyQuery}"`,
      { encoding: 'utf-8' }
    )

    const tables = verifyResult.trim().split('\n').map(t => t.trim()).filter(Boolean)
    console.log('Tables created:', tables)

    if (tables.length === 3) {
      console.log('\n✅ All 3 tables created successfully!')
    } else {
      console.log('\n⚠️  Some tables may not have been created. Expected 3, found', tables.length)
    }

    // Check if segment column was added
    console.log('\n🔍 Checking segment column...')
    const segmentQuery = `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'support_sla_metrics'
        AND column_name = 'client_segment';
    `

    const segmentResult = execSync(
      `/opt/homebrew/opt/libpq/bin/psql "${DATABASE_URL}" -t -c "${segmentQuery}"`,
      { encoding: 'utf-8' }
    )

    if (segmentResult.trim().includes('client_segment')) {
      console.log('✅ client_segment column exists in support_sla_metrics')
    } else {
      console.log('⚠️  client_segment column not found')
    }

  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    if (error.stderr) {
      console.error('Error details:', error.stderr)
    }
    process.exit(1)
  }

  console.log('\n' + '=' .repeat(50))
  console.log('Done!')
}

main().catch(err => {
  console.error('❌ Unexpected error:', err)
  process.exit(1)
})
