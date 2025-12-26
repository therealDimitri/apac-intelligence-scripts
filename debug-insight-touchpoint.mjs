/**
 * Debug script to investigate Insight Touch Point compliance data
 * Checking why Albury Wodonga is listed as incomplete when they've completed all events
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function debug() {
  const currentYear = new Date().getFullYear()

  console.log('=== Debugging Insight Touch Point Compliance ===\n')

  // 1. Find the event type ID
  const { data: eventTypes } = await supabase
    .from('segmentation_event_types')
    .select('id, event_name')
    .eq('event_name', 'Insight Touch Point')

  if (!eventTypes?.length) {
    console.log('Event type "Insight Touch Point" not found')
    return
  }

  const eventTypeId = eventTypes[0].id
  console.log('Event Type ID:', eventTypeId)
  console.log('')

  // 2. Check segmentation_event_compliance for this event type
  console.log('=== segmentation_event_compliance table ===')
  const { data: complianceData } = await supabase
    .from('segmentation_event_compliance')
    .select('client_name, expected_count, actual_count')
    .eq('event_type_id', eventTypeId)
    .eq('year', currentYear)
    .order('client_name')

  console.log('\nAll clients with Insight Touch Point requirements:')
  complianceData?.forEach(row => {
    const status = row.actual_count >= row.expected_count ? '✅' : '❌'
    const pct = row.expected_count > 0 ? Math.round((row.actual_count / row.expected_count) * 100) : 0
    console.log(`  ${status} ${row.client_name}: ${row.actual_count}/${row.expected_count} (${pct}%)`)
  })

  // 3. Specifically check Albury Wodonga
  console.log('\n=== Albury Wodonga Health Details ===')
  const alburyData = complianceData?.filter(r =>
    r.client_name.toLowerCase().includes('albury')
  )

  if (alburyData?.length) {
    alburyData.forEach(row => {
      console.log(`Client Name: "${row.client_name}"`)
      console.log(`Expected: ${row.expected_count}`)
      console.log(`Actual: ${row.actual_count}`)
      console.log(`Complete: ${row.actual_count >= row.expected_count ? 'YES' : 'NO'}`)
    })
  } else {
    console.log('No Albury Wodonga entry found in segmentation_event_compliance')
  }

  // 4. Check what the API would return as incomplete
  console.log('\n=== Clients that would be marked as INCOMPLETE ===')
  const incompleteClients = complianceData?.filter(r =>
    r.expected_count > 0 && r.actual_count < r.expected_count
  )

  console.log(`Total incomplete: ${incompleteClients?.length || 0}`)
  incompleteClients?.forEach(row => {
    console.log(`  - ${row.client_name}: ${row.actual_count}/${row.expected_count}`)
  })

  // 5. Check the actual segmentation_events table for Albury Wodonga
  console.log('\n=== segmentation_events table (individual records) ===')
  const { data: events } = await supabase
    .from('segmentation_events')
    .select('client_name, event_date, completed')
    .eq('event_type_id', eventTypeId)
    .ilike('client_name', '%albury%')
    .order('event_date', { ascending: false })

  console.log(`Albury Wodonga Insight Touch Point events in segmentation_events:`)
  events?.forEach(e => {
    console.log(`  ${e.completed ? '✅' : '❌'} ${e.event_date} - ${e.client_name}`)
  })

  // 6. Check materialized view if it exists
  console.log('\n=== Checking materialized view ===')
  try {
    const { data: viewData } = await supabase
      .from('client_health_scores_materialized')
      .select('client_name, compliance_score')
      .ilike('client_name', '%albury%')

    viewData?.forEach(row => {
      console.log(`${row.client_name}: Compliance Score = ${row.compliance_score}`)
    })
  } catch (e) {
    console.log('Could not query materialized view')
  }
}

debug().catch(console.error)
