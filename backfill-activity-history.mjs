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

async function backfillActivityHistory() {
  console.log('Backfilling activity history from existing assignments...\n')

  // Get all existing assignments from priority_matrix_assignments
  const { data: assignments, error: assignmentError } = await supabase
    .from('priority_matrix_assignments')
    .select('*')
    .order('created_at', { ascending: true })

  if (assignmentError) {
    console.error('Error fetching assignments:', assignmentError)
    return
  }

  console.log(`Found ${assignments?.length || 0} existing assignments\n`)

  if (!assignments || assignments.length === 0) {
    console.log('No assignments to backfill')
    return
  }

  let created = 0
  let skipped = 0

  for (const assignment of assignments) {
    // Check if we already have activities for this item
    const { data: existingActivities } = await supabase
      .from('priority_matrix_activity_log')
      .select('id')
      .eq('item_id', assignment.item_id)
      .limit(1)

    if (existingActivities && existingActivities.length > 0) {
      console.log(`⏭️  Skipping ${assignment.item_id} - already has activities`)
      skipped++
      continue
    }

    const activities = []

    // Create "created" activity using assignment creation timestamp
    activities.push({
      item_id: assignment.item_id,
      activity_type: 'created',
      user_name: 'System',
      description: 'Item added to Priority Matrix',
      metadata: {},
      created_at: assignment.created_at
    })

    // If there's an owner, add reassignment activity
    if (assignment.owner) {
      activities.push({
        item_id: assignment.item_id,
        activity_type: 'reassigned',
        user_name: 'System',
        description: `Assigned to ${assignment.owner}`,
        metadata: { newOwner: assignment.owner },
        created_at: assignment.updated_at || assignment.created_at
      })
    }

    // If there's a quadrant position (moved from default), add move activity
    if (assignment.quadrant && assignment.quadrant !== 'urgent-important') {
      activities.push({
        item_id: assignment.item_id,
        activity_type: 'moved',
        user_name: 'System',
        description: `Moved to ${assignment.quadrant}`,
        metadata: { to: assignment.quadrant },
        created_at: assignment.updated_at || assignment.created_at
      })
    }

    // If there are client assignments, add activity
    if (assignment.client_assignments && Object.keys(assignment.client_assignments).length > 0) {
      const clientCount = Object.keys(assignment.client_assignments).length
      activities.push({
        item_id: assignment.item_id,
        activity_type: 'updated',
        user_name: 'System',
        description: `Set assignments for ${clientCount} clients`,
        metadata: { clientAssignments: assignment.client_assignments },
        created_at: assignment.updated_at || assignment.created_at
      })
    }

    // Insert all activities for this item
    const { error: insertError } = await supabase
      .from('priority_matrix_activity_log')
      .insert(activities)

    if (insertError) {
      console.error(`❌ Error inserting activities for ${assignment.item_id}:`, insertError.message)
    } else {
      console.log(`✅ Created ${activities.length} activities for ${assignment.item_id}`)
      created += activities.length
    }
  }

  console.log(`\n=== SUMMARY ===`)
  console.log(`Activities created: ${created}`)
  console.log(`Items skipped: ${skipped}`)

  // Show total activities in table
  const { count } = await supabase
    .from('priority_matrix_activity_log')
    .select('*', { count: 'exact', head: true })

  console.log(`Total activities in database: ${count}`)
}

backfillActivityHistory()
