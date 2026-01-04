import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envContent = fs.readFileSync(join(__dirname, '../.env.local'), 'utf8')
const env = {}
envContent.split('\n').forEach(line => {
  const [key, ...value] = line.split('=')
  if (key) env[key.trim()] = value.join('=').trim().replace(/^['"]|['"]$/g, '')
})

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function fetchAllRecords() {
  const pageSize = 1000 // Supabase default limit
  let allData = []
  let page = 0
  let hasMore = true

  while (hasMore) {
    const { data, error } = await supabase
      .from('burc_historical_revenue_detail')
      .select('fiscal_year, revenue_type, amount_usd')
      .range(page * pageSize, (page + 1) * pageSize - 1)
      .order('fiscal_year')

    if (error) {
      console.error('Error fetching page', page, error)
      break
    }

    allData = allData.concat(data || [])
    hasMore = data && data.length === pageSize
    page++
    console.log(`  Fetched page ${page}: ${data?.length || 0} records`)
  }

  return allData
}

async function checkRevenue() {
  console.log('🔄 Fetching all revenue records...')
  const data = await fetchAllRecords()

  if (!data.length) {
    console.error('No data found')
    return
  }

  // Aggregate by year
  const yearlyTotals = {}
  const yearlyByType = {}

  data.forEach(r => {
    const year = r.fiscal_year
    const type = r.revenue_type || 'Unknown'
    const amount = r.amount_usd || 0

    if (!yearlyTotals[year]) yearlyTotals[year] = 0
    yearlyTotals[year] += amount

    if (!yearlyByType[year]) yearlyByType[year] = {}
    if (!yearlyByType[year][type]) yearlyByType[year][type] = 0
    yearlyByType[year][type] += amount
  })

  console.log('📊 Revenue by Fiscal Year (USD):')
  console.log('='.repeat(60))

  Object.entries(yearlyTotals)
    .sort(([a], [b]) => parseInt(a) - parseInt(b))
    .forEach(([year, total]) => {
      console.log(`\n  ${year}: $${(total / 1e6).toFixed(2)}M`)

      // Show breakdown
      Object.entries(yearlyByType[year] || {})
        .sort(([,a], [,b]) => b - a)
        .forEach(([type, amount]) => {
          console.log(`    - ${type}: $${(amount / 1e6).toFixed(2)}M`)
        })
    })

  console.log('\n📈 Total records:', data.length)
  console.log('💰 Grand total:', '$' + (Object.values(yearlyTotals).reduce((a,b) => a + b, 0) / 1e6).toFixed(2) + 'M')
}

checkRevenue()
