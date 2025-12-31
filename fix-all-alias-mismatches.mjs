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

async function findAndFixMismatches() {
  // Get all aliases
  const { data: aliases, error: aliasError } = await supabase
    .from('client_name_aliases')
    .select('*')
    .eq('is_active', true)

  if (aliasError) {
    console.error('Error fetching aliases:', aliasError)
    return
  }

  // Get all clients
  const { data: clients, error: clientError } = await supabase.from('clients').select('id, name')

  if (clientError) {
    console.error('Error fetching clients:', clientError)
    return
  }

  console.log(`Found ${aliases.length} aliases and ${clients.length} clients\n`)

  // Create a lookup of client names (lowercase)
  const clientNames = new Set(clients.map(c => c.name.toLowerCase()))

  // Find aliases that point to non-existent client names
  const mismatches = []
  for (const alias of aliases) {
    const canonicalLower = alias.canonical_name.toLowerCase()
    if (!clientNames.has(canonicalLower)) {
      mismatches.push(alias)
    }
  }

  console.log(`Found ${mismatches.length} aliases pointing to non-existent clients:\n`)

  for (const mismatch of mismatches) {
    console.log(`  "${mismatch.display_name}" → "${mismatch.canonical_name}"`)

    // Try to find a close match
    const canonical = mismatch.canonical_name.toLowerCase()
    for (const client of clients) {
      const clientLower = client.name.toLowerCase()
      // Check if one contains the other or they're similar
      if (
        canonical.includes(clientLower) ||
        clientLower.includes(canonical) ||
        canonical.replace(/^the /, '') === clientLower ||
        canonical === 'the ' + clientLower
      ) {
        console.log(`    → Possible match: "${client.name}"`)
      }
    }
  }

  // Fix the second RVEEH alias
  console.log('\n--- Fixing remaining mismatches ---\n')

  // Fix "The Royal Victorian Eye and Ear Hospital" aliases
  const { data: updated, error: updateError } = await supabase
    .from('client_name_aliases')
    .update({ canonical_name: 'Royal Victorian Eye and Ear Hospital' })
    .eq('canonical_name', 'The Royal Victorian Eye and Ear Hospital')
    .select()

  if (updateError) {
    console.error('Error updating:', updateError)
  } else {
    console.log(
      `Fixed ${updated.length} aliases with "The Royal Victorian Eye and Ear Hospital":`
    )
    updated.forEach(a => console.log(`  - ${a.display_name}`))
  }
}

findAndFixMismatches()
