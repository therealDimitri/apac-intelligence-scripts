#!/usr/bin/env node

/**
 * Migration: Enable historical data tracking for support_sla_metrics
 *
 * This adds:
 * 1. Composite unique constraint on (client_name, period_end)
 * 2. Indexes for efficient trend queries
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

async function main() {
  console.log('🚀 Starting support_sla_metrics historical data migration...\n')

  // Check current table structure
  console.log('📊 Checking current support_sla_metrics table...')
  const { data: sample, error: sampleError } = await supabase
    .from('support_sla_metrics')
    .select('*')
    .limit(3)

  if (sampleError) {
    console.error('❌ Error checking table:', sampleError.message)
    process.exit(1)
  }

  console.log(`   Found ${sample?.length || 0} sample records`)
  if (sample && sample.length > 0) {
    console.log('   Columns:', Object.keys(sample[0]).join(', '))
  }

  // Check for duplicate client_name + period_end combinations
  console.log('\n📋 Checking for existing duplicates...')
  const { data: allRecords, error: allError } = await supabase
    .from('support_sla_metrics')
    .select('client_name, period_end')

  if (allError) {
    console.error('❌ Error fetching records:', allError.message)
    process.exit(1)
  }

  const duplicateCheck = new Map()
  const duplicates = []
  allRecords?.forEach(r => {
    const key = `${r.client_name}|${r.period_end}`
    if (duplicateCheck.has(key)) {
      duplicates.push(key)
    } else {
      duplicateCheck.set(key, true)
    }
  })

  if (duplicates.length > 0) {
    console.log(`   ⚠️ Found ${duplicates.length} duplicate client+period combinations:`)
    duplicates.slice(0, 5).forEach(d => console.log(`      - ${d}`))
    if (duplicates.length > 5) console.log(`      ... and ${duplicates.length - 5} more`)
    console.log('\n   These need to be resolved before adding unique constraint.')
  } else {
    console.log('   ✅ No duplicates found - safe to add unique constraint')
  }

  // Count by client to show distribution
  console.log('\n📈 Current data distribution:')
  const clientCounts = new Map()
  allRecords?.forEach(r => {
    clientCounts.set(r.client_name, (clientCounts.get(r.client_name) || 0) + 1)
  })
  console.log(`   ${clientCounts.size} unique clients with ${allRecords?.length || 0} total records`)

  // Show periods available
  const periods = new Set()
  allRecords?.forEach(r => periods.add(r.period_end))
  console.log(`   ${periods.size} unique periods: ${Array.from(periods).slice(0, 5).join(', ')}${periods.size > 5 ? '...' : ''}`)

  console.log('\n✅ Migration analysis complete!')
  console.log('\n📝 Next steps:')
  console.log('   1. The unique constraint can be added via Supabase SQL editor')
  console.log('   2. Run the following SQL in Supabase dashboard:\n')

  console.log(`-- Enable historical tracking for support_sla_metrics
-- Add composite unique constraint (only if no duplicates exist)
ALTER TABLE support_sla_metrics
ADD CONSTRAINT support_sla_metrics_client_period_unique
UNIQUE (client_name, period_end);

-- Add indexes for efficient trend queries
CREATE INDEX IF NOT EXISTS idx_support_metrics_client
ON support_sla_metrics (client_name);

CREATE INDEX IF NOT EXISTS idx_support_metrics_period
ON support_sla_metrics (period_end DESC);

CREATE INDEX IF NOT EXISTS idx_support_metrics_client_period
ON support_sla_metrics (client_name, period_end DESC);

-- Add index for health score queries
CREATE INDEX IF NOT EXISTS idx_support_metrics_health_score
ON support_sla_metrics (support_health_score) WHERE support_health_score IS NOT NULL;
`)

  console.log('\n   3. After running the SQL, the sync script will automatically')
  console.log('      append new monthly records instead of overwriting.')
}

main().catch(console.error)
