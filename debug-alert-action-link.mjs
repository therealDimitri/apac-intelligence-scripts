import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function check() {
  // Get alerts with linked_action_id
  const { data: alerts } = await supabase
    .from('alerts')
    .select('id, title, linked_action_id, metadata')
    .not('linked_action_id', 'is', null)

  console.log('=== Alerts with linked_action_id ===')
  for (const alert of alerts || []) {
    console.log('Alert:', alert.title.slice(0, 50))
    console.log('  linked_action_id (UUID):', alert.linked_action_id)
    console.log('  metadata.action_id:', alert.metadata?.action_id)

    // Check if action exists by UUID (linked_action_id)
    const { data: actionByUUID } = await supabase
      .from('actions')
      .select('id, title')
      .eq('id', alert.linked_action_id)
      .single()

    // Check if action exists by metadata action_id
    const { data: actionByMetaId } = await supabase
      .from('actions')
      .select('id, title, source_alert_id')
      .eq('id', alert.metadata?.action_id)
      .single()

    console.log('  Action by linked_action_id found:', actionByUUID ? 'YES' : 'NO')
    console.log('  Action by metadata.action_id found:', actionByMetaId ? 'YES' : 'NO')
    if (actionByMetaId) {
      console.log('    -> Action source_alert_id:', actionByMetaId.source_alert_id || 'NOT SET')
    }
    console.log('')
  }
}

check().catch(console.error)
