/**
 * Setup client event exclusion for Department of Health - Victoria
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function main() {
  console.log('\n=== Setting up Client Event Exclusion ===\n')

  // Step 1: Check if table exists
  console.log('1. Checking if client_event_exclusions table exists...')
  const { error: checkError } = await supabase
    .from('client_event_exclusions')
    .select('id')
    .limit(1)

  if (checkError && checkError.code === '42P01') {
    console.log('   Table does not exist!')
    console.log('   Please run the migration SQL first via Supabase Dashboard.')
    console.log('   File: docs/migrations/20251223_add_client_event_exclusions.sql')
    return
  }

  if (checkError) {
    console.log('   Check error:', checkError.message)
    console.log('   Continuing anyway...')
  } else {
    console.log('   Table exists!')
  }

  // Step 2: Get Health Check (Opal) event type ID
  console.log('\n2. Getting Health Check (Opal) event type ID...')
  const { data: eventType, error: eventError } = await supabase
    .from('segmentation_event_types')
    .select('id, event_name')
    .eq('event_name', 'Health Check (Opal)')
    .single()

  if (eventError || !eventType) {
    console.log('   Error:', eventError?.message || 'Not found')
    return
  }
  console.log('   Event type ID:', eventType.id)

  // Step 3: Insert exclusion
  console.log('\n3. Inserting exclusion for Department of Health - Victoria...')
  const { data: insertData, error: insertError } = await supabase
    .from('client_event_exclusions')
    .upsert(
      {
        client_name: 'Department of Health - Victoria',
        event_type_id: eventType.id,
        reason:
          'DoH Victoria does not require Health Check (Opal) events per business decision - Dec 2025',
        created_by: 'system',
      },
      {
        onConflict: 'client_name,event_type_id',
      }
    )
    .select()

  if (insertError) {
    console.log('   Insert error:', insertError.message)
    console.log('   Code:', insertError.code)
  } else {
    console.log('   Exclusion inserted successfully!')
    console.log('   Record:', insertData)
  }

  // Step 4: Verify
  console.log('\n4. Verifying exclusion exists...')
  const { data: exclusions, error: verifyError } = await supabase
    .from('client_event_exclusions')
    .select('*')
    .eq('client_name', 'Department of Health - Victoria')

  if (verifyError) {
    console.log('   Verify error:', verifyError.message)
  } else {
    console.log('   Exclusions found:', exclusions?.length || 0)
    exclusions?.forEach((e) => {
      console.log('    - Event:', e.event_type_id)
      console.log('      Reason:', e.reason)
    })
  }

  console.log('\n=== Next Steps ===')
  console.log('1. Run the full migration SQL to update the materialized view')
  console.log('   File: docs/migrations/20251223_add_client_event_exclusions.sql')
  console.log('2. Go to Supabase Dashboard > SQL Editor')
  console.log('3. Paste and run the SQL')
  console.log(
    '4. Refresh the client page to see the updated compliance score'
  )
}

main().catch(console.error)
