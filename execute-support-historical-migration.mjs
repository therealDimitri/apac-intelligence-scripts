#!/usr/bin/env node

/**
 * Execute: Apply historical data tracking migration for support_sla_metrics
 * Uses direct SQL execution via Supabase management API
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// Migration SQL statements (one at a time to avoid multi-statement issues)
const migrations = [
  {
    name: 'Add unique constraint',
    sql: `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'support_sla_metrics_client_period_unique'
        ) THEN
          ALTER TABLE support_sla_metrics
          ADD CONSTRAINT support_sla_metrics_client_period_unique
          UNIQUE (client_name, period_end);
        END IF;
      END $$;
    `,
  },
  {
    name: 'Add client index',
    sql: `CREATE INDEX IF NOT EXISTS idx_support_metrics_client ON support_sla_metrics (client_name);`,
  },
  {
    name: 'Add period index',
    sql: `CREATE INDEX IF NOT EXISTS idx_support_metrics_period ON support_sla_metrics (period_end DESC);`,
  },
  {
    name: 'Add composite index',
    sql: `CREATE INDEX IF NOT EXISTS idx_support_metrics_client_period ON support_sla_metrics (client_name, period_end DESC);`,
  },
]

async function main() {
  console.log('🚀 Executing support_sla_metrics historical data migration...\n')

  for (const migration of migrations) {
    console.log(`📝 ${migration.name}...`)

    const { error } = await supabase.rpc('exec_sql', { sql: migration.sql })

    if (error) {
      // Try alternative approach - some Supabase instances may not have exec_sql
      if (error.message.includes('function') || error.message.includes('does not exist')) {
        console.log(`   ⚠️ exec_sql not available, migration must be run manually`)
        console.log(`   SQL: ${migration.sql.trim().substring(0, 80)}...`)
      } else {
        console.error(`   ❌ Error: ${error.message}`)
      }
    } else {
      console.log(`   ✅ Success`)
    }
  }

  // Verify the migration
  console.log('\n📋 Verifying migration...')

  // Test by checking if we can insert a duplicate (should fail with constraint)
  const { data: existing } = await supabase
    .from('support_sla_metrics')
    .select('client_name, period_end')
    .limit(1)
    .single()

  if (existing) {
    console.log(`   Testing constraint with: ${existing.client_name} / ${existing.period_end}`)

    // Try to insert a duplicate (this should fail if constraint exists)
    const { error: dupError } = await supabase
      .from('support_sla_metrics')
      .insert({
        client_name: existing.client_name,
        period_end: existing.period_end,
        period_start: existing.period_end,
        period_type: 'monthly',
        total_incoming: 0,
        total_closed: 0,
        backlog: 0,
      })

    if (dupError && dupError.message.includes('unique')) {
      console.log('   ✅ Unique constraint is working correctly!')
    } else if (dupError) {
      console.log(`   ⚠️ Insert failed but not due to unique constraint: ${dupError.message}`)
    } else {
      // Clean up if it somehow got inserted
      await supabase
        .from('support_sla_metrics')
        .delete()
        .eq('client_name', existing.client_name)
        .eq('period_end', existing.period_end)
        .eq('total_incoming', 0)
      console.log('   ⚠️ Constraint may not be active yet')
    }
  }

  console.log('\n✅ Migration complete!')
  console.log('\n💡 If migrations failed, please run the SQL manually in Supabase dashboard.')
}

main().catch(console.error)
