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

async function verify() {
  console.log('=== COMPREHENSIVE CLAIM VERIFICATION ===\n')

  // 1. TOTAL ATTRITION
  console.log('--- 1. TOTAL ATTRITION (Claim: $2.72M) ---')
  const { data: attrition } = await supabase
    .from('burc_attrition')
    .select('fiscal_year, client_name, revenue_at_risk')

  if (attrition) {
    const total = attrition.reduce((s, a) => s + (a.revenue_at_risk || 0), 0)
    const byYear = {}
    attrition.forEach(a => {
      if (!byYear[a.fiscal_year]) byYear[a.fiscal_year] = 0
      byYear[a.fiscal_year] += a.revenue_at_risk || 0
    })
    console.log(`Total: $${(total/1000).toFixed(0)}K = $${(total/1000000).toFixed(2)}M`)
    Object.entries(byYear).sort((a,b) => a[0] - b[0]).forEach(([y, v]) => {
      console.log(`  FY${y}: $${(v/1000).toFixed(0)}K`)
    })
  }

  // 2. OVERALL NPS
  console.log('\n--- 2. OVERALL NPS (Claim: -35, 199 responses) ---')
  const { data: nps } = await supabase
    .from('nps_responses')
    .select('score, client_name, feedback, comments')

  if (nps) {
    const total = nps.length
    const promoters = nps.filter(n => n.score >= 9).length
    const passives = nps.filter(n => n.score >= 7 && n.score < 9).length
    const detractors = nps.filter(n => n.score < 7).length
    const npsScore = Math.round((promoters - detractors) / total * 100)

    console.log(`Total responses: ${total}`)
    console.log(`Promoters (9-10): ${promoters} (${(promoters/total*100).toFixed(0)}%)`)
    console.log(`Passives (7-8): ${passives} (${(passives/total*100).toFixed(0)}%)`)
    console.log(`Detractors (0-6): ${detractors} (${(detractors/total*100).toFixed(0)}%)`)
    console.log(`NPS Score: ${npsScore}`)

    // 3. CLIENT NPS BREAKDOWN
    console.log('\n--- 3. CLIENT NPS TABLE ---')
    const byClient = {}
    nps.forEach(n => {
      const client = n.client_name || 'Unknown'
      if (!byClient[client]) byClient[client] = []
      byClient[client].push(n.score)
    })

    console.log('Client | Responses | Avg | Min | Max')
    Object.entries(byClient)
      .map(([client, scores]) => ({
        client,
        count: scores.length,
        avg: scores.reduce((a,b) => a+b, 0) / scores.length,
        min: Math.min(...scores),
        max: Math.max(...scores)
      }))
      .sort((a, b) => a.avg - b.avg)
      .forEach(c => {
        console.log(`${c.client.substring(0,25).padEnd(25)} | ${c.count.toString().padStart(2)} | ${c.avg.toFixed(1)} | ${c.min} | ${c.max}`)
      })

    // 4. FEEDBACK THEMES
    console.log('\n--- 4. FEEDBACK THEMES ---')
    const feedback = nps.map(n => (n.feedback || n.comments || '').toLowerCase()).join(' ')
    const themes = {
      'Product': ['subpar', 'outdated', 'legacy', 'old', 'upgrade', 'version', 'product'],
      'Support': ['support', 'ticket', 'response', 'slow', 'resolution', 'help'],
      'Delivery': ['delay', 'implementation', 'project', 'timeline', 'delivery'],
      'Value': ['expensive', 'cost', 'price', 'value', 'roi', 'money'],
      'Communication': ['communication', 'update', 'contact', 'hear', 'inform'],
      'Expertise': ['knowledge', 'expertise', 'experience', 'consultant', 'skill']
    }

    Object.entries(themes).forEach(([theme, keywords]) => {
      let count = 0
      keywords.forEach(kw => {
        const matches = (feedback.match(new RegExp(kw, 'gi')) || []).length
        count += matches
      })
      console.log(`${theme}: ${count} keyword matches`)
    })

    // 5. VERBATIM QUOTES CHECK
    console.log('\n--- 5. VERBATIM QUOTES CHECK ---')
    const saFeedback = nps.filter(n => n.client_name && n.client_name.includes('SA Health'))
    const waFeedback = nps.filter(n => n.client_name && n.client_name.includes('WA Health'))

    console.log('SA Health feedback samples:')
    saFeedback.slice(0, 5).forEach(n => {
      const fb = n.feedback || n.comments || 'No feedback'
      console.log(`  Score ${n.score}: "${fb.substring(0, 80)}..."`)
    })

    console.log('\nWA Health feedback samples:')
    waFeedback.slice(0, 5).forEach(n => {
      const fb = n.feedback || n.comments || 'No feedback'
      console.log(`  Score ${n.score}: "${fb.substring(0, 80)}..."`)
    })
  }

  // 6. ACTION ITEMS
  console.log('\n--- 6. ACTION ITEMS (Claim: 847 Open, 156 In Progress, 0 Completed, 174 Overdue) ---')
  const { data: actions } = await supabase
    .from('actions')
    .select('status')

  if (actions) {
    const byStatus = {}
    actions.forEach(a => {
      const status = a.status || 'unknown'
      if (!byStatus[status]) byStatus[status] = 0
      byStatus[status]++
    })
    console.log(`Total actions: ${actions.length}`)
    Object.entries(byStatus).forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`)
    })
  } else {
    console.log('No actions data or table does not exist')
  }

  // 7. MEETINGS
  console.log('\n--- 7. MEETINGS (Claim: 1,247 total, 312 with outcomes, 89 follow-ups) ---')
  const { data: meetings } = await supabase
    .from('unified_meetings')
    .select('meeting_notes, id')

  if (meetings) {
    const total = meetings.length
    const withNotes = meetings.filter(m => m.meeting_notes && m.meeting_notes.trim().length > 0).length
    console.log(`Total meetings: ${total}`)
    console.log(`With documented notes: ${withNotes} (${(withNotes/total*100).toFixed(0)}%)`)
  } else {
    console.log('No meetings data or table does not exist')
  }

  // 8. FINANCIAL ALERTS
  console.log('\n--- 8. FINANCIAL ALERTS (Claim: $14.05M upsell, $890K CPI, $3.2M churn, $2.1M renewal) ---')
  const { data: alerts } = await supabase
    .from('financial_alerts')
    .select('alert_type, financial_impact, status')
    .in('status', ['open', 'acknowledged'])

  if (alerts) {
    const byType = {}
    alerts.forEach(a => {
      const type = a.alert_type || 'unknown'
      if (!byType[type]) byType[type] = { count: 0, total: 0 }
      byType[type].count++
      byType[type].total += a.financial_impact || 0
    })
    console.log(`Total alerts: ${alerts.length}`)
    Object.entries(byType).forEach(([type, data]) => {
      console.log(`  ${type}: ${data.count} alerts, $${(data.total/1000).toFixed(0)}K total`)
    })
  } else {
    console.log('No financial alerts data')
  }

  // 9. GEOGRAPHIC REVENUE SPLIT
  console.log('\n--- 9. GEOGRAPHIC REVENUE SPLIT (Claim: AU 68%, SG 22%, Other Asia 10%) ---')
  const { data: revenue } = await supabase
    .from('burc_revenue_detail')
    .select('client_name, fy_total')
    .eq('fiscal_year', 2026)
    .eq('revenue_type', 'Maint')

  if (revenue) {
    const total = revenue.reduce((s, r) => s + r.fy_total, 0)

    // Categorize by region (rough mapping)
    const sgClients = ['Sing Health', 'MINDEF', 'Mount Alvernia', 'NCS', 'SLMC', 'Parkway']
    const otherAsiaClients = ['Waikato'] // NZ technically not Asia but grouped

    let sgTotal = 0
    let otherAsiaTotal = 0
    let auTotal = 0

    revenue.forEach(r => {
      const client = r.client_name || ''
      if (sgClients.some(sg => client.includes(sg))) {
        sgTotal += r.fy_total
      } else if (otherAsiaClients.some(oa => client.includes(oa))) {
        otherAsiaTotal += r.fy_total
      } else {
        auTotal += r.fy_total
      }
    })

    console.log(`Total Maintenance: $${(total/1000000).toFixed(2)}M`)
    console.log(`Australia: $${(auTotal/1000000).toFixed(2)}M (${(auTotal/total*100).toFixed(1)}%)`)
    console.log(`Singapore: $${(sgTotal/1000000).toFixed(2)}M (${(sgTotal/total*100).toFixed(1)}%)`)
    console.log(`Other: $${(otherAsiaTotal/1000000).toFixed(2)}M (${(otherAsiaTotal/total*100).toFixed(1)}%)`)
  }
}

verify()
