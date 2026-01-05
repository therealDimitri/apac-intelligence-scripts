/**
 * Debug script for BURC Supplier Analysis and Working Capital issues
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function main() {
  console.log('=== BURC Issues Debug ===\n')

  // 1. Check burc_critical_suppliers table
  console.log('--- 1. Checking burc_critical_suppliers table ---')
  const { data: suppliers, error: suppliersError, count: suppliersCount } = await supabase
    .from('burc_critical_suppliers')
    .select('*', { count: 'exact' })
    .limit(5)

  if (suppliersError) {
    console.log(`  Error: ${suppliersError.message}`)
  } else {
    console.log(`  Row count: ${suppliersCount}`)
    if (suppliers && suppliers.length > 0) {
      console.log('  Sample data:')
      console.log(`    Columns: ${Object.keys(suppliers[0]).join(', ')}`)
      suppliers.forEach((s, i) => {
        console.log(`    [${i + 1}] ${s.vendor_name || 'N/A'} - $${s.annual_spend || 0}`)
      })
    } else {
      console.log('  No data in table')
    }
  }

  // 2. Check working capital trend data
  console.log('\n--- 2. Checking working capital trend history ---')
  const { data: wcTrend, error: wcError } = await supabase
    .from('working_capital_trend_history')
    .select('*')
    .order('snapshot_date', { ascending: false })
    .limit(10)

  if (wcError) {
    console.log(`  Error: ${wcError.message}`)
  } else if (wcTrend && wcTrend.length > 0) {
    console.log(`  Latest ${wcTrend.length} records:`)
    wcTrend.forEach((r, i) => {
      console.log(`    [${i + 1}] ${r.snapshot_date} - 30d: $${r.total_over_30 || 0}, 60d: $${r.total_over_60 || 0}`)
    })
    console.log(`  Most recent date: ${wcTrend[0].snapshot_date}`)
    console.log(`  Today: ${new Date().toISOString().split('T')[0]}`)
  } else {
    console.log('  No data in table')
  }

  // 3. Check aging accounts data (source for WC trends)
  console.log('\n--- 3. Checking aging_accounts (source) ---')
  const { data: aging, error: agingError, count: agingCount } = await supabase
    .from('aging_accounts')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(3)

  if (agingError) {
    console.log(`  Error: ${agingError.message}`)
  } else {
    console.log(`  Row count: ${agingCount}`)
    if (aging && aging.length > 0) {
      console.log('  Latest records:')
      aging.forEach((a, i) => {
        console.log(`    [${i + 1}] ${a.client_name} - Created: ${a.created_at}, Updated: ${a.updated_at}`)
      })
    }
  }

  // 4. Check if there's a cron/automation for trend history updates
  console.log('\n--- 4. Checking for recent trend snapshot dates ---')
  const { data: allDates, error: datesError } = await supabase
    .from('working_capital_trend_history')
    .select('snapshot_date')
    .order('snapshot_date', { ascending: false })
    .limit(30)

  if (!datesError && allDates) {
    const uniqueDates = [...new Set(allDates.map(d => d.snapshot_date))]
    console.log(`  Available snapshot dates: ${uniqueDates.join(', ')}`)
  }

  // 5. Check available BURC tables
  console.log('\n--- 5. Listing BURC-related tables in schema ---')
  // We'll just check which tables exist
  const tablesToCheck = [
    'burc_critical_suppliers',
    'burc_revenue_trend',
    'burc_revenue_mix',
    'burc_client_lifetime',
    'burc_concentration_analysis',
    'burc_nrr_grr_history',
    'burc_executive_summary',
    'burc_active_alerts',
    'burc_renewal_calendar',
    'burc_attrition_summary',
    'burc_annual_financials',
  ]

  for (const table of tablesToCheck) {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })

    if (error) {
      console.log(`  ❌ ${table}: ${error.code === '42P01' ? 'Table does not exist' : error.message}`)
    } else {
      console.log(`  ✓ ${table}: ${count} rows`)
    }
  }

  console.log('\n=== Debug Complete ===')
}

main().catch(console.error)
