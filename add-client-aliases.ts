import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function addAliases() {
  const aliases = [
    // SA Health variations
    {
      display_name: 'SA Health (iPro), SA Health (iQemo), SA Health (Sunrise)',
      canonical_name: 'SA Health',
      is_active: true,
    },
    {
      display_name: 'CONFIRMED, SA Health (iPro), SA Health (iQemo), SA Health (Sunrise)',
      canonical_name: 'SA Health',
      is_active: true,
    },
    {
      display_name: 'Meet and Greet, SA Health (iPro), SA Health (iQemo), SA Health (Sunrise)',
      canonical_name: 'SA Health',
      is_active: true,
    },
    {
      display_name: 'PLACEHOLDER, SA Health (iPro), SA Health (iQemo), SA Health (Sunrise)',
      canonical_name: 'SA Health',
      is_active: true,
    },
    {
      display_name: 'Re, SA Health (iPro), SA Health (iQemo), SA Health (Sunrise)',
      canonical_name: 'SA Health',
      is_active: true,
    },
    // GHA
    {
      display_name: 'GHA, Gippsland Health Alliance (GHA)',
      canonical_name: 'Gippsland Health Alliance',
      is_active: true,
    },
    { display_name: 'GHA', canonical_name: 'Gippsland Health Alliance', is_active: true },
    // Mount Alvernia Hospital
    {
      display_name: 'MAH & Altera Executives, Mount Alvernia Hospital',
      canonical_name: 'Mount Alvernia Hospital',
      is_active: true,
    },
    { display_name: 'MAH', canonical_name: 'Mount Alvernia Hospital', is_active: true },
    // SingHealth
    { display_name: 'Management, SingHealth', canonical_name: 'SingHealth', is_active: true },
  ]

  const { data, error } = await supabase
    .from('client_name_aliases')
    .upsert(aliases, { onConflict: 'display_name' })
    .select()

  if (error) {
    console.error('Error adding aliases:', error)
  } else {
    console.log('Added', data?.length || 0, 'aliases:')
    data?.forEach(a => console.log(`  - "${a.display_name}" -> "${a.canonical_name}"`))
  }
}

addAliases().catch(console.error)
