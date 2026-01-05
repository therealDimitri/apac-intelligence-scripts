/**
 * Debug aged_accounts_history table
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
  console.log('=== aged_accounts_history Debug ===\n')

  // Check if table exists and get count
  const { data, error, count } = await supabase
    .from('aged_accounts_history')
    .select('*', { count: 'exact' })
    .order('snapshot_date', { ascending: false })
    .limit(10)

  if (error) {
    console.log(`Error: ${error.message}`)
    if (error.code === '42P01') {
      console.log('\n⚠️  Table does not exist. Need to create and populate it.')
    }
    return
  }

  console.log(`Total rows: ${count}`)

  if (data && data.length > 0) {
    console.log(`\nLatest 10 records (columns: ${Object.keys(data[0]).join(', ')}):`)
    data.forEach((r, i) => {
      console.log(`  [${i + 1}] ${r.snapshot_date} - ${r.client_name || 'N/A'} - Under60: ${r.compliance_under_60}%, Under90: ${r.compliance_under_90}%`)
    })

    // Find date range
    const { data: minMax } = await supabase
      .from('aged_accounts_history')
      .select('snapshot_date')
      .order('snapshot_date', { ascending: true })
      .limit(1)

    const { data: maxDate } = await supabase
      .from('aged_accounts_history')
      .select('snapshot_date')
      .order('snapshot_date', { ascending: false })
      .limit(1)

    console.log(`\nDate range: ${minMax?.[0]?.snapshot_date} to ${maxDate?.[0]?.snapshot_date}`)
    console.log(`Today: ${new Date().toISOString().split('T')[0]}`)

    // Count unique dates
    const { data: allDates } = await supabase
      .from('aged_accounts_history')
      .select('snapshot_date')

    const uniqueDates = [...new Set(allDates?.map(d => d.snapshot_date) || [])]
    console.log(`Unique snapshot dates: ${uniqueDates.length}`)
    console.log(`Latest 5 dates: ${uniqueDates.sort().reverse().slice(0, 5).join(', ')}`)
  } else {
    console.log('\nNo data in table.')
  }
}

main().catch(console.error)
