import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://usoyxsunetvxdjdglkmn.supabase.co'
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function main() {
  console.log('=== Testing CAM Country Matching ===\n')

  // Fetch data
  const [clientsResult, healthResult] = await Promise.all([
    supabase.from('clients').select('canonical_name, display_name, country'),
    supabase.from('client_health_summary').select('client_name'),
  ])

  const clientsData = clientsResult.data || []
  const healthData = healthResult.data || []

  // Name mapping (same as API)
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

  // Build lookup
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

    country = clientsTableByName.get(simplified)
    if (country) return country

    country = clientsTableByName.get(simplified.toLowerCase())
    if (country) return country

    return ''
  }

  // Define CAM regions
  const ANZ_COUNTRIES = ['Australia', 'New Zealand']
  const ASIA_COUNTRIES = ['Singapore', 'Guam', 'Philippines', 'Malaysia', 'Hong Kong', 'Thailand']

  // Test each health summary client
  console.log('=== Country Resolution for health_summary clients ===\n')

  const anuClients = []
  const nikkiClients = []
  const unmatched = []

  healthData.forEach(client => {
    const country = getClientCountry(client.client_name)
    const mappedName = healthToClientsNameMap[client.client_name]

    console.log(`"${client.client_name}" → country: "${country}"${mappedName ? ` (via map: ${mappedName})` : ''}`)

    if (ANZ_COUNTRIES.includes(country)) {
      anuClients.push(client.client_name)
    } else if (ASIA_COUNTRIES.includes(country)) {
      nikkiClients.push(client.client_name)
    } else {
      unmatched.push({ name: client.client_name, country })
    }
  })

  console.log('\n=== CAM Assignments Result ===')
  console.log(`\nAnu (ANZ) - ${anuClients.length} clients:`)
  anuClients.forEach(n => console.log(`  - ${n}`))

  console.log(`\nNikki (Asia) - ${nikkiClients.length} clients:`)
  nikkiClients.forEach(n => console.log(`  - ${n}`))

  if (unmatched.length > 0) {
    console.log(`\n⚠️  Unmatched - ${unmatched.length} clients:`)
    unmatched.forEach(u => console.log(`  - ${u.name} (country: "${u.country}")`))
  }

  console.log('\n=== Summary ===')
  console.log(`Total health_summary clients: ${healthData.length}`)
  console.log(`Anu (ANZ): ${anuClients.length}`)
  console.log(`Nikki (Asia): ${nikkiClients.length}`)
  console.log(`Unmatched: ${unmatched.length}`)
}

main().catch(console.error)
