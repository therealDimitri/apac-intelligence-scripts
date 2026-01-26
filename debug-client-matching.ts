/**
 * Debug script to check client name matching between tables
 */
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function debugMatching() {
  // Get client names from client_segmentation
  const { data: segClients } = await supabase
    .from('client_segmentation')
    .select('client_name')
  const segNames = [...new Set(segClients?.map(c => c.client_name))]
  console.log('Client Segmentation clients:', segNames.length)
  console.log(segNames)

  // Get unique client names from health_history
  const { data: healthClients } = await supabase
    .from('client_health_history')
    .select('client_name')
  const healthNames = [...new Set(healthClients?.map(c => c.client_name))]
  console.log('\nClient Health History clients:', healthNames.length)
  console.log(healthNames)

  // Find matches
  const matches = segNames.filter(s => healthNames.some(h => h.toLowerCase() === s.toLowerCase()))
  console.log('\n=== MATCHES ===')
  console.log('Matching clients:', matches.length)
  console.log(matches)

  // Find mismatches
  const noHealth = segNames.filter(s => !healthNames.some(h => h.toLowerCase() === s.toLowerCase()))
  console.log('\n=== NO HEALTH DATA ===')
  console.log('Segmentation clients without health data:', noHealth.length)
  console.log(noHealth)

  // Get AR data clients
  const { data: arClients } = await supabase
    .from('aging_accounts')
    .select('client_name, cse_name, total_outstanding')
  console.log('\n=== AR DATA ===')
  console.log('AR accounts:', arClients?.length)
  arClients?.forEach(ar => {
    console.log(`  ${ar.client_name} (${ar.cse_name}): $${ar.total_outstanding?.toLocaleString()}`)
  })
}

debugMatching().catch(console.error)
