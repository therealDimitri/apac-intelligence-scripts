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

async function fixLinks() {
  // Get alerts with linked_action_id
  const { data: alerts } = await supabase
    .from('alerts')
    .select('id, title, linked_action_id, metadata, severity')
    .not('linked_action_id', 'is', null)

  console.log(`Found ${alerts?.length || 0} alerts with linked_action_id\n`)

  let fixed = 0
  let notFound = 0

  for (const alert of alerts || []) {
    const actionIdString = alert.linked_action_id // This is the Action_ID like "S13"

    // Find action by Action_ID
    const { data: action } = await supabase
      .from('actions')
      .select('id, Action_ID, Action_Description, Owners, Priority, Status, client, source_alert_id')
      .eq('Action_ID', actionIdString)
      .single()

    if (action) {
      console.log(`\n✅ MATCH: Alert "${alert.title.slice(0, 40)}..."`)
      console.log(`   Alert ID: ${alert.id}`)
      console.log(`   Action_ID: ${action.Action_ID} → numeric id: ${action.id}`)
      console.log(`   Action source_alert_id: ${action.source_alert_id || 'NOT SET'}`)

      // Update action with source_alert_id if not set
      if (!action.source_alert_id) {
        const { error: actionError } = await supabase
          .from('actions')
          .update({ source_alert_id: alert.id })
          .eq('id', action.id)

        if (actionError) {
          console.log(`   ❌ Error updating action: ${actionError.message}`)
        } else {
          console.log(`   ✅ Set action.source_alert_id = ${alert.id}`)
        }
      }

      // Update alert with numeric id if different
      if (alert.linked_action_id !== action.id.toString()) {
        const { error: alertError } = await supabase
          .from('alerts')
          .update({ linked_action_id: action.id.toString() })
          .eq('id', alert.id)

        if (alertError) {
          console.log(`   ❌ Error updating alert: ${alertError.message}`)
        } else {
          console.log(`   ✅ Updated alert.linked_action_id = ${action.id}`)
        }
      }

      // Copy alert data to action if missing
      const updates = {}

      if (!action.Owners && alert.metadata?.owner) {
        updates.Owners = alert.metadata.owner
      }

      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await supabase
          .from('actions')
          .update(updates)
          .eq('id', action.id)

        if (updateError) {
          console.log(`   ❌ Error backfilling data: ${updateError.message}`)
        } else {
          console.log(`   ✅ Backfilled data:`, updates)
        }
      }

      fixed++
    } else {
      console.log(`\n❌ NOT FOUND: Alert "${alert.title.slice(0, 40)}..."`)
      console.log(`   Looking for Action_ID: ${actionIdString}`)
      notFound++
    }
  }

  console.log(`\n=== SUMMARY ===`)
  console.log(`Fixed: ${fixed}`)
  console.log(`Not found: ${notFound}`)
}

fixLinks().catch(console.error)
