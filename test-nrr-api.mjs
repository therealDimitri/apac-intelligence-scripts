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

async function testNRR() {
  console.log('🔄 Testing NRR data calculation...\n')

  const startYear = 2019
  const endYear = 2025

  // Fetch all records with client, year, amount
  const pageSize = 1000
  let allData = []
  let page = 0
  let hasMore = true

  while (hasMore) {
    const { data, error } = await supabase
      .from('burc_historical_revenue_detail')
      .select('client_name, fiscal_year, amount_usd')
      .gte('fiscal_year', startYear - 1)  // Need prior year for NRR
      .lte('fiscal_year', endYear)
      .range(page * pageSize, (page + 1) * pageSize - 1)

    if (error) {
      console.error('Error:', error)
      break
    }

    allData = allData.concat(data || [])
    hasMore = data && data.length === pageSize
    page++
    process.stdout.write(`  Fetching page ${page}...\r`)
  }

  console.log(`📊 Fetched ${allData.length} records\n`)

  // Group by client and year
  const clientYearlyRevenue = {}

  allData.forEach(row => {
    const client = row.client_name
    if (!client) return

    if (!clientYearlyRevenue[client]) {
      clientYearlyRevenue[client] = {}
    }
    clientYearlyRevenue[client][row.fiscal_year] =
      (clientYearlyRevenue[client][row.fiscal_year] || 0) + (row.amount_usd || 0)
  })

  console.log(`👥 Total unique clients: ${Object.keys(clientYearlyRevenue).length}\n`)

  // Calculate NRR/GRR for each year
  console.log('📈 NRR/GRR Calculations:\n')
  console.log('Year | NRR    | GRR    | Expansion   | Contraction | Churn       | New Business')
  console.log('-----|--------|--------|-------------|-------------|-------------|-------------')

  const metrics = []

  for (let year = startYear; year <= endYear; year++) {
    let startingRevenue = 0
    let endingRevenue = 0
    let expansion = 0
    let contraction = 0
    let churn = 0
    let newBusiness = 0

    Object.entries(clientYearlyRevenue).forEach(([client, yearlyData]) => {
      const priorYear = yearlyData[year - 1] || 0
      const currentYear = yearlyData[year] || 0

      if (priorYear > 0) {
        startingRevenue += priorYear

        if (currentYear === 0) {
          churn += priorYear
        } else if (currentYear > priorYear) {
          expansion += currentYear - priorYear
          endingRevenue += currentYear
        } else {
          contraction += priorYear - currentYear
          endingRevenue += currentYear
        }
      } else if (currentYear > 0) {
        newBusiness += currentYear
      }
    })

    const nrr = startingRevenue > 0 ? Math.round((endingRevenue / startingRevenue) * 100 * 10) / 10 : 0
    const grr = startingRevenue > 0
      ? Math.round(((startingRevenue - churn - contraction) / startingRevenue) * 100 * 10) / 10
      : 0

    metrics.push({
      year,
      nrr: Math.min(nrr, 200),
      grr: Math.max(grr, 0),
      expansion: Math.round(expansion),
      contraction: Math.round(contraction),
      churn: Math.round(churn),
      newBusiness: Math.round(newBusiness),
    })

    console.log(`${year} | ${nrr.toFixed(1).padStart(5)}% | ${grr.toFixed(1).padStart(5)}% | $${(expansion/1e6).toFixed(2)}M    | $${(contraction/1e6).toFixed(2)}M    | $${(churn/1e6).toFixed(2)}M    | $${(newBusiness/1e6).toFixed(2)}M`)
  }

  console.log('\n📊 Summary:')
  console.log(`  Average NRR: ${(metrics.reduce((sum, m) => sum + m.nrr, 0) / metrics.length).toFixed(1)}%`)
  console.log(`  Average GRR: ${(metrics.reduce((sum, m) => sum + m.grr, 0) / metrics.length).toFixed(1)}%`)
  console.log(`  Latest NRR (${endYear}): ${metrics[metrics.length - 1]?.nrr || 0}%`)
  console.log(`  Latest GRR (${endYear}): ${metrics[metrics.length - 1]?.grr || 0}%`)

  // Return the same structure as the API
  const result = {
    metrics,
    summary: {
      avgNRR: Math.round((metrics.reduce((sum, m) => sum + m.nrr, 0) / metrics.length) * 10) / 10,
      avgGRR: Math.round((metrics.reduce((sum, m) => sum + m.grr, 0) / metrics.length) * 10) / 10,
      latestNRR: metrics[metrics.length - 1]?.nrr || 0,
      latestGRR: metrics[metrics.length - 1]?.grr || 0,
    },
  }

  console.log('\n✅ API Response Structure:')
  console.log(JSON.stringify(result, null, 2))
}

testNRR()
