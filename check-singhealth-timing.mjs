import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function check() {
  const { data } = await supabase
    .from('burc_attrition')
    .select('*')
    .order('fiscal_year')
    .order('revenue_at_risk', { ascending: false })

  console.log('=== ALL ATTRITION BY YEAR ===\n')

  const byYear = {}
  data.forEach(d => {
    const year = d.fiscal_year
    if (!byYear[year]) byYear[year] = []
    byYear[year].push(d)
  })

  Object.entries(byYear).sort((a,b) => a[0] - b[0]).forEach(([year, items]) => {
    const total = items.reduce((s, i) => s + (i.revenue_at_risk || 0), 0)
    console.log(`\nFY${year}: $${(total/1000).toFixed(0)}K total`)
    console.log('-'.repeat(50))
    items.forEach(i => {
      console.log(`  ${i.client_name}: $${(i.revenue_at_risk/1000).toFixed(0)}K`)
    })
  })
}

check()
