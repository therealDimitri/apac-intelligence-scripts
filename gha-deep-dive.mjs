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

async function investigate() {
  console.log('=== GHA DEEP DIVE ===\n')

  // 1. Revenue data for GHA
  console.log('--- REVENUE (burc_revenue_detail) ---')
  const { data: revenue } = await supabase
    .from('burc_revenue_detail')
    .select('*')
    .or('client_name.ilike.%GHA%,client_name.ilike.%Gippsland%')
    .order('fiscal_year')

  if (revenue && revenue.length > 0) {
    revenue.forEach(r => {
      console.log(`FY${r.fiscal_year} | ${r.client_name} | ${r.revenue_type} | $${(r.fy_total/1000).toFixed(0)}K`)
    })
  } else {
    console.log('No revenue data found')
  }

  // 2. NPS for GHA
  console.log('\n--- NPS (nps_responses) ---')
  const { data: nps } = await supabase
    .from('nps_responses')
    .select('*')
    .or('client_name.ilike.%GHA%,client_name.ilike.%Gippsland%')
    .order('created_at')

  if (nps && nps.length > 0) {
    nps.forEach(n => {
      const date = new Date(n.created_at).toLocaleDateString()
      const feedback = (n.feedback || n.comments || 'No feedback').substring(0, 100)
      console.log(`${date} | Score: ${n.score} | ${feedback}`)
    })
    const avg = nps.reduce((s, n) => s + n.score, 0) / nps.length
    console.log(`\nAverage: ${avg.toFixed(1)} (${nps.length} responses)`)
  } else {
    console.log('No NPS data found')
  }

  // 3. Financial alerts for GHA
  console.log('\n--- FINANCIAL ALERTS ---')
  const { data: alerts } = await supabase
    .from('financial_alerts')
    .select('*')
    .or('client_name.ilike.%GHA%,client_name.ilike.%Gippsland%')

  if (alerts && alerts.length > 0) {
    alerts.forEach(a => {
      console.log(`${a.alert_type} | ${a.title} | $${((a.financial_impact || 0)/1000).toFixed(0)}K | ${a.status}`)
    })
  } else {
    console.log('No financial alerts found')
  }

  // 4. Renewals for GHA
  console.log('\n--- RENEWALS ---')
  const { data: renewals } = await supabase
    .from('burc_renewal_calendar')
    .select('*')
    .or('clients.ilike.%GHA%,clients.ilike.%Gippsland%')

  if (renewals && renewals.length > 0) {
    renewals.forEach(r => {
      console.log(`${r.clients} | ${r.renewal_month}/${r.renewal_year} | $${((r.total_value_usd || 0)/1000).toFixed(0)}K`)
    })
  } else {
    console.log('No renewal data found')
  }

  // 5. All attrition to understand risk_type values
  console.log('\n--- ALL ATTRITION BY RISK_TYPE ---')
  const { data: allAttrition } = await supabase
    .from('burc_attrition')
    .select('client_name, fiscal_year, revenue_at_risk, risk_type')
    .order('revenue_at_risk', { ascending: false })

  if (allAttrition) {
    const riskTypes = {}
    allAttrition.forEach(a => {
      const rt = a.risk_type || 'null'
      if (!riskTypes[rt]) riskTypes[rt] = []
      riskTypes[rt].push({ client: a.client_name, amount: a.revenue_at_risk, fy: a.fiscal_year })
    })
    Object.entries(riskTypes).forEach(([type, items]) => {
      console.log(`\nRisk Type: "${type}"`)
      items.forEach(i => console.log(`  FY${i.fy} | ${i.client} | $${(i.amount/1000).toFixed(0)}K`))
    })
  }

  // 6. Check the source Excel data reference
  console.log('\n--- GHA ATTRITION FULL RECORDS ---')
  const { data: ghaAttrition } = await supabase
    .from('burc_attrition')
    .select('*')
    .ilike('client_name', '%GHA%')

  if (ghaAttrition) {
    ghaAttrition.forEach(a => {
      console.log(JSON.stringify(a, null, 2))
    })
  }
}

investigate()
