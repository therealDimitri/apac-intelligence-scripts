#!/usr/bin/env node

/**
 * Execute client_uuid SQL migration via Supabase
 *
 * This script executes the SQL migration to add client_uuid columns
 * to the remaining tables using the Supabase management API.
 *
 * Usage: node scripts/execute-client-uuid-sql.mjs
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load environment variables
config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing required environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// SQL statements to execute (broken down for easier debugging)
const SQL_STATEMENTS = [
  // 1. Add columns
  {
    name: 'Add client_uuid to nps_clients',
    sql: `ALTER TABLE nps_clients ADD COLUMN IF NOT EXISTS client_uuid UUID REFERENCES clients(id);`,
  },
  {
    name: 'Add client_uuid to client_arr',
    sql: `ALTER TABLE client_arr ADD COLUMN IF NOT EXISTS client_uuid UUID REFERENCES clients(id);`,
  },
  {
    name: 'Add client_uuid to chasen_documents',
    sql: `ALTER TABLE chasen_documents ADD COLUMN IF NOT EXISTS client_uuid UUID REFERENCES clients(id);`,
  },
  {
    name: 'Add client_uuid to segmentation_compliance_scores',
    sql: `ALTER TABLE segmentation_compliance_scores ADD COLUMN IF NOT EXISTS client_uuid UUID REFERENCES clients(id);`,
  },

  // 2. Create indexes
  {
    name: 'Create index on nps_clients.client_uuid',
    sql: `CREATE INDEX IF NOT EXISTS idx_nps_clients_client_uuid ON nps_clients(client_uuid);`,
  },
  {
    name: 'Create index on client_arr.client_uuid',
    sql: `CREATE INDEX IF NOT EXISTS idx_client_arr_client_uuid ON client_arr(client_uuid);`,
  },
  {
    name: 'Create index on chasen_documents.client_uuid',
    sql: `CREATE INDEX IF NOT EXISTS idx_chasen_documents_client_uuid ON chasen_documents(client_uuid);`,
  },
  {
    name: 'Create index on segmentation_compliance_scores.client_uuid',
    sql: `CREATE INDEX IF NOT EXISTS idx_segmentation_compliance_scores_client_uuid ON segmentation_compliance_scores(client_uuid);`,
  },

  // 3. Backfill data
  {
    name: 'Backfill nps_clients',
    sql: `
      UPDATE nps_clients nc
      SET client_uuid = c.id
      FROM clients c
      WHERE nc.client_uuid IS NULL
        AND nc.client_name IS NOT NULL
        AND (
          LOWER(c.canonical_name) = LOWER(nc.client_name)
          OR EXISTS (
            SELECT 1 FROM client_name_aliases cna
            WHERE LOWER(cna.canonical_name) = LOWER(c.canonical_name)
            AND LOWER(cna.display_name) = LOWER(nc.client_name)
          )
        );
    `,
  },
  {
    name: 'Backfill client_arr',
    sql: `
      UPDATE client_arr ca_table
      SET client_uuid = c.id
      FROM clients c
      WHERE ca_table.client_uuid IS NULL
        AND ca_table.client_name IS NOT NULL
        AND (
          LOWER(c.canonical_name) = LOWER(ca_table.client_name)
          OR EXISTS (
            SELECT 1 FROM client_name_aliases cna
            WHERE LOWER(cna.canonical_name) = LOWER(c.canonical_name)
            AND LOWER(cna.display_name) = LOWER(ca_table.client_name)
          )
        );
    `,
  },
  {
    name: 'Backfill chasen_documents',
    sql: `
      UPDATE chasen_documents cd
      SET client_uuid = c.id
      FROM clients c
      WHERE cd.client_uuid IS NULL
        AND cd.client_name IS NOT NULL
        AND (
          LOWER(c.canonical_name) = LOWER(cd.client_name)
          OR EXISTS (
            SELECT 1 FROM client_name_aliases cna
            WHERE LOWER(cna.canonical_name) = LOWER(c.canonical_name)
            AND LOWER(cna.display_name) = LOWER(cd.client_name)
          )
        );
    `,
  },
  {
    name: 'Backfill segmentation_compliance_scores',
    sql: `
      UPDATE segmentation_compliance_scores scs
      SET client_uuid = c.id
      FROM clients c
      WHERE scs.client_uuid IS NULL
        AND scs.client_name IS NOT NULL
        AND (
          LOWER(c.canonical_name) = LOWER(scs.client_name)
          OR EXISTS (
            SELECT 1 FROM client_name_aliases cna
            WHERE LOWER(cna.canonical_name) = LOWER(c.canonical_name)
            AND LOWER(cna.display_name) = LOWER(scs.client_name)
          )
        );
    `,
  },
]

async function executeSQL(name, sql) {
  console.log(`  → ${name}...`)

  try {
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql })

    if (error) {
      // Try alternative method - direct query
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sql_query: sql }),
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`HTTP ${response.status}: ${text}`)
      }
    }

    console.log(`    ✓ Success`)
    return true
  } catch (err) {
    console.error(`    ❌ Failed: ${err.message}`)
    return false
  }
}

async function main() {
  console.log('═'.repeat(60))
  console.log('  Execute Client UUID SQL Migration')
  console.log('═'.repeat(60))

  console.log('\n⚠️  This migration requires SQL execution privileges.')
  console.log('   If automatic execution fails, run the SQL manually in Supabase Dashboard.')
  console.log('   Migration file: docs/migrations/20251227_add_client_uuid_to_remaining_tables.sql')
  console.log('')

  let successCount = 0
  let failCount = 0

  for (const statement of SQL_STATEMENTS) {
    const success = await executeSQL(statement.name, statement.sql)
    if (success) {
      successCount++
    } else {
      failCount++
    }
  }

  console.log('\n' + '─'.repeat(60))
  console.log(`Results: ${successCount} succeeded, ${failCount} failed`)

  if (failCount > 0) {
    console.log('\n⚠️  Some statements failed. You may need to run the migration manually:')
    console.log('   1. Open Supabase Dashboard → SQL Editor')
    console.log('   2. Paste the contents of: docs/migrations/20251227_add_client_uuid_to_remaining_tables.sql')
    console.log('   3. Execute the migration')
    console.log('   4. Re-run: node scripts/apply-client-uuid-migration.mjs')
  } else {
    console.log('\n✅ All statements executed successfully!')
    console.log('   Run: node scripts/apply-client-uuid-migration.mjs to verify')
  }
}

main().catch(console.error)
