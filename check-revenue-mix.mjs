import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function verify() {
  console.log('Fetching revenue data...')

  // Fetch all revenue detail records
  let allData = []
  let page = 0
  const pageSize = 1000

  while (true) {
    const { data, error } = await supabase
      .from('burc_historical_revenue_detail')
      .select('fiscal_year, revenue_type, amount_usd')
      .gte('fiscal_year', 2019)
      .lte('fiscal_year', 2025)
      .range(page * pageSize, (page + 1) * pageSize - 1)

    if (error) {
      console.log('Error:', error.message)
      return
    }

    if (!data || data.length === 0) break
    allData = allData.concat(data)
    page++

    if (data.length < pageSize) break
  }

  console.log('Total records:', allData.length)

  // Aggregate by year and type
  const byYearType = {}
  allData.forEach(row => {
    const year = row.fiscal_year
    const type = row.revenue_type || 'Unknown'
    const amount = row.amount_usd || 0

    if (!byYearType[year]) byYearType[year] = {}
    byYearType[year][type] = (byYearType[year][type] || 0) + amount
  })

  // Map revenue types to categories
  function mapType(type) {
    const t = (type || '').toLowerCase()
    if (t.includes('license')) return 'Software'
    if (t.includes('professional') || t.includes('services')) return 'PS'
    if (t.includes('maint') || t.includes('support')) return 'Maintenance'
    if (t.includes('hardware')) return 'Hardware'
    return 'Other: ' + type
  }

  // Show mix for each year with mapped categories
  console.log('\n=== Revenue Mix by Year (Raw Types) ===')
  Object.keys(byYearType).sort().forEach(year => {
    const types = byYearType[year]
    const total = Object.values(types).reduce((sum, v) => sum + v, 0)
    console.log(`\nFY${year} (Total: $${(total/1000000).toFixed(2)}M):`)
    Object.entries(types).sort((a,b) => b[1] - a[1]).forEach(([type, amount]) => {
      const pct = ((amount / total) * 100).toFixed(1)
      const mapped = mapType(type)
      console.log(`  ${type} -> ${mapped}: $${(amount/1000000).toFixed(2)}M (${pct}%)`)
    })
  })

  // Show aggregated by mapped category
  console.log('\n=== Revenue Mix by Year (Mapped Categories) ===')
  Object.keys(byYearType).sort().forEach(year => {
    const types = byYearType[year]
    const total = Object.values(types).reduce((sum, v) => sum + v, 0)

    // Aggregate by mapped category
    const byCategory = {}
    Object.entries(types).forEach(([type, amount]) => {
      const cat = mapType(type)
      byCategory[cat] = (byCategory[cat] || 0) + amount
    })

    console.log(`\nFY${year} (Total: $${(total/1000000).toFixed(2)}M):`)
    Object.entries(byCategory).sort((a,b) => b[1] - a[1]).forEach(([cat, amount]) => {
      const pct = ((amount / total) * 100).toFixed(1)
      console.log(`  ${cat}: $${(amount/1000000).toFixed(2)}M (${pct}%)`)
    })
  })
}

verify().catch(console.error)
