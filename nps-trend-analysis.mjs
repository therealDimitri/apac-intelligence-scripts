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

async function analyzeNPSTrends() {
  console.log('=== NPS TREND ANALYSIS ===\n')

  const { data: nps } = await supabase
    .from('nps_responses')
    .select('*')
    .order('created_at', { ascending: true })

  if (!nps || nps.length === 0) {
    console.log('No NPS data found')
    return
  }

  // Group by client with all responses
  const clientData = {}
  nps.forEach(n => {
    const client = n.client_name || 'Unknown'
    if (!clientData[client]) clientData[client] = []
    clientData[client].push({
      score: n.score,
      date: new Date(n.created_at),
      feedback: n.feedback || n.comments
    })
  })

  // Calculate trends per client
  console.log('=== CLIENT NPS TRENDS ===\n')
  console.log('Client | Responses | Average | Latest | Trend | Min | Max')
  console.log('-'.repeat(80))

  const clientSummaries = []

  Object.entries(clientData).forEach(([client, responses]) => {
    responses.sort((a, b) => a.date - b.date)

    const scores = responses.map(r => r.score)
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length
    const latest = scores[scores.length - 1]
    const min = Math.min(...scores)
    const max = Math.max(...scores)

    // Calculate trend (compare first half to second half if enough data)
    let trend = 'Stable'
    let trendValue = 0
    if (scores.length >= 2) {
      const midpoint = Math.floor(scores.length / 2)
      const firstHalf = scores.slice(0, midpoint)
      const secondHalf = scores.slice(midpoint)
      const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length
      const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length
      trendValue = secondAvg - firstAvg
      if (trendValue > 0.5) trend = '↑ Improving'
      else if (trendValue < -0.5) trend = '↓ Declining'
    }

    clientSummaries.push({
      client,
      responses: responses.length,
      avg,
      latest,
      trend,
      trendValue,
      min,
      max,
      allScores: scores
    })

    console.log(`${client.substring(0, 30).padEnd(30)} | ${responses.length.toString().padStart(2)} | ${avg.toFixed(1).padStart(4)} | ${latest.toString().padStart(2)} | ${trend.padEnd(12)} | ${min} | ${max}`)
  })

  // Overall regional trends
  console.log('\n\n=== REGIONAL NPS SUMMARY ===\n')

  // Group by quarter/year
  const byPeriod = {}
  nps.forEach(n => {
    const date = new Date(n.created_at)
    const quarter = `Q${Math.floor(date.getMonth() / 3) + 1} ${date.getFullYear()}`
    if (!byPeriod[quarter]) byPeriod[quarter] = []
    byPeriod[quarter].push(n.score)
  })

  console.log('Period | Responses | Avg Score | NPS Score | Promoters | Passives | Detractors')
  console.log('-'.repeat(90))

  Object.entries(byPeriod)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([period, scores]) => {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length
      const promoters = scores.filter(s => s >= 9).length
      const passives = scores.filter(s => s >= 7 && s < 9).length
      const detractors = scores.filter(s => s < 7).length
      const npsScore = Math.round((promoters - detractors) / scores.length * 100)

      console.log(`${period.padEnd(10)} | ${scores.length.toString().padStart(3)} | ${avg.toFixed(1).padStart(5)} | ${npsScore.toString().padStart(4)} | ${(promoters/scores.length*100).toFixed(0).padStart(4)}% | ${(passives/scores.length*100).toFixed(0).padStart(4)}% | ${(detractors/scores.length*100).toFixed(0).padStart(4)}%`)
    })

  // Overall stats
  const allScores = nps.map(n => n.score)
  const overallAvg = allScores.reduce((a, b) => a + b, 0) / allScores.length
  const promoters = allScores.filter(s => s >= 9).length
  const passives = allScores.filter(s => s >= 7 && s < 9).length
  const detractors = allScores.filter(s => s < 7).length
  const npsScore = Math.round((promoters - detractors) / allScores.length * 100)

  console.log('\n=== OVERALL METRICS ===\n')
  console.log(`Total Responses: ${allScores.length}`)
  console.log(`Average Score: ${overallAvg.toFixed(1)}`)
  console.log(`NPS Score: ${npsScore}`)
  console.log(`Promoters (9-10): ${promoters} (${(promoters/allScores.length*100).toFixed(0)}%)`)
  console.log(`Passives (7-8): ${passives} (${(passives/allScores.length*100).toFixed(0)}%)`)
  console.log(`Detractors (0-6): ${detractors} (${(detractors/allScores.length*100).toFixed(0)}%)`)

  // At-risk clients (declining or consistently low)
  console.log('\n\n=== AT-RISK CLIENTS (By Trend) ===\n')

  const atRisk = clientSummaries
    .filter(c => c.trend === '↓ Declining' || c.avg < 7)
    .sort((a, b) => a.trendValue - b.trendValue)

  atRisk.forEach(c => {
    const trendStr = c.trendValue !== 0 ? `(${c.trendValue > 0 ? '+' : ''}${c.trendValue.toFixed(1)})` : ''
    console.log(`${c.trend === '↓ Declining' ? '🔴' : '🟡'} ${c.client}`)
    console.log(`   Responses: ${c.responses} | Avg: ${c.avg.toFixed(1)} | Range: ${c.min}-${c.max} | Trend: ${c.trend} ${trendStr}`)
    console.log(`   Scores: [${c.allScores.join(', ')}]`)
    console.log('')
  })

  // Output for document
  console.log('\n\n=== FOR DOCUMENT (Markdown Table) ===\n')
  console.log('| Client | Responses | Avg NPS | Trend | Range | Risk Level |')
  console.log('|--------|-----------|---------|-------|-------|------------|')

  clientSummaries
    .sort((a, b) => a.avg - b.avg)
    .slice(0, 15)
    .forEach(c => {
      let risk = '🟢 Low'
      if (c.avg < 5 || c.trend === '↓ Declining') risk = '🔴 Critical'
      else if (c.avg < 7) risk = '🟠 High'
      else if (c.avg < 8) risk = '🟡 Elevated'

      console.log(`| ${c.client} | ${c.responses} | ${c.avg.toFixed(1)} | ${c.trend} | ${c.min}-${c.max} | ${risk} |`)
    })
}

analyzeNPSTrends()
