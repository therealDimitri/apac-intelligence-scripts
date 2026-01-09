import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Test data aggregation
const CSE_NAMES = ['Gilbert So', 'Tracey Bland', 'Laura Messing', 'John Salisbury', 'BoonTeck Lim']
const CAM_NAMES = ['Nikki Wei', 'Anu Pradhan']

console.log('=== Team Performance Data Test ===\n')

// 1. Fetch profiles
const { data: profiles, error: profilesError } = await supabase
  .from('cse_profiles')
  .select('full_name, email, photo_url, role')
  .eq('active', true)
  .in('full_name', [...CSE_NAMES, ...CAM_NAMES])

if (profilesError) {
  console.error('Profiles error:', profilesError.message)
} else {
  console.log('Team Members (' + profiles.length + '):')
  profiles.forEach(p => console.log('  -', p.full_name, '(' + (p.role || 'CSE') + ')'))
}

// 2. Fetch health summary
const { data: health, error: healthError } = await supabase
  .from('client_health_summary')
  .select('client_name, cse, health_score, status, nps_score, compliance_percentage')

if (healthError) {
  console.error('Health error:', healthError.message)
} else {
  console.log('\nClient Assignments:')
  const byCSE = {}
  health?.forEach(h => {
    const cse = h.cse || 'Unassigned'
    if (!byCSE[cse]) byCSE[cse] = []
    byCSE[cse].push({ 
      name: h.client_name, 
      score: h.health_score, 
      status: h.status,
      nps: h.nps_score,
      compliance: h.compliance_percentage
    })
  })
  
  Object.entries(byCSE).sort().forEach(([cse, clients]) => {
    const avgHealth = Math.round(clients.reduce((s, c) => s + (c.score || 0), 0) / clients.length)
    console.log(`\n  ${cse}: ${clients.length} clients, avg health: ${avgHealth}%`)
    clients.forEach(c => {
      const statusIcon = c.status === 'healthy' ? '✓' : c.status === 'at-risk' ? '⚠' : '✗'
      console.log(`    ${statusIcon} ${c.name} (${c.score}%)`)
    })
  })
}

console.log('\n=== Test Complete ===')
