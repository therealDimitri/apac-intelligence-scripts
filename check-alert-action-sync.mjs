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
  // Get alerts with linked actions
  const { data: alerts } = await supabase
    .from('alerts')
    .select('id, title, severity, description, metadata, status, linked_action_id, created_at')
    .not('linked_action_id', 'is', null)

  // Get linked actions by source_alert_id
  const { data: actionsWithAlerts } = await supabase
    .from('actions')
    .select('id, Action_ID, Action_Description, Priority, Status, source_alert_id, Owners, client')
    .not('source_alert_id', 'is', null)

  console.log('=== ALERTS WITH LINKED ACTIONS ===')
  for (const alert of alerts || []) {
    // linked_action_id is now the numeric id as a string
    const actionId = parseInt(alert.linked_action_id)

    // Find action by numeric id
    const { data: action } = await supabase
      .from('actions')
      .select('id, Action_ID, Action_Description, Priority, Status, source_alert_id, Owners, client')
      .eq('id', actionId)
      .single()

    console.log('\nAlert ID:', alert.id)
    console.log('  Title:', alert.title)
    console.log('  Severity:', alert.severity)
    console.log('  linked_action_id:', alert.linked_action_id)

    if (action) {
      console.log('  ---')
      console.log('  Action ID:', action.id)
      console.log('  Action_ID:', action.Action_ID)
      console.log('  Action Description:', action.Action_Description?.slice(0, 50))
      console.log('  Action Priority:', action.Priority)
      console.log('  Action Client:', action.client)
      console.log('  Action Owners:', action.Owners)
      console.log('  Action Status:', action.Status)
      console.log('  Action source_alert_id:', action.source_alert_id)

      // Check bidirectional link
      if (action.source_alert_id === alert.id) {
        console.log('  ✅ Bidirectional link confirmed')
      } else {
        console.log('  ⚠️ source_alert_id mismatch!')
      }

      // Check priority sync
      const severityToPriority = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' }
      const expectedPriority = severityToPriority[alert.severity] || 'Medium'
      if (action.Priority === expectedPriority || action.Priority?.toLowerCase() === alert.severity) {
        console.log('  ✅ Priority in sync')
      } else {
        console.log('  ⚠️ Priority mismatch: Alert severity=' + alert.severity + ', Action priority=' + action.Priority)
      }
    } else {
      console.log('  ⚠️ Action not found!')
    }
  }

  console.log('\n=== SUMMARY ===')
  console.log('Total alerts with actions:', alerts?.length || 0)
  console.log('Total actions with source_alert_id:', actionsWithAlerts?.length || 0)
}

check().catch(console.error)
