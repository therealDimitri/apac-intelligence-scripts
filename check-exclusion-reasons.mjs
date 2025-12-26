import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function checkExclusions() {
  const { data } = await supabase
    .from('client_event_exclusions')
    .select('client_name, reason, created_at')
    .order('created_at', { ascending: false })

  console.log('=== All Exclusions by Reason ===')
  const byReason = {}
  data.forEach(e => {
    const key = e.reason || 'null'
    if (!byReason[key]) byReason[key] = []
    byReason[key].push(e.client_name)
  })

  Object.keys(byReason).forEach(reason => {
    console.log('\nReason: "' + reason + '"')
    console.log('Count:', byReason[reason].length)
    console.log('Clients:', [...new Set(byReason[reason])].slice(0, 5).join(', '))
  })
}

checkExclusions()
