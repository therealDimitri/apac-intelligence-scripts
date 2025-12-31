import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Read env vars
const envContent = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
const urlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)
const keyMatch = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)

if (!urlMatch || !keyMatch) {
  console.error('Could not read env vars')
  process.exit(1)
}

const supabaseUrl = urlMatch[1].trim()
const supabaseKey = keyMatch[1].trim()

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkAliasMismatches() {
  console.log('Checking all client alias mismatches...\n')

  // Get all active aliases
  const { data: aliases, error: aliasError } = await supabase
    .from('client_name_aliases')
    .select('*')
    .eq('is_active', true)

  if (aliasError) {
    console.error('Error fetching aliases:', aliasError)
    return
  }

  // Get all clients from the materialized view
  const { data: clients, error: clientError } = await supabase
    .from('client_health_summary')
    .select('id, client_name')

  if (clientError) {
    console.error('Error fetching clients:', clientError)
    return
  }

  console.log(`Found ${aliases.length} aliases and ${clients.length} clients\n`)

  // Create a lookup of client names (lowercase -> actual name)
  const clientNameMap = new Map()
  clients.forEach(c => {
    clientNameMap.set(c.client_name.toLowerCase(), c.client_name)
  })

  // Find aliases that point to non-existent client names
  const mismatches = []
  const valid = []

  for (const alias of aliases) {
    const canonicalLower = alias.canonical_name.toLowerCase()
    if (!clientNameMap.has(canonicalLower)) {
      mismatches.push(alias)
    } else {
      valid.push(alias)
    }
  }

  console.log(`✅ Valid aliases: ${valid.length}`)
  console.log(`❌ Mismatched aliases: ${mismatches.length}\n`)

  if (mismatches.length === 0) {
    console.log('All aliases are valid!')
    return
  }

  console.log('=== MISMATCHED ALIASES ===\n')

  for (const mismatch of mismatches) {
    console.log(`  Display: "${mismatch.display_name}"`)
    console.log(`  Points to: "${mismatch.canonical_name}" (NOT FOUND in clients)`)

    // Try to find a close match
    const canonical = mismatch.canonical_name.toLowerCase()
    const potentialMatches = []

    for (const [clientLower, clientActual] of clientNameMap.entries()) {
      // Check if one contains the other or they're similar
      if (
        canonical.includes(clientLower) ||
        clientLower.includes(canonical) ||
        canonical.replace(/^the /, '') === clientLower ||
        canonical === 'the ' + clientLower ||
        clientLower.replace(/^the /, '') === canonical ||
        clientLower === 'the ' + canonical
      ) {
        potentialMatches.push(clientActual)
      }
    }

    if (potentialMatches.length > 0) {
      console.log(`  Possible matches: ${potentialMatches.map(m => `"${m}"`).join(', ')}`)
    } else {
      console.log(`  Possible matches: NONE FOUND`)
    }
    console.log('')
  }

  // Return mismatches for potential fixing
  return { mismatches, clientNameMap }
}

checkAliasMismatches()
