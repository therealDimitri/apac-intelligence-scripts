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

// Sales team ownership from Sales Budget Excel
const SALES_TEAM = {
  CSE: {
    'Johnathan Salisbury': {
      weightedTarget: 1270000,
      accounts: ['WA Health', 'Western Health', 'Epworth', 'Barwon Health', 'Eastern Health', 'Monash Health'],
      deals: [
        { client: 'WA Health', opportunity: 'Enterprise Extension', value: 2500000, weighted: 750000 },
        { client: 'Western Health', opportunity: 'EMR Expansion', value: 1200000, weighted: 360000 },
        { client: 'Epworth', opportunity: 'Analytics Module', value: 400000, weighted: 160000 }
      ]
    },
    'Laura Messing': {
      weightedTarget: 2680000,
      accounts: ['SA Health', 'SA Health - CALHN', 'SA Health - NALHN', 'SA Health - SALHN', 'SA Health - WCHN'],
      deals: [
        { client: 'SA Health', opportunity: 'EPAS Expansion', value: 3500000, weighted: 1400000 },
        { client: 'SA Health', opportunity: 'Integration Services', value: 2000000, weighted: 800000 },
        { client: 'SA Health', opportunity: 'Training Program', value: 600000, weighted: 480000 }
      ]
    },
    'Tracey Bland': {
      weightedTarget: 1930000,
      accounts: ['NSW Health', 'Hunter New England', 'Mid North Coast', 'Northern NSW'],
      deals: [
        { client: 'NSW Health', opportunity: 'Regional Rollout', value: 2800000, weighted: 840000 },
        { client: 'Hunter New England', opportunity: 'EMR Upgrade', value: 1500000, weighted: 600000 }
      ]
    },
    'New Asia CSE': {
      weightedTarget: 2490000,
      accounts: ['Sing Health', 'NUHS', 'TTSH', 'GHA', 'AWH'],
      deals: [
        { client: 'GHA', opportunity: 'Phase 2 Expansion', value: 4000000, weighted: 1200000 },
        { client: 'AWH', opportunity: 'Enterprise Contract', value: 3500000, weighted: 1050000 }
      ]
    }
  },
  CAM: {
    'Anu Pradhan': {
      weightedTarget: 5860000,
      accounts: ['AWH', 'GHA', 'Vic HIE', 'AHHA', 'Austin Health'],
      deals: [
        { client: 'AWH', opportunity: 'Major Enterprise Deal', value: 8000000, weighted: 2400000 },
        { client: 'GHA', opportunity: 'Full Implementation', value: 6000000, weighted: 1800000 },
        { client: 'Vic HIE', opportunity: 'HIE Platform', value: 4000000, weighted: 1200000 }
      ]
    },
    'Nikki Wei': {
      weightedTarget: 2490000,
      accounts: ['NUHS', 'TTSH', 'CGH', 'NUH', 'Alexandra Hospital'],
      deals: [
        { client: 'NUHS', opportunity: 'Platform Extension', value: 3500000, weighted: 1050000 },
        { client: 'CGH', opportunity: 'Digital Transformation', value: 2800000, weighted: 840000 }
      ]
    }
  }
}

function findOwner(clientName) {
  const clientLower = clientName.toLowerCase()

  // Check CSE team
  for (const [owner, data] of Object.entries(SALES_TEAM.CSE)) {
    for (const account of data.accounts) {
      if (clientLower.includes(account.toLowerCase()) || account.toLowerCase().includes(clientLower)) {
        return { name: owner, role: 'CSE', target: data.weightedTarget }
      }
    }
  }

  // Check CAM team
  for (const [owner, data] of Object.entries(SALES_TEAM.CAM)) {
    for (const account of data.accounts) {
      if (clientLower.includes(account.toLowerCase()) || account.toLowerCase().includes(clientLower)) {
        return { name: owner, role: 'CAM', target: data.weightedTarget }
      }
    }
  }

  return { name: 'Unassigned', role: 'N/A', target: 0 }
}

function formatMoney(val) {
  if (!val) return '$0'
  const absVal = Math.abs(val)
  if (absVal >= 1000000) return '$' + (val / 1000000).toFixed(2) + 'M'
  if (absVal >= 1000) return '$' + (val / 1000).toFixed(0) + 'K'
  return '$' + val.toFixed(0)
}

async function analyzeWithOwners() {
  console.log('============================================================')
  console.log('      TURNAROUND PLAN WITH SALES TEAM ASSIGNMENTS')
  console.log('============================================================\n')

  // Fetch all relevant data
  const { data: nps } = await supabase.from('nps_responses').select('*')
  const { data: attrition } = await supabase.from('burc_attrition').select('*')
  const { data: renewals } = await supabase.from('burc_renewal_calendar').select('*')
  const { data: revenue } = await supabase.from('burc_revenue_detail').select('*').eq('fiscal_year', 2026).eq('revenue_type', 'Maint')
  const { data: alerts } = await supabase.from('financial_alerts').select('*').in('status', ['open', 'acknowledged'])

  // Build client profiles with owners
  const clientProfiles = {}

  // Add revenue data
  revenue?.forEach(r => {
    const client = r.client_name || 'Unknown'
    if (!clientProfiles[client]) clientProfiles[client] = { revenue: 0, nps: [], attrition: 0, renewal: null, alerts: [] }
    clientProfiles[client].revenue += r.fy_total || 0
  })

  // Add NPS data
  nps?.forEach(n => {
    const client = n.client_name || 'Unknown'
    if (!clientProfiles[client]) clientProfiles[client] = { revenue: 0, nps: [], attrition: 0, renewal: null, alerts: [] }
    clientProfiles[client].nps.push(n.score)
  })

  // Add attrition data
  attrition?.forEach(a => {
    const client = a.client_name || 'Unknown'
    if (!clientProfiles[client]) clientProfiles[client] = { revenue: 0, nps: [], attrition: 0, renewal: null, alerts: [] }
    clientProfiles[client].attrition += a.revenue_at_risk || 0
  })

  // Add renewal data
  renewals?.forEach(r => {
    const client = r.clients || 'Unknown'
    if (!clientProfiles[client]) clientProfiles[client] = { revenue: 0, nps: [], attrition: 0, renewal: null, alerts: [] }
    clientProfiles[client].renewal = { date: new Date(r.renewal_year, r.renewal_month - 1, 1), value: r.total_value_usd }
  })

  // Add alert data
  alerts?.forEach(a => {
    const client = a.client_name || 'Unknown'
    if (!clientProfiles[client]) clientProfiles[client] = { revenue: 0, nps: [], attrition: 0, renewal: null, alerts: [] }
    clientProfiles[client].alerts.push(a)
  })

  // === 1. SALES TEAM OVERVIEW ===
  console.log('=== 1. SALES TEAM OVERVIEW ===\n')

  console.log('CSE TEAM (Client Success Engineers):')
  Object.entries(SALES_TEAM.CSE).forEach(([name, data]) => {
    console.log(`  ${name}`)
    console.log(`    Target: ${formatMoney(data.weightedTarget)} weighted ACV`)
    console.log(`    Accounts: ${data.accounts.join(', ')}`)
  })

  console.log('\nCAM TEAM (Client Account Managers):')
  Object.entries(SALES_TEAM.CAM).forEach(([name, data]) => {
    console.log(`  ${name}`)
    console.log(`    Target: ${formatMoney(data.weightedTarget)} weighted ACV`)
    console.log(`    Accounts: ${data.accounts.join(', ')}`)
  })

  // === 2. AT-RISK CLIENTS WITH OWNERS ===
  console.log('\n\n=== 2. AT-RISK CLIENTS - OWNER ACCOUNTABILITY ===\n')

  const atRiskClients = Object.entries(clientProfiles)
    .filter(([_, data]) => {
      const avgNps = data.nps.length > 0 ? data.nps.reduce((a,b) => a+b, 0) / data.nps.length : null
      return (avgNps && avgNps < 7) || data.attrition > 0
    })
    .map(([client, data]) => {
      const avgNps = data.nps.length > 0 ? data.nps.reduce((a,b) => a+b, 0) / data.nps.length : null
      const owner = findOwner(client)
      return {
        client,
        avgNps,
        revenue: data.revenue,
        attrition: data.attrition,
        renewal: data.renewal,
        owner: owner.name,
        ownerRole: owner.role,
        urgency: data.attrition > 500000 ? 'CRITICAL' : avgNps && avgNps < 5 ? 'HIGH' : 'MEDIUM'
      }
    })
    .sort((a, b) => (b.attrition || 0) - (a.attrition || 0))

  console.log('CRITICAL ACCOUNTS REQUIRING IMMEDIATE ACTION:\n')
  atRiskClients.forEach(c => {
    const icon = c.urgency === 'CRITICAL' ? '🔴' : c.urgency === 'HIGH' ? '🟠' : '🟡'
    const npsStr = c.avgNps ? c.avgNps.toFixed(1) : 'N/A'
    const revStr = formatMoney(c.revenue)
    const attrStr = c.attrition > 0 ? ` | Attrition: ${formatMoney(c.attrition)}` : ''
    console.log(`${icon} ${c.client}`)
    console.log(`   Owner: ${c.owner} (${c.ownerRole})`)
    console.log(`   NPS: ${npsStr} | Revenue: ${revStr}${attrStr}`)
    console.log('')
  })

  // === 3. OWNER WORKLOAD & RISK EXPOSURE ===
  console.log('\n=== 3. OWNER WORKLOAD & RISK EXPOSURE ===\n')

  const ownerRisk = {}
  atRiskClients.forEach(c => {
    if (!ownerRisk[c.owner]) ownerRisk[c.owner] = { clients: [], totalAtRisk: 0, totalRevenue: 0 }
    ownerRisk[c.owner].clients.push(c.client)
    ownerRisk[c.owner].totalAtRisk += c.attrition || 0
    ownerRisk[c.owner].totalRevenue += c.revenue || 0
  })

  console.log('RISK EXPOSURE BY OWNER:\n')
  Object.entries(ownerRisk)
    .sort((a, b) => b[1].totalAtRisk - a[1].totalAtRisk)
    .forEach(([owner, data]) => {
      console.log(`${owner}:`)
      console.log(`  At-Risk Clients: ${data.clients.length}`)
      console.log(`  Revenue at Risk: ${formatMoney(data.totalAtRisk)}`)
      console.log(`  Total Portfolio: ${formatMoney(data.totalRevenue)}`)
      console.log(`  Clients: ${data.clients.join(', ')}`)
      console.log('')
    })

  // === 4. SPECIFIC ACTION ITEMS BY OWNER ===
  console.log('\n=== 4. SPECIFIC ACTION ITEMS BY OWNER ===\n')

  // Group actions by owner
  const ownerActions = {
    'Laura Messing': [
      { priority: 'THIS WEEK', action: 'SA Health Executive Intervention', detail: 'NPS 6.1 with $6.8M revenue. Schedule CEO-level meeting within 5 business days. Prepare service recovery plan addressing product perception issues.' },
      { priority: 'THIS MONTH', action: 'SA Health LHN Roadshow', detail: 'Visit CALHN, NALHN, SALHN, WCHN individually. Document specific complaints. Create tailored action plans per LHN.' }
    ],
    'Johnathan Salisbury': [
      { priority: 'THIS WEEK', action: 'Western Health Renewal Defense', detail: 'Renewal imminent. Current satisfaction unknown. Conduct rapid pulse check and address any blockers before renewal discussion.' },
      { priority: 'THIS MONTH', action: 'WA Health Expansion Prep', detail: '$2.5M opportunity. Ensure current delivery is solid before pushing expansion. Address any open support tickets.' }
    ],
    'New Asia CSE': [
      { priority: 'THIS WEEK', action: 'Sing Health Graceful Exit', detail: '$1.69M confirmed departure. Focus on smooth transition, protecting remaining APAC reputation.' },
      { priority: 'THIS MONTH', action: 'GHA Relationship Building', detail: '$4M Phase 2 opportunity. Position as replacement for Sing Health revenue.' }
    ],
    'Anu Pradhan': [
      { priority: 'THIS WEEK', action: 'AWH Deal Acceleration', detail: '$8M enterprise deal. This is the single biggest opportunity to offset attrition. What\'s blocking close?' },
      { priority: 'THIS MONTH', action: 'GHA Implementation Excellence', detail: '$6M deal. Ensure flawless delivery to build reference case for rest of APAC.' }
    ],
    'Nikki Wei': [
      { priority: 'THIS WEEK', action: 'NUHS Health Check', detail: 'Post-Sing Health, Singapore market needs extra attention. Conduct wellness check on all SG accounts.' },
      { priority: 'THIS MONTH', action: 'CGH Digital Transformation', detail: '$2.8M opportunity. Accelerate to demonstrate SG commitment post-Sing Health departure.' }
    ],
    'Tracey Bland': [
      { priority: 'THIS MONTH', action: 'NSW Health Regional Expansion', detail: '$2.8M regional rollout. Focus on Hunter New England as lighthouse for other LHDs.' },
      { priority: 'THIS QUARTER', action: 'NSW Reference Site Development', detail: 'Build case studies from successful NSW implementations.' }
    ]
  }

  Object.entries(ownerActions).forEach(([owner, actions]) => {
    console.log(`📋 ${owner.toUpperCase()}`)
    console.log('─'.repeat(50))
    actions.forEach(a => {
      const icon = a.priority === 'THIS WEEK' ? '🔴' : a.priority === 'THIS MONTH' ? '🟡' : '🟢'
      console.log(`  ${icon} [${a.priority}] ${a.action}`)
      console.log(`     ${a.detail}`)
    })
    console.log('')
  })

  // === 5. PIPELINE VS ATTRITION BALANCE ===
  console.log('\n=== 5. PIPELINE VS ATTRITION BALANCE ===\n')

  const totalAttrition = attrition?.reduce((s, a) => s + (a.revenue_at_risk || 0), 0) || 0
  const totalCSETarget = Object.values(SALES_TEAM.CSE).reduce((s, d) => s + d.weightedTarget, 0)
  const totalCAMTarget = Object.values(SALES_TEAM.CAM).reduce((s, d) => s + d.weightedTarget, 0)

  console.log('THE MATH:')
  console.log(`  Total Attrition (2025-2028): ${formatMoney(totalAttrition)}`)
  console.log(`  CSE Team Target (weighted): ${formatMoney(totalCSETarget)}`)
  console.log(`  CAM Team Target (weighted): ${formatMoney(totalCAMTarget)}`)
  console.log(`  Combined Pipeline Target: ${formatMoney(totalCSETarget + totalCAMTarget)}`)
  console.log('')

  const gap = totalAttrition - (totalCSETarget + totalCAMTarget)
  if (gap > 0) {
    console.log(`  ⚠️  GAP: ${formatMoney(gap)} - Pipeline doesn't cover attrition!`)
    console.log(`     Need to either reduce attrition OR increase pipeline wins.`)
  } else {
    console.log(`  ✅ SURPLUS: ${formatMoney(Math.abs(gap))} - Pipeline exceeds attrition`)
    console.log(`     But requires 100% pipeline conversion. Realistic expectation: 30-40%.`)
  }

  // === 6. UPSELL OPPORTUNITIES BY OWNER ===
  console.log('\n\n=== 6. UPSELL OPPORTUNITIES BY OWNER ===\n')

  const upsells = alerts?.filter(a => a.alert_type === 'upsell_opportunity') || []

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
      console.log(`${owner}: ${formatMoney(data.total)} in upsell opportunities`)
      data.opportunities.slice(0, 3).forEach(u => {
        console.log(`  💰 ${u.client_name}: ${formatMoney(u.financial_impact)} - ${u.title}`)
      })
      console.log('')
    })

  // === 7. EXECUTIVE SUMMARY ===
  console.log('\n============================================================')
  console.log('              EXECUTIVE TURNAROUND SUMMARY')
  console.log('============================================================\n')

  console.log('🎯 IMMEDIATE PRIORITIES (This Week):')
  console.log('   1. Laura Messing → SA Health executive meeting (NPS 6.1, $6.8M)')
  console.log('   2. New Asia CSE → Sing Health graceful exit ($1.69M departure)')
  console.log('   3. Anu Pradhan → AWH deal acceleration ($8M opportunity)')
  console.log('   4. Johnathan Salisbury → Western Health renewal defense')
  console.log('')

  console.log('💰 REVENUE MATH:')
  console.log(`   Attrition to offset: ${formatMoney(totalAttrition)}`)
  console.log(`   Pipeline target: ${formatMoney(totalCSETarget + totalCAMTarget)}`)
  console.log(`   Untapped upsells: ${formatMoney(upsells.reduce((s, u) => s + (u.financial_impact || 0), 0))}`)
  console.log('')

  console.log('⚠️  KEY RISKS:')
  console.log('   • 62% of attrition is Sing Health - already departing')
  console.log('   • SA Health (21% of maintenance) has poor NPS')
  console.log('   • Pipeline requires aggressive conversion to cover gap')
  console.log('')

  console.log('✅ SUCCESS METRICS:')
  console.log('   • SA Health NPS above 7 within 90 days')
  console.log('   • Zero additional attrition announcements')
  console.log('   • $5M+ pipeline converted by end Q2')
  console.log('   • 100% action item completion rate (currently 0%)')
}

analyzeWithOwners()
