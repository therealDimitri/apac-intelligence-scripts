import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://usoyxsunetvxdjdglkmn.supabase.co'
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function main() {
  console.log('=== Compliance & Working Capital Data Verification ===\n')

  // Fetch all required data
  const [
    healthResult,
    complianceResult,
    agingResult,
    segmentationResult,
    clientsResult,
    profilesResult,
  ] = await Promise.all([
    supabase.from('client_health_summary').select('client_name, cse, compliance_percentage'),
    supabase.from('event_compliance_summary').select('client_name, overall_compliance_score, overall_status'),
    supabase.from('aging_accounts').select('client_name, current_amount, days_1_to_30, days_31_to_60, days_61_to_90, days_91_to_120, total_outstanding'),
    supabase.from('client_segmentation').select('client_name, cse_name'),
    supabase.from('clients').select('canonical_name, display_name, country'),
    supabase.from('cse_profiles').select('full_name, role, region').eq('active', true),
  ])

  const healthData = healthResult.data || []
  const complianceData = complianceResult.data || []
  const agingData = agingResult.data || []
  const segmentationData = segmentationResult.data || []
  const clientsData = clientsResult.data || []
  const profiles = profilesResult.data || []

  // Build compliance lookup from event_compliance_summary
  const complianceByClient = new Map()
  complianceData.forEach(c => {
    if (c.overall_compliance_score !== null) {
      complianceByClient.set(c.client_name, c.overall_compliance_score)
    }
  })

  // Build client country lookup with name mapping
  const healthToClientsNameMap = {
    'Barwon Health Australia': 'Barwon Health',
    'Department of Health - Victoria': 'DoH Victoria',
    'Gippsland Health Alliance (GHA)': 'GHA',
    'Guam Regional Medical City (GRMC)': 'GRMC',
    'NCS/MinDef Singapore': 'NCS',
    'Royal Victorian Eye and Ear Hospital': 'RVEEH',
    "Saint Luke's Medical Centre (SLMC)": 'SLMC',
    'Epworth HealthCare': 'Epworth Healthcare',
  }

  const clientsTableByName = new Map()
  clientsData.forEach(c => {
    const name = c.display_name || c.canonical_name
    if (name && c.country) {
      clientsTableByName.set(name, c.country)
      clientsTableByName.set(name.toLowerCase(), c.country)
    }
  })

  const getClientCountry = (clientName) => {
    let country = clientsTableByName.get(clientName)
    if (country) return country

    const mappedName = healthToClientsNameMap[clientName]
    if (mappedName) {
      country = clientsTableByName.get(mappedName)
      if (country) return country
    }

    country = clientsTableByName.get(clientName.toLowerCase())
    if (country) return country

    const simplified = clientName
      .replace(/\s*(Australia|Singapore|Pte Ltd|Inc|Pty Ltd)\s*/gi, '')
      .replace(/\([^)]*\)/g, '')
      .trim()

    country = clientsTableByName.get(simplified) || clientsTableByName.get(simplified.toLowerCase())
    return country || ''
  }

  // Build aging data with calculations
  const normalizeClientName = (name) => {
    return name
      .toLowerCase()
      .replace(/\([^)]*\)/g, '')
      .replace(/[^a-z0-9]/g, '')
      .replace(/pte|ltd|inc|pty|hospital|healthcare|health|australia|singapore|services/g, '')
      .trim()
  }

  const clientNameAliases = {
    'SingHealth': 'Singapore Health Services Pte Ltd',
    'WA Health': 'Western Australia Department Of Health',
    "Saint Luke's Medical Centre (SLMC)": "St Luke's Medical Center Global City Inc",
    'Guam Regional Medical City (GRMC)': 'GUAM Regional Medical City',
    'NCS/MinDef Singapore': 'NCS PTE Ltd',
    'Gippsland Health Alliance (GHA)': 'Gippsland Health Alliance',
    'SA Health (iPro)': "Women's and Children's Hospital Adelaide",
    'SA Health (iQemo)': "Women's and Children's Hospital Adelaide",
    'SA Health (Sunrise)': "Women's and Children's Hospital Adelaide",
    'Royal Victorian Eye and Ear Hospital': 'The Royal Victorian Eye and Ear Hospital',
  }

  const agingByClient = new Map()
  const agingByNormalizedName = new Map()

  agingData.forEach(aging => {
    const total = Math.abs(aging.total_outstanding || 0)
    const data = {
      percentUnder60: 100,
      percentUnder90: 100,
      totalOutstanding: 0,
      raw: aging,
    }

    if (total > 0) {
      const current = aging.current_amount || 0
      const d1to30 = aging.days_1_to_30 || 0
      const d31to60 = aging.days_31_to_60 || 0
      const d61to90 = aging.days_61_to_90 || 0

      const under60 = current + d1to30 + d31to60
      const under90 = under60 + d61to90

      data.percentUnder60 = Math.min(100, Math.round((under60 / total) * 100))
      data.percentUnder90 = Math.min(100, Math.round((under90 / total) * 100))
      data.totalOutstanding = total
    }

    agingByClient.set(aging.client_name, data)
    agingByNormalizedName.set(normalizeClientName(aging.client_name), data)
  })

  const findAgingData = (clientName) => {
    let aging = agingByClient.get(clientName)
    if (aging) return aging

    const aliasName = clientNameAliases[clientName]
    if (aliasName) {
      aging = agingByClient.get(aliasName)
      if (aging) return aging
    }

    aging = agingByNormalizedName.get(normalizeClientName(clientName))
    return aging
  }

  // Build CSE to clients mapping
  const cseClients = new Map()
  segmentationData.forEach(seg => {
    if (seg.cse_name) {
      const existing = cseClients.get(seg.cse_name) || []
      if (!existing.includes(seg.client_name)) {
        existing.push(seg.client_name)
      }
      cseClients.set(seg.cse_name, existing)
    }
  })

  healthData.forEach(client => {
    if (client.cse) {
      const existing = cseClients.get(client.cse) || []
      if (!existing.includes(client.client_name)) {
        existing.push(client.client_name)
      }
      cseClients.set(client.cse, existing)
    }
  })

  // CAM regional assignments
  const ANZ_COUNTRIES = ['Australia', 'New Zealand']
  const ASIA_COUNTRIES = ['Singapore', 'Guam', 'Philippines', 'Malaysia', 'Hong Kong', 'Thailand']

  const camClients = new Map()
  profiles.forEach(profile => {
    const roleStr = profile.role?.toLowerCase() || ''
    if (roleStr === 'cam' || roleStr.includes('account manager')) {
      const region = profile.region || ''
      const camName = profile.full_name
      const assignedClients = []

      healthData.forEach(client => {
        const country = getClientCountry(client.client_name)
        if (region === 'ANZ' && ANZ_COUNTRIES.includes(country)) {
          assignedClients.push(client.client_name)
        } else if (region === 'Asia' && ASIA_COUNTRIES.includes(country)) {
          assignedClients.push(client.client_name)
        }
      })

      camClients.set(camName, assignedClients)
    }
  })

  // Now verify each team member's data
  console.log('=== Compliance Data Verification ===\n')
  console.log('Source: event_compliance_summary table\n')

  for (const profile of profiles) {
    const roleStr = profile.role?.toLowerCase() || ''
    const isCSE = roleStr === 'cse' || roleStr.includes('success executive')
    const isCAM = roleStr === 'cam' || roleStr.includes('account manager')

    if (!isCSE && !isCAM) continue

    const role = isCAM ? 'CAM' : 'CSE'
    const clientNames = isCAM
      ? camClients.get(profile.full_name) || []
      : cseClients.get(profile.full_name) || []

    console.log(`\n--- ${profile.full_name} (${role}) - ${clientNames.length} clients ---`)

    let totalCompliance = 0
    let complianceCount = 0
    let wcCompliantCount = 0
    let wcDataFound = 0

    clientNames.forEach(clientName => {
      const compliance = complianceByClient.get(clientName)
      const aging = findAgingData(clientName)

      const complianceStr = compliance !== undefined ? `${compliance}%` : 'N/A'
      let wcStr = 'No aging data'

      if (aging && aging.totalOutstanding > 0) {
        wcDataFound++
        const meetsGoal1 = (aging.percentUnder60 ?? 0) >= 90
        const meetsGoal2 = (aging.percentUnder90 ?? 0) >= 100
        if (meetsGoal1 && meetsGoal2) {
          wcCompliantCount++
          wcStr = `✅ Compliant (${aging.percentUnder60}% <60d, ${aging.percentUnder90}% <90d)`
        } else {
          wcStr = `❌ Non-compliant (${aging.percentUnder60}% <60d, ${aging.percentUnder90}% <90d)`
        }
      } else if (aging) {
        wcCompliantCount++ // No outstanding = assumed compliant
        wcStr = '✅ No outstanding debt'
      } else {
        wcCompliantCount++ // No data = assumed compliant
      }

      if (compliance !== undefined) {
        totalCompliance += compliance
        complianceCount++
      }

      console.log(`  ${clientName}:`)
      console.log(`    Compliance: ${complianceStr}`)
      console.log(`    WC: ${wcStr}`)
    })

    const avgCompliance = complianceCount > 0 ? Math.round(totalCompliance / complianceCount) : 0
    const wcRate = clientNames.length > 0 ? Math.round((wcCompliantCount / clientNames.length) * 100) : 100

    console.log(`\n  📊 SUMMARY for ${profile.full_name}:`)
    console.log(`     Avg Compliance: ${avgCompliance}% (from ${complianceCount} clients with data)`)
    console.log(`     WC Compliance: ${wcRate}% (${wcCompliantCount}/${clientNames.length} clients compliant)`)
  }

  // Show raw aging data for reference
  console.log('\n\n=== Raw Aging Data (for reference) ===')
  agingData.slice(0, 10).forEach(a => {
    const total = Math.abs(a.total_outstanding || 0)
    if (total > 0) {
      const under60 = (a.current_amount || 0) + (a.days_1_to_30 || 0) + (a.days_31_to_60 || 0)
      const pct = Math.round((under60 / total) * 100)
      console.log(`  ${a.client_name}: $${total.toLocaleString()} total, ${pct}% under 60 days`)
    }
  })
}

main().catch(console.error)
