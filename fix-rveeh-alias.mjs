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

async function fixAlias() {
  // First, check what aliases exist for RVEEH
  const { data: aliases, error: aliasError } = await supabase
    .from('client_name_aliases')
    .select('*')
    .ilike('display_name', '%RVEEH%')

  console.log('Current RVEEH aliases:', JSON.stringify(aliases, null, 2))

  // Check what the actual client name is
  const { data: clients, error: clientError } = await supabase
    .from('clients')
    .select('id, name')
    .ilike('name', '%Victorian Eye%')

  console.log('\nMatching clients:', JSON.stringify(clients, null, 2))

  if (aliases && aliases.length > 0) {
    // Update the alias to use the correct canonical name
    const correctName =
      clients && clients.length > 0 ? clients[0].name : 'Royal Victorian Eye and Ear Hospital'

    console.log('\nUpdating alias to use canonical name:', correctName)

    const { data: updated, error: updateError } = await supabase
      .from('client_name_aliases')
      .update({ canonical_name: correctName })
      .eq('display_name', 'RVEEH')
      .select()

    if (updateError) {
      console.error('Error updating:', updateError)
    } else {
      console.log('Updated alias:', JSON.stringify(updated, null, 2))
    }
  }
}

fixAlias()
