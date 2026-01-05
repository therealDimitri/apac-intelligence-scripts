import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://usoyxsunetvxdjdglkmn.supabase.co'
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function main() {
  console.log('=== CAM Client Assignment Verification ===\n')

  // 1. Check clients table structure first
  console.log('=== Checking clients table structure ===')
  const { data: sample, error: sampleError } = await supabase
    .from('clients')
    .select('*')
    .limit(2)

  if (sampleError) {
    console.error('Clients table error:', sampleError.message)
    return
  }

  if (sample?.length) {
    console.log('Clients table columns:', Object.keys(sample[0]))
  }

  // 2. Get all clients with their countries
  const { data: clients, error: clientsError } = await supabase
    .from('clients')
    .select('canonical_name, display_name, country')
    .order('country')

  if (clientsError) {
    console.error('Error fetching clients:', clientsError.message)
    return
  }

  console.log(`\nTotal clients in clients table: ${clients?.length}`)

  // Group by country
  const byCountry = {}
  clients.forEach(c => {
    const country = c.country || 'Unknown'
    if (!byCountry[country]) byCountry[country] = []
    byCountry[country].push(c.display_name || c.canonical_name)
  })

  console.log('\n=== Clients by Country ===')
  for (const [country, names] of Object.entries(byCountry)) {
    console.log(`\n${country} (${names.length}):`)
    names.forEach(n => console.log(`  - ${n}`))
  }

  // 3. Define CAM regions
  const ANZ_COUNTRIES = ['Australia', 'New Zealand']
  const ASIA_COUNTRIES = ['Singapore', 'Guam', 'Philippines', 'Malaysia', 'Hong Kong', 'Thailand']

  const anuClients = clients.filter(c => ANZ_COUNTRIES.includes(c.country))
  const nikkiClients = clients.filter(c => ASIA_COUNTRIES.includes(c.country))
  const unassigned = clients.filter(c =>
    c.country && !ANZ_COUNTRIES.includes(c.country) && !ASIA_COUNTRIES.includes(c.country)
  )
  const noCountry = clients.filter(c => !c.country)

  console.log('\n\n=== Expected CAM Assignments ===')
  console.log(`\nAnu (ANZ Region) - ${anuClients.length} clients:`)
  anuClients.forEach(c => console.log(`  - ${c.display_name || c.canonical_name} (${c.country})`))

  console.log(`\nNikki (Asia Region) - ${nikkiClients.length} clients:`)
  nikkiClients.forEach(c => console.log(`  - ${c.display_name || c.canonical_name} (${c.country})`))

  if (unassigned.length > 0) {
    console.log(`\nOther countries (no CAM assigned) - ${unassigned.length} clients:`)
    unassigned.forEach(c => console.log(`  - ${c.display_name || c.canonical_name} (${c.country})`))
  }

  if (noCountry.length > 0) {
    console.log(`\nNo country set - ${noCountry.length} clients:`)
    noCountry.forEach(c => console.log(`  - ${c.display_name || c.canonical_name}`))
  }

  // 4. Check CSE profiles for CAMs
  console.log('\n\n=== CAM Profiles in cse_profiles ===')
  const { data: profiles, error: profilesError } = await supabase
    .from('cse_profiles')
    .select('full_name, role, region')
    .or('role.eq.Client Account Manager,role.eq.CAM')

  if (profilesError) {
    console.error('Error fetching profiles:', profilesError.message)
  } else {
    profiles?.forEach(p => {
      console.log(`  - ${p.full_name}: role="${p.role}", region="${p.region || 'NOT SET'}"`)
    })
  }

  // 5. Check client_health_summary to see which clients are in the view
  console.log('\n\n=== client_health_summary clients ===')
  const { data: healthClients, error: healthError } = await supabase
    .from('client_health_summary')
    .select('client_name')

  if (healthError) {
    console.error('Error fetching health summary:', healthError.message)
  } else {
    console.log(`Found ${healthClients?.length} clients in client_health_summary`)

    // Check which are missing from clients table
    const clientNames = new Set(clients.map(c => c.display_name || c.canonical_name))
    const healthNames = healthClients?.map(h => h.client_name) || []
    const missingFromClients = healthNames.filter(n => !clientNames.has(n))

    if (missingFromClients.length > 0) {
      console.log('\nClients in health_summary but NOT in clients table:')
      missingFromClients.forEach(n => console.log(`  - ${n}`))
    }
  }

  // 6. Summary
  console.log('\n\n=== Summary ===')
  console.log(`Total clients in clients table: ${clients.length}`)
  console.log(`ANZ clients (Anu): ${anuClients.length}`)
  console.log(`Asia clients (Nikki): ${nikkiClients.length}`)
  console.log(`Other countries: ${unassigned.length}`)
  console.log(`No country set: ${noCountry.length}`)
}

main().catch(console.error)
