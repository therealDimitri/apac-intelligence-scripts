import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Mapping from BURC client names to client_arr client names
const CLIENT_MAPPING = {
  'SA Health': 'Minister for Health aka South Australia Health',
  'Sing Health': 'Singapore Health Services Pte Ltd',
  'Grampians Health Alliance': 'Grampians Health Alliance',
  'WA Health': 'Western Australia Department Of Health',
  "St Luke's Medical Centre": 'St Luke\'s Medical Center Global City Inc',
  'GRMC': 'GRMC (Guam Regional Medical Centre)',
  'Epworth Healthcare': 'Epworth Healthcare',
  'Waikato': 'Te Whatu Ora Waikato',
  'Barwon Health': 'Barwon Health Australia',
  'Western Health': 'Western Health',
  'Royal Victorian Eye & Ear': 'The Royal Victorian Eye and Ear Hospital',
  'GHA Regional': 'Gippsland Health Alliance',
  'Northern Health': null, // Not in current client_arr
  'Austin Health': null,   // Not in current client_arr
  'Mercy Aged Care': null, // Not in current client_arr
  'Bus Case': null,        // Not a real client
  'Parkway (Churned)': null, // Churned client
}

// AUD to USD conversion rate (approximate)
const AUD_TO_USD = 0.65

async function updateClientARRFromBURC() {
  console.log('=== Updating client_arr from BURC Maintenance Data ===\n')

  // Step 1: Get BURC maintenance data grouped by client
  const { data: burcData, error: burcError } = await supabase
    .from('burc_client_maintenance')
    .select('client_name, category, annual_total')
    .order('annual_total', { ascending: false })

  if (burcError) {
    console.error('Error fetching BURC data:', burcError.message)
    return
  }

  // Group by client and sum
  const burcClientTotals = {}
  burcData.forEach(row => {
    const client = row.client_name
    if (!burcClientTotals[client]) {
      burcClientTotals[client] = 0
    }
    burcClientTotals[client] += row.annual_total || 0
  })

  console.log('BURC Client Totals (AUD):')
  Object.entries(burcClientTotals)
    .sort((a, b) => b[1] - a[1])
    .forEach(([client, total]) => {
      console.log(`  ${client}: AUD ${total.toLocaleString()}`)
    })
  console.log('')

  // Step 2: Get current client_arr data
  const { data: currentARR, error: arrError } = await supabase
    .from('client_arr')
    .select('*')

  if (arrError) {
    console.error('Error fetching client_arr:', arrError.message)
    return
  }

  console.log('Current client_arr records:', currentARR.length)
  console.log('')

  // Step 3: Update each client_arr record with BURC data
  let updatedCount = 0
  let skippedCount = 0

  for (const [burcName, arrName] of Object.entries(CLIENT_MAPPING)) {
    if (!arrName) {
      console.log(`⏭️  Skipping ${burcName} (no mapping)`)
      skippedCount++
      continue
    }

    const burcTotal = burcClientTotals[burcName]
    if (!burcTotal) {
      console.log(`⏭️  Skipping ${burcName} (no BURC data)`)
      skippedCount++
      continue
    }

    // Convert AUD to USD
    const arrUSD = Math.round(burcTotal * AUD_TO_USD)

    // Find the client_arr record
    const arrRecord = currentARR.find(r => r.client_name === arrName)
    if (!arrRecord) {
      console.log(`⚠️  Client not found in client_arr: ${arrName}`)
      continue
    }

    // Update the record
    const { error: updateError } = await supabase
      .from('client_arr')
      .update({
        arr_usd: arrUSD,
        currency: 'AUD',
        notes: `Updated from BURC 2026 data. Original AUD: ${burcTotal.toLocaleString()}`,
        updated_at: new Date().toISOString()
      })
      .eq('id', arrRecord.id)

    if (updateError) {
      console.log(`❌ Error updating ${arrName}: ${updateError.message}`)
    } else {
      const oldValue = arrRecord.arr_usd
      const change = arrUSD - oldValue
      const changePercent = oldValue > 0 ? ((change / oldValue) * 100).toFixed(1) : 'N/A'
      console.log(`✅ Updated ${arrName}:`)
      console.log(`   Old: USD ${oldValue.toLocaleString()} → New: USD ${arrUSD.toLocaleString()} (${change >= 0 ? '+' : ''}${change.toLocaleString()}, ${changePercent}%)`)
      updatedCount++
    }
  }

  console.log('')
  console.log('=== Summary ===')
  console.log(`Updated: ${updatedCount}`)
  console.log(`Skipped: ${skippedCount}`)

  // Show final state
  const { data: finalARR } = await supabase
    .from('client_arr')
    .select('client_name, arr_usd')
    .order('arr_usd', { ascending: false })

  console.log('')
  console.log('=== Final client_arr Values ===')
  let total = 0
  finalARR.forEach(r => {
    total += r.arr_usd
    console.log(`${r.client_name}: USD ${r.arr_usd.toLocaleString()}`)
  })
  console.log('')
  console.log(`Total ARR: USD ${total.toLocaleString()}`)
}

updateClientARRFromBURC().catch(console.error)
