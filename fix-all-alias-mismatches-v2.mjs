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

// Mapping of incorrect canonical names to correct ones
// Based on actual client names in client_health_summary:
// - Gippsland Health Alliance (GHA)
// - Grampians Health
// - Guam Regional Medical City (GRMC)
// - Royal Victorian Eye and Ear Hospital
// - SA Health (iPro), SA Health (iQemo), SA Health (Sunrise)
// - NCS/MinDef Singapore
// - SingHealth
// - WA Health
// - Saint Luke's Medical Centre (SLMC)

const CANONICAL_FIXES = {
  // GHA variants
  'Gippsland Health Alliance': 'Gippsland Health Alliance (GHA)',

  // Grampians - the one without "Alliance" is correct
  'Grampians Health Alliance': 'Grampians Health',

  // GRMC variants
  'Guam Regional Medical City': 'Guam Regional Medical City (GRMC)',
  'GRMC (Guam Regional Medical Centre)': 'Guam Regional Medical City (GRMC)',

  // RVEEH
  'The Royal Victorian Eye and Ear Hospital': 'Royal Victorian Eye and Ear Hospital',

  // SA Health - need to decide which one is the main one, or keep separate
  // For now, map generic "SA Health" to the Sunrise variant as it's the most common
  'SA Health': 'SA Health (Sunrise)',
  'Minister for Health aka South Australia Health': 'SA Health (Sunrise)',

  // SA Health specific variants - keep as is if they exist
  'SA Health iPro': 'SA Health (iPro)',
  'SA Health iQemo': 'SA Health (iQemo)',
  'SA Health Sunrise': 'SA Health (Sunrise)',

  // NCS/MinDef
  'Ministry of Defence, Singapore': 'NCS/MinDef Singapore',

  // SingHealth
  'Singapore Health Services Pte Ltd': 'SingHealth',

  // WA Health
  'Western Australia Department of Health': 'WA Health',
  'Western Australia Department Of Health': 'WA Health',

  // St Luke's
  "St Luke's Medical Center Global City Inc": "Saint Luke's Medical Centre (SLMC)",
}

async function fixAllMismatches() {
  console.log('Fixing all client alias mismatches...\n')

  let totalFixed = 0
  let totalFailed = 0

  for (const [incorrectCanonical, correctCanonical] of Object.entries(CANONICAL_FIXES)) {
    console.log(`\nFixing: "${incorrectCanonical}" → "${correctCanonical}"`)

    // Find all aliases with this incorrect canonical name
    const { data: aliasesToFix, error: findError } = await supabase
      .from('client_name_aliases')
      .select('*')
      .eq('canonical_name', incorrectCanonical)

    if (findError) {
      console.error(`  ❌ Error finding aliases:`, findError.message)
      totalFailed++
      continue
    }

    if (!aliasesToFix || aliasesToFix.length === 0) {
      console.log(`  ⏭️  No aliases found with this canonical name`)
      continue
    }

    console.log(`  Found ${aliasesToFix.length} aliases to update`)

    // Update all matching aliases
    const { data: updated, error: updateError } = await supabase
      .from('client_name_aliases')
      .update({ canonical_name: correctCanonical })
      .eq('canonical_name', incorrectCanonical)
      .select()

    if (updateError) {
      console.error(`  ❌ Error updating:`, updateError.message)
      totalFailed++
      continue
    }

    console.log(`  ✅ Updated ${updated.length} aliases:`)
    updated.forEach(a => console.log(`     - "${a.display_name}"`))
    totalFixed += updated.length
  }

  console.log('\n=== SUMMARY ===')
  console.log(`Total aliases fixed: ${totalFixed}`)
  console.log(`Total failures: ${totalFailed}`)

  // Verify by running the check again
  console.log('\n=== VERIFICATION ===')

  const { data: aliases } = await supabase
    .from('client_name_aliases')
    .select('*')
    .eq('is_active', true)

  const { data: clients } = await supabase
    .from('client_health_summary')
    .select('id, client_name')

  const clientNames = new Set(clients.map(c => c.client_name.toLowerCase()))

  const stillMismatched = aliases.filter(a =>
    !clientNames.has(a.canonical_name.toLowerCase())
  )

  if (stillMismatched.length === 0) {
    console.log('✅ All aliases now point to valid clients!')
  } else {
    console.log(`❌ Still ${stillMismatched.length} mismatched aliases:`)
    stillMismatched.forEach(a => {
      console.log(`   - "${a.display_name}" → "${a.canonical_name}"`)
    })
  }
}

fixAllMismatches()
