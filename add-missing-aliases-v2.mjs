import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function addMissingAliases() {
  console.log('Adding missing aliases...')

  const aliases = [
    // aging_accounts mismatches
    { display: 'GUAM Regional Medical City', canonical: 'Guam Regional Medical City (GRMC)', desc: 'All-caps variant' },
    { display: 'Gippsland Health Alliance', canonical: 'Gippsland Health Alliance (GHA)', desc: 'Without (GHA) suffix' },
    { display: 'NCS PTE Ltd', canonical: 'NCS/MinDef Singapore', desc: 'NCS Singapore variant' },
    { display: "Women's and Children's Hospital Adelaide", canonical: 'SA Health (Sunrise)', desc: 'WCH Adelaide is part of SA Health' },

    // nps_responses mismatches
    { display: 'Guam Regional Medical Centre', canonical: 'Guam Regional Medical City (GRMC)', desc: 'Centre vs City spelling' },
    { display: "St Luke's Medical Centre", canonical: "Saint Luke's Medical Centre (SLMC)", desc: 'St vs Saint variant' },
  ]

  for (const alias of aliases) {
    const { error } = await supabase
      .from('client_name_aliases')
      .upsert({
        display_name: alias.display,
        canonical_name: alias.canonical,
        description: alias.desc,
        is_active: true
      }, { onConflict: 'display_name' })

    if (error) {
      console.log('Error adding alias:', alias.display, '->', error.message)
    } else {
      console.log('✅ Added alias:', alias.display, '->', alias.canonical)
    }
  }

  // Re-run the population
  console.log('\nRe-populating client_id values...')

  const tables = [
    { table: 'aging_accounts', col: 'client_name' },
    { table: 'nps_responses', col: 'client_name' },
    { table: 'unified_meetings', col: 'client_name' },
    { table: 'actions', col: 'client' }
  ]

  for (const t of tables) {
    const { data, error } = await supabase.rpc('exec_sql', {
      sql_query: `UPDATE ${t.table} SET client_id = resolve_client_id_int(${t.col}) WHERE client_id IS NULL;`
    })
    console.log(`${t.table}:`, data?.success ? `Updated ${data.rows_affected} rows` : data?.error || error?.message)
  }

  // Verification
  console.log('\n--- Final Verification ---')

  const { data: aging } = await supabase
    .from('aging_accounts')
    .select('client_name, client_id')
    .eq('is_inactive', false)

  const agingWithId = aging?.filter(r => r.client_id) || []
  const agingWithoutId = aging?.filter(r => r.client_id === null) || []

  console.log(`\naging_accounts: ${agingWithId.length} matched, ${agingWithoutId.length} unmatched`)
  if (agingWithoutId.length > 0) {
    console.log('Still unmatched:', agingWithoutId.map(r => r.client_name))
  }

  const { data: nps } = await supabase
    .from('nps_responses')
    .select('client_name, client_id')

  const npsWithId = nps?.filter(r => r.client_id) || []
  const npsWithoutId = nps?.filter(r => r.client_id === null) || []

  console.log(`nps_responses: ${npsWithId.length} matched, ${npsWithoutId.length} unmatched`)
  if (npsWithoutId.length > 0) {
    const unique = [...new Set(npsWithoutId.map(r => r.client_name))]
    console.log('Still unmatched:', unique)
  }
}

addMissingAliases()
