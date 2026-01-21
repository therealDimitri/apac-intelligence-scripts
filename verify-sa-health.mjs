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
  // SA Health maintenance revenue
  const { data: saHealth } = await supabase
    .from('burc_revenue_detail')
    .select('fiscal_year, revenue_type, fy_total, client_name')
    .ilike('client_name', '%SA Health%')
    .eq('revenue_type', 'Maint')
    .order('fiscal_year')

  console.log('=== SA HEALTH MAINTENANCE REVENUE ===')
  if (saHealth) {
    saHealth.forEach(r => {
      console.log(`FY${r.fiscal_year}: ${r.client_name} - $${(r.fy_total/1000).toFixed(0)}K`)
    })
    const fy26 = saHealth.filter(r => r.fiscal_year === 2026)
    const total26 = fy26.reduce((s, r) => s + r.fy_total, 0)
    console.log(`\nFY2026 SA Health Maint Total: $${(total26/1000).toFixed(1)}K = $${(total26/1000000).toFixed(2)}M`)
  }

  // Total APAC maintenance revenue for comparison
  const { data: allMaint } = await supabase
    .from('burc_revenue_detail')
    .select('client_name, fy_total')
    .eq('fiscal_year', 2026)
    .eq('revenue_type', 'Maint')

  if (allMaint) {
    const total = allMaint.reduce((s, r) => s + r.fy_total, 0)
    console.log('\n=== TOTAL APAC MAINTENANCE FY2026 ===')
    console.log(`Total: $${(total/1000).toFixed(0)}K = $${(total/1000000).toFixed(2)}M`)

    // SA Health percentage
    const saTotal = allMaint.filter(r => r.client_name && r.client_name.includes('SA Health')).reduce((s, r) => s + r.fy_total, 0)
    console.log(`SA Health: $${(saTotal/1000).toFixed(0)}K (${((saTotal/total)*100).toFixed(1)}% of total)`)

    // Top 10 by maintenance
    const byClient = {}
    allMaint.forEach(r => {
      const client = r.client_name || 'Unknown'
      if (!byClient[client]) byClient[client] = 0
      byClient[client] += r.fy_total
    })

    console.log('\n=== TOP 10 MAINTENANCE CLIENTS FY2026 ===')
    Object.entries(byClient)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([client, amount], i) => {
        console.log(`${i+1}. ${client}: $${(amount/1000).toFixed(0)}K (${((amount/total)*100).toFixed(1)}%)`)
      })

    // Compare with Income Statement
    console.log('\n=== COMPARISON WITH INCOME STATEMENT ===')
    const incomeStatementTotal = 1146 + 1227 + 1282 + 1166 + 1247 + 1276 + 1212 + 3919 + 1291 + 1198 + 1429 + 1299
    console.log(`Income Statement Maint NR (ARR) Total: $${incomeStatementTotal}K = $${(incomeStatementTotal/1000).toFixed(2)}M`)
    console.log(`Database burc_revenue_detail Total: $${(total/1000).toFixed(0)}K = $${(total/1000000).toFixed(2)}M`)
    console.log(`\nIf SA Health = $6.8M and total = $${(incomeStatementTotal/1000).toFixed(1)}M`)
    console.log(`Then SA Health % = ${(6800/incomeStatementTotal*100).toFixed(1)}%`)
    console.log(`\nIf SA Health = 21% of $${(incomeStatementTotal/1000).toFixed(1)}M`)
    console.log(`Then SA Health = $${(incomeStatementTotal * 0.21 / 1000).toFixed(2)}M`)
  }
}

check()
