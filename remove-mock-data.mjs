/**
 * Remove Mock Data from aged_accounts_history
 * Keeps only data from dates when real captures occurred
 *
 * Real capture dates:
 * - Dec 19-20, 2025: Cron job captures
 * - Dec 27, 2025: Manual capture
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: join(__dirname, '../.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// Real capture dates
const REAL_DATES = ['2025-12-19', '2025-12-20', '2025-12-27']

async function removeMockData() {
  console.log('=== Removing Mock Data from aged_accounts_history ===\n')

  // First, get current state
  const { data: before, error: beforeError } = await supabase
    .from('aged_accounts_history')
    .select('snapshot_date')
    .order('snapshot_date', { ascending: true })

  if (beforeError) {
    console.error('Error fetching data:', beforeError.message)
    process.exit(1)
  }

  const beforeDates = [...new Set(before.map(r => r.snapshot_date))]
  console.log(`Before: ${beforeDates.length} unique dates, ${before.length} total records`)
  console.log(`Date range: ${beforeDates[0]} to ${beforeDates[beforeDates.length - 1]}`)

  const mockDates = beforeDates.filter(d => !REAL_DATES.includes(d))
  console.log(`\nMock dates to delete (${mockDates.length}):`, mockDates.join(', '))
  console.log(`Real dates to keep (${REAL_DATES.filter(d => beforeDates.includes(d)).length}):`, REAL_DATES.filter(d => beforeDates.includes(d)).join(', '))

  // Delete mock data
  console.log('\n🗑️  Deleting mock data...')

  for (const date of mockDates) {
    const { error } = await supabase
      .from('aged_accounts_history')
      .delete()
      .eq('snapshot_date', date)

    if (error) {
      console.error(`  Error deleting ${date}:`, error.message)
    } else {
      process.stdout.write('.')
    }
  }
  console.log(' Done!')

  // Verify
  const { data: after, error: afterError } = await supabase
    .from('aged_accounts_history')
    .select('snapshot_date, client_name, compliance_under_60')
    .order('snapshot_date', { ascending: true })

  if (afterError) {
    console.error('Error verifying:', afterError.message)
    process.exit(1)
  }

  const afterDates = [...new Set(after.map(r => r.snapshot_date))]
  console.log(`\n✅ After: ${afterDates.length} unique dates, ${after.length} total records`)
  console.log(`Remaining dates: ${afterDates.join(', ')}`)

  // Show summary by date
  console.log('\nData summary:')
  for (const date of afterDates) {
    const dateRecords = after.filter(r => r.snapshot_date === date)
    const avgCompliance = (dateRecords.reduce((sum, r) => sum + (r.compliance_under_60 || 0), 0) / dateRecords.length).toFixed(1)
    console.log(`  ${date}: ${dateRecords.length} clients, avg compliance: ${avgCompliance}%`)
  }
}

removeMockData()
  .then(() => {
    console.log('\n🎉 Mock data removal complete!')
    process.exit(0)
  })
  .catch(err => {
    console.error('\n❌ Error:', err.message)
    process.exit(1)
  })
