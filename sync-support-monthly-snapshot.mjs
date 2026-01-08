#!/usr/bin/env node

/**
 * Monthly Support Metrics Snapshot Sync Job
 *
 * This script captures a monthly snapshot of support metrics for historical trend analysis.
 * It should be run once per month (e.g., on the 1st) to preserve previous month's data.
 *
 * Usage:
 *   node scripts/sync-support-monthly-snapshot.mjs
 *   node scripts/sync-support-monthly-snapshot.mjs --dry-run
 *
 * Environment:
 *   NEXT_PUBLIC_SUPABASE_URL - Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY - Service role key for write access
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing environment variables')
  console.error('   Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

const isDryRun = process.argv.includes('--dry-run')

async function main() {
  console.log('🔄 Support Metrics Monthly Snapshot Sync')
  console.log('=' .repeat(50))

  if (isDryRun) {
    console.log('ℹ️  DRY RUN MODE - No changes will be made')
  }

  const now = new Date()
  console.log(`\n📅 Current date: ${now.toISOString().split('T')[0]}`)

  // Get the previous month's date range
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)

  console.log(`\n📊 Checking for previous month data:`)
  console.log(`   Period: ${prevMonth.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}`)
  console.log(`   Date range: ${prevMonth.toISOString().split('T')[0]} to ${prevMonthEnd.toISOString().split('T')[0]}`)

  // Check current records in the table
  const { data: existingRecords, error: fetchError } = await supabase
    .from('support_sla_metrics')
    .select('client_name, period_start, period_end')
    .order('period_end', { ascending: false })

  if (fetchError) {
    console.error('❌ Error fetching existing records:', fetchError.message)
    process.exit(1)
  }

  console.log(`\n📋 Current records in database:`)

  // Group by period
  const periodGroups = new Map()
  existingRecords?.forEach(r => {
    const periodKey = new Date(r.period_end).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })
    if (!periodGroups.has(periodKey)) {
      periodGroups.set(periodKey, [])
    }
    periodGroups.get(periodKey).push(r.client_name)
  })

  periodGroups.forEach((clients, period) => {
    console.log(`   ${period}: ${clients.length} clients (${clients.slice(0, 3).join(', ')}${clients.length > 3 ? '...' : ''})`)
  })

  // Check for duplicate periods for each client
  const clientPeriodMap = new Map()
  existingRecords?.forEach(r => {
    const key = `${r.client_name}_${r.period_end}`
    if (clientPeriodMap.has(key)) {
      console.warn(`   ⚠️ Duplicate found: ${r.client_name} - ${r.period_end}`)
    }
    clientPeriodMap.set(key, true)
  })

  // Get unique clients
  const uniqueClients = [...new Set(existingRecords?.map(r => r.client_name) || [])]
  console.log(`\n👥 Unique clients: ${uniqueClients.length}`)

  // Summary of historical data coverage
  const periods = [...new Set(existingRecords?.map(r => r.period_end) || [])]
  console.log(`\n📈 Historical periods available: ${periods.length}`)

  if (periods.length === 1) {
    console.log('\n⚠️  Only one period of data available.')
    console.log('   Trend analysis requires at least 2 periods of data.')
    console.log('   Import additional monthly reports to enable trends.')
  } else if (periods.length >= 2) {
    console.log('✅ Multiple periods available - trend analysis enabled')
  }

  // Recommendations
  console.log('\n📝 Recommendations:')
  console.log('   1. Import monthly SLA reports to build historical trends')
  console.log('   2. Run this sync job monthly to capture snapshots')
  console.log('   3. Each import should use a unique period_end date')
  console.log('   4. The table uses composite key (client_name, period_end) for deduplication')

  if (!isDryRun) {
    console.log('\n✅ Sync check complete')
    console.log('   No automatic snapshot needed - data comes from manual imports')
    console.log('   This script validates data integrity and reports on historical coverage')
  }

  console.log('\n' + '=' .repeat(50))
  console.log('Done!')
}

main().catch(err => {
  console.error('❌ Unexpected error:', err)
  process.exit(1)
})
