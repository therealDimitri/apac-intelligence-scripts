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

// ACTUAL Sales Budget from Desktop Excel (14Jan2026 v0.1)
const SALES_TEAM = {
  CSE: {
    'Johnathan Salisbury': {
      weightedACV: 1269625,
      totalACV: 928123,
      accounts: ['WA Health', 'Western Health', 'Epworth', 'Barwon Health'],
      deals: [
        { opportunity: 'WA Health - Opal Term license and support renewal 2026', weighted: 1035754, total: 517877 },
        { opportunity: 'Western Health - Opal Renewal 2026', weighted: 90310, total: 75258 },
        { opportunity: 'Western Health - Point Cook Community Hospital Opal', weighted: 61238, total: 61238 },
        { opportunity: 'Western Health - Opal 22.1 Upgrade & Platform Migration', weighted: 51920, total: 173068 },
        { opportunity: 'WA Health WebPAS Alerts CS18946561', weighted: 10425, total: 34750 },
        { opportunity: 'Barwon Health - Services Retainer Q2 2026', weighted: 6820, total: 22735 },
        { opportunity: 'Epworth Opal Prof Services Retainer', weighted: 6865, total: 22883 }
      ]
    },
    'Laura Messing': {
      weightedACV: 2675260,
      totalACV: 5726997,
      accounts: ['SA Health', 'SA Health - CALHN', 'SA Health - NALHN', 'SA Health - SALHN', 'SA Health - WCHN'],
      deals: [
        { opportunity: 'SA Health - Renal', weighted: 900000, total: 1500000 },
        { opportunity: 'SA Health - Sunrise renewal + Wdx 2026', weighted: 378000, total: 945000 },
        { opportunity: 'SA Health - WCHN Sunrise Surgery License', weighted: 343829, total: 343830 },
        { opportunity: 'SA Health - 25.1 SCM and Pt Flow upgrade', weighted: 292293, total: 974309 },
        { opportunity: 'SA Health - Staff Augmentation Dec 2026', weighted: 190452, total: 634841 },
        { opportunity: 'SA Health - WCHN Sunrise Surgery Prof Services', weighted: 162300, total: 541000 },
        { opportunity: 'SA Health - Atalasoft renewal 2026', weighted: 82178, total: 41089 },
        { opportunity: 'SA Health - AIMS Integration Extension', weighted: 62064, total: 206880 },
        { opportunity: 'SA Health - Flowsheet consolidation', weighted: 55163, total: 183875 },
        { opportunity: 'SA Health - Patient Flow Interface Subscription', weighted: 55080, total: 27540 }
      ]
    },
    'New Asia CSE': {
      weightedACV: 2485028,
      totalACV: 7919399,
      accounts: ['MAH', 'GRMC', 'MINDEF', 'NCS', 'SLMC'],
      deals: [
        { opportunity: 'MAH CCR 0038 Hosting Services for SCM Migration to Azure', weighted: 432711, total: 1608654 },
        { opportunity: 'Mindef NCS CCR 0046 Upgrade SCM 25.1 Prof Services', weighted: 258367, total: 861223 },
        { opportunity: 'MAH CCR 0039 SCM Upgrade 25.1 on Azure Prof Services', weighted: 205954, total: 686513 },
        { opportunity: 'GRMC CureMD Oncology to Sunrise HL7 messages', weighted: 63748, total: 212492 },
        { opportunity: 'GRMC Working Diagnosis and NoteceTERA 2025', weighted: 61296, total: 188570 },
        { opportunity: 'GRMC Hosting Renewal 2026', weighted: 10622, total: 70815 }
      ]
    },
    'Tracey Bland': {
      weightedACV: 1928636,
      totalACV: 3335052,
      accounts: ['GHA', 'AWH', 'LRH', 'Vic HIE', 'Department of Health - Victoria'],
      deals: [
        { opportunity: 'GHA Sunrise EMRCH Agreement Extension 2026_AU', weighted: 175581, total: 389876 },
        { opportunity: 'GHA SCM 25.1 Upgrade PS', weighted: 123593, total: 497633 },
        { opportunity: 'AWH Opal Support Renewal and Term License 2026', weighted: 89090, total: 74242 },
        { opportunity: 'LRH Clinical documentation (WDx)', weighted: 88562, total: 267281 },
        { opportunity: 'AWH Opal Upgrade 2026', weighted: 70277, total: 234255 },
        { opportunity: 'GHA MS and PS 1500hrs Services', weighted: 33896, total: 134362 },
        { opportunity: 'GHA OP eReferral Integration', weighted: 29219, total: 97395 },
        { opportunity: 'GHA IPS for Outpatient Clinical functionality', weighted: 27502, total: 91673 }
      ]
    }
  },
  CAM: {
    'Anu Pradhan': {
      weightedACV: 4665036,
      totalACV: 8656107,
      region: 'AUS & NZ',
      accounts: ['AWH', 'GHA', 'Vic HIE', 'SA Health', 'WA Health', 'Western Health', 'Barwon', 'Epworth', 'LRH']
    },
    'Nikki Wei': {
      weightedACV: 2485028,
      totalACV: 7919399,
      region: 'ASIA',
      accounts: ['MAH', 'GRMC', 'MINDEF', 'NCS', 'SLMC', 'Sing Health', 'NUHS', 'Synapxe']
    }
  }
}

const CSE_GRAND_TOTAL = 8358549
const CAM_GRAND_TOTAL = 7150064

function findOwner(clientName) {
  const clientLower = clientName.toLowerCase()

  // Check CSE team
  for (const [owner, data] of Object.entries(SALES_TEAM.CSE)) {
    for (const account of data.accounts) {
      if (clientLower.includes(account.toLowerCase()) || account.toLowerCase().includes(clientLower)) {
        return { name: owner, role: 'CSE', weighted: data.weightedACV, total: data.totalACV }
      }
    }
  }

  // Check CAM team
  for (const [owner, data] of Object.entries(SALES_TEAM.CAM)) {
    for (const account of data.accounts) {
      if (clientLower.includes(account.toLowerCase()) || account.toLowerCase().includes(clientLower)) {
        return { name: owner, role: 'CAM', weighted: data.weightedACV, total: data.totalACV, region: data.region }
      }
    }
  }

  return { name: 'Unassigned', role: 'N/A', weighted: 0, total: 0 }
}

function formatMoney(val) {
  if (!val) return '$0'
  const absVal = Math.abs(val)
  if (absVal >= 1000000) return '$' + (val / 1000000).toFixed(2) + 'M'
  if (absVal >= 1000) return '$' + (val / 1000).toFixed(0) + 'K'
  return '$' + val.toFixed(0)
}

async function analyzeWithRealPipeline() {
  console.log('============================================================')
  console.log('   TURNAROUND PLAN WITH REAL PIPELINE DATA (14 Jan 2026)')
  console.log('============================================================\n')

  // Fetch all relevant data
  const { data: nps } = await supabase.from('nps_responses').select('*')
  const { data: attrition } = await supabase.from('burc_attrition').select('*')
  const { data: renewals } = await supabase.from('burc_renewal_calendar').select('*')
  const { data: revenue } = await supabase.from('burc_revenue_detail').select('*').eq('fiscal_year', 2026).eq('revenue_type', 'Maint')
  const { data: alerts } = await supabase.from('financial_alerts').select('*').in('status', ['open', 'acknowledged'])

  // Build client profiles
  const clientProfiles = {}

  revenue?.forEach(r => {
    const client = r.client_name || 'Unknown'
    if (!clientProfiles[client]) clientProfiles[client] = { revenue: 0, nps: [], attrition: 0 }
    clientProfiles[client].revenue += r.fy_total || 0
  })

  nps?.forEach(n => {
    const client = n.client_name || 'Unknown'
    if (!clientProfiles[client]) clientProfiles[client] = { revenue: 0, nps: [], attrition: 0 }
    clientProfiles[client].nps.push(n.score)
  })

  attrition?.forEach(a => {
    const client = a.client_name || 'Unknown'
    if (!clientProfiles[client]) clientProfiles[client] = { revenue: 0, nps: [], attrition: 0 }
    clientProfiles[client].attrition += a.revenue_at_risk || 0
  })

  // === 1. SALES TEAM PIPELINE OVERVIEW ===
  console.log('=== 1. 2026 SALES BUDGET TARGETS (from Oracle) ===\n')

  console.log('CSE TEAM (Client Success Engineers):')
  console.log('─'.repeat(60))
  let cseTotal = 0
  Object.entries(SALES_TEAM.CSE).forEach(([name, data]) => {
    cseTotal += data.weightedACV
    console.log(`${name}`)
    console.log(`  Weighted ACV Target: ${formatMoney(data.weightedACV)}`)
    console.log(`  Total ACV Pipeline:  ${formatMoney(data.totalACV)}`)
    console.log(`  Accounts: ${data.accounts.join(', ')}`)
    console.log(`  Top Deals:`)
    data.deals.slice(0, 3).forEach(d => {
      console.log(`    • ${d.opportunity.substring(0, 50)}... ${formatMoney(d.weighted)}`)
    })
    console.log('')
  })
  console.log(`CSE GRAND TOTAL: ${formatMoney(CSE_GRAND_TOTAL)}`)

  console.log('\n\nCAM TEAM (Client Account Managers):')
  console.log('─'.repeat(60))
  Object.entries(SALES_TEAM.CAM).forEach(([name, data]) => {
    console.log(`${name} (${data.region})`)
    console.log(`  Weighted ACV Target: ${formatMoney(data.weightedACV)}`)
    console.log(`  Total ACV Pipeline:  ${formatMoney(data.totalACV)}`)
    console.log(`  Accounts: ${data.accounts.join(', ')}`)
    console.log('')
  })
  console.log(`CAM GRAND TOTAL: ${formatMoney(CAM_GRAND_TOTAL)}`)

  // === 2. PIPELINE VS ATTRITION REALITY ===
  console.log('\n\n=== 2. PIPELINE VS ATTRITION - THE HARD NUMBERS ===\n')

  const totalAttrition = attrition?.reduce((s, a) => s + (a.revenue_at_risk || 0), 0) || 0
  const singHealthAttrition = attrition?.filter(a => a.client_name?.toLowerCase().includes('sing')).reduce((s, a) => s + (a.revenue_at_risk || 0), 0) || 0

  console.log('ATTRITION (Confirmed/Expected):')
  console.log(`  Total Attrition (2025-2028): ${formatMoney(totalAttrition)}`)
  console.log(`  Sing Health alone: ${formatMoney(singHealthAttrition)} (${(singHealthAttrition/totalAttrition*100).toFixed(0)}%)`)

  console.log('\nPIPELINE (2026 Targets):')
  console.log(`  CSE Weighted ACV: ${formatMoney(CSE_GRAND_TOTAL)}`)
  console.log(`  CAM Weighted ACV: ${formatMoney(CAM_GRAND_TOTAL)}`)
  console.log(`  Total Pipeline Target: ${formatMoney(CSE_GRAND_TOTAL + CAM_GRAND_TOTAL)}`)

  const gap = totalAttrition - CSE_GRAND_TOTAL
  console.log('\nTHE MATH:')
  if (gap > 0) {
    console.log(`  ❌ SHORTFALL: ${formatMoney(gap)}`)
    console.log(`     CSE pipeline doesn't cover attrition.`)
    console.log(`     Need ${(gap / CSE_GRAND_TOTAL * 100).toFixed(0)}% more pipeline or reduce attrition.`)
  } else {
    console.log(`  ✅ CSE pipeline exceeds attrition by: ${formatMoney(Math.abs(gap))}`)
    console.log(`     BUT: This assumes 100% conversion. Realistic: 30-40%.`)
    console.log(`     At 35% conversion: ${formatMoney(CSE_GRAND_TOTAL * 0.35)} actual`)
  }

  // === 3. OWNER ACCOUNTABILITY - AT RISK CLIENTS ===
  console.log('\n\n=== 3. AT-RISK CLIENTS BY OWNER ===\n')

  const atRiskClients = Object.entries(clientProfiles)
    .filter(([_, data]) => {
      const avgNps = data.nps.length > 0 ? data.nps.reduce((a,b) => a+b, 0) / data.nps.length : null
      return (avgNps && avgNps < 7) || data.attrition > 0
    })
    .map(([client, data]) => {
      const avgNps = data.nps.length > 0 ? data.nps.reduce((a,b) => a+b, 0) / data.nps.length : null
      const owner = findOwner(client)
      return { client, avgNps, revenue: data.revenue, attrition: data.attrition, owner: owner.name, ownerRole: owner.role }
    })
    .sort((a, b) => (b.attrition || 0) - (a.attrition || 0))

  // Group by owner
  const byOwner = {}
  atRiskClients.forEach(c => {
    if (!byOwner[c.owner]) byOwner[c.owner] = { clients: [], totalAtRisk: 0, totalRevenue: 0 }
    byOwner[c.owner].clients.push(c)
    byOwner[c.owner].totalAtRisk += c.attrition || 0
    byOwner[c.owner].totalRevenue += c.revenue || 0
  })

  Object.entries(byOwner).forEach(([owner, data]) => {
    const ownerData = SALES_TEAM.CSE[owner] || SALES_TEAM.CAM[owner]
    const target = ownerData?.weightedACV || 0
    console.log(`📋 ${owner.toUpperCase()}`)
    console.log(`   Pipeline Target: ${formatMoney(target)}`)
    console.log(`   At-Risk Revenue: ${formatMoney(data.totalAtRisk)}`)
    console.log(`   Coverage Ratio: ${target > 0 ? (target / data.totalAtRisk).toFixed(1) : 'N/A'}x`)
    console.log('   Clients:')
    data.clients.forEach(c => {
      const icon = c.attrition > 500000 ? '🔴' : c.avgNps && c.avgNps < 5 ? '🟠' : '🟡'
      const npsStr = c.avgNps ? `NPS ${c.avgNps.toFixed(1)}` : 'No NPS'
      const attrStr = c.attrition > 0 ? `, ${formatMoney(c.attrition)} attrition` : ''
      console.log(`     ${icon} ${c.client}: ${npsStr}${attrStr}`)
    })
    console.log('')
  })

  // === 4. SPECIFIC ACTIONS BY OWNER WITH PIPELINE CONTEXT ===
  console.log('\n=== 4. PRIORITISED ACTIONS BY OWNER ===\n')

  const ownerActions = {
    'Laura Messing': {
      target: formatMoney(SALES_TEAM.CSE['Laura Messing'].weightedACV),
      risk: 'SA Health NPS 6.1 threatens $2.67M pipeline',
      actions: [
        { week: 'THIS WEEK', task: 'SA Health Executive Meeting', detail: 'NPS 6.1 puts $2.67M weighted ACV at risk. Without recovery, pipeline is unrealistic.' },
        { week: 'THIS WEEK', task: 'SA Health Renal Deal ($900K weighted)', detail: 'Largest single deal. Confirm status and blockers.' },
        { week: 'THIS MONTH', task: 'WCHN Sunrise Surgery ($343K + $162K)', detail: 'Combined $505K weighted. Ensure delivery confidence.' }
      ]
    },
    'Johnathan Salisbury': {
      target: formatMoney(SALES_TEAM.CSE['Johnathan Salisbury'].weightedACV),
      risk: 'WA Health renewal ($1.03M) is 82% of target',
      actions: [
        { week: 'THIS WEEK', task: 'WA Health Renewal Defense', detail: '$1.03M weighted ACV - this single deal is 82% of target. Cannot lose.' },
        { week: 'THIS WEEK', task: 'Western Health Renewal + Point Cook', detail: '$152K combined. Close while WA Health progresses.' },
        { week: 'THIS MONTH', task: 'Pipeline Diversification', detail: 'Too concentrated in 2 clients. Identify expansion opportunities.' }
      ]
    },
    'New Asia CSE': {
      target: formatMoney(SALES_TEAM.CSE['New Asia CSE'].weightedACV),
      risk: 'Sing Health departure ($1.69M) not in pipeline',
      actions: [
        { week: 'THIS WEEK', task: 'Sing Health Graceful Exit', detail: '$1.69M attrition is NOT offset in current pipeline. Focus on minimising reputational damage.' },
        { week: 'THIS WEEK', task: 'MAH Azure Migration ($432K)', detail: 'Largest Asia deal. This must close to offset regional losses.' },
        { week: 'THIS MONTH', task: 'MINDEF Upgrade ($258K)', detail: 'Government contract - stable revenue. Ensure delivery excellence.' }
      ]
    },
    'Tracey Bland': {
      target: formatMoney(SALES_TEAM.CSE['Tracey Bland'].weightedACV),
      risk: 'GHA extension ($175K) critical for regional presence',
      actions: [
        { week: 'THIS WEEK', task: 'GHA EMRCH Extension', detail: '$175K weighted. Critical for Victorian market credibility.' },
        { week: 'THIS WEEK', task: 'AWH Renewal + Upgrade ($159K)', detail: 'Renewal ($89K) + Upgrade ($70K). Package deal recommended.' },
        { week: 'THIS MONTH', task: 'LRH WDx ($88K)', detail: 'Clinical documentation deal. Reference site opportunity.' }
      ]
    },
    'Anu Pradhan': {
      target: formatMoney(SALES_TEAM.CAM['Anu Pradhan'].weightedACV),
      risk: 'CAM for all Australian at-risk accounts',
      actions: [
        { week: 'THIS WEEK', task: 'SA Health + Laura Messing Alignment', detail: 'Support CSE with executive relationships. Your network is critical.' },
        { week: 'THIS WEEK', task: 'Vic HIE Deals ($1.2M+ total)', detail: 'Multiple POC 010 deals across Victorian health services. Coordinate closely with Tracey.' },
        { week: 'THIS MONTH', task: 'AWH + GHA Account Health', detail: 'Both accounts have significant pipeline. Ensure CSE support is adequate.' }
      ]
    },
    'Nikki Wei': {
      target: formatMoney(SALES_TEAM.CAM['Nikki Wei'].weightedACV),
      risk: 'Sing Health exit impacts Asia reputation',
      actions: [
        { week: 'THIS WEEK', task: 'Singapore Market Damage Control', detail: 'Sing Health departure will be known. Proactive comms to NUHS, Synapxe.' },
        { week: 'THIS WEEK', task: 'Synapxe NEHR RFP ($2M+ opportunity)', detail: 'Currently "Omitted" - why? This could replace Sing Health revenue.' },
        { week: 'THIS MONTH', task: 'Philippines Expansion', detail: 'SLMC, Chong Hua - grow alternative markets to offset SG risk.' }
      ]
    }
  }

  Object.entries(ownerActions).forEach(([owner, data]) => {
    console.log(`${'═'.repeat(60)}`)
    console.log(`👤 ${owner}`)
    console.log(`   TARGET: ${data.target}`)
    console.log(`   ⚠️  RISK: ${data.risk}`)
    console.log('─'.repeat(60))
    data.actions.forEach(a => {
      const icon = a.week === 'THIS WEEK' ? '🔴' : '🟡'
      console.log(`   ${icon} [${a.week}] ${a.task}`)
      console.log(`      ${a.detail}`)
    })
    console.log('')
  })

  // === 5. UPSELL OPPORTUNITIES BY OWNER ===
  console.log('\n=== 5. UPSELL OPPORTUNITIES (Untapped Revenue) ===\n')

  const upsells = alerts?.filter(a => a.alert_type === 'upsell_opportunity') || []
  const totalUpsell = upsells.reduce((s, u) => s + (u.financial_impact || 0), 0)

  console.log(`TOTAL UPSELL POTENTIAL: ${formatMoney(totalUpsell)}\n`)

  const upsellByOwner = {}
  upsells.forEach(u => {
    const owner = findOwner(u.client_name || 'Unknown')
    if (!upsellByOwner[owner.name]) upsellByOwner[owner.name] = { opportunities: [], total: 0 }
    upsellByOwner[owner.name].opportunities.push(u)
    upsellByOwner[owner.name].total += u.financial_impact || 0
  })

  Object.entries(upsellByOwner)
    .sort((a, b) => b[1].total - a[1].total)
    .forEach(([owner, data]) => {
      console.log(`${owner}: ${formatMoney(data.total)} in upsell potential`)
      data.opportunities.slice(0, 3).forEach(u => {
        console.log(`  💰 ${u.client_name}: ${formatMoney(u.financial_impact)} - ${u.title}`)
      })
      console.log('')
    })

  // === 6. EXECUTIVE SUMMARY ===
  console.log('\n' + '═'.repeat(60))
  console.log('                 EXECUTIVE TURNAROUND SUMMARY')
  console.log('═'.repeat(60) + '\n')

  console.log('📊 THE NUMBERS:')
  console.log(`   CSE Pipeline (weighted): ${formatMoney(CSE_GRAND_TOTAL)}`)
  console.log(`   Attrition to offset:     ${formatMoney(totalAttrition)}`)
  console.log(`   Net position:            ${formatMoney(CSE_GRAND_TOTAL - totalAttrition)}`)
  console.log(`   Untapped upsells:        ${formatMoney(totalUpsell)}`)
  console.log('')

  console.log('🎯 THIS WEEK PRIORITIES:')
  console.log('   1. Laura Messing → SA Health executive intervention')
  console.log('   2. Johnathan Salisbury → WA Health renewal lock-in ($1.03M)')
  console.log('   3. New Asia CSE → MAH Azure migration ($432K)')
  console.log('   4. Nikki Wei → Synapxe NEHR RFP reactivation ($2M+)')
  console.log('')

  console.log('⚠️  CRITICAL RISKS:')
  console.log('   • Sing Health ($1.69M) - GONE, focus on graceful exit')
  console.log('   • SA Health - 21% of maintenance, NPS 6.1')
  console.log('   • WA Health - 82% of Johnathan\'s target in one deal')
  console.log('   • Pipeline assumes 100% conversion (realistic: 35%)')
  console.log('')

  console.log('✅ SUCCESS METRICS:')
  console.log('   • SA Health NPS ≥ 7.5 within 90 days')
  console.log('   • WA Health renewal signed Q1')
  console.log('   • Zero additional attrition announcements')
  console.log('   • 40%+ pipeline conversion rate')
}

analyzeWithRealPipeline()
