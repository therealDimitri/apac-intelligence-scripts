import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function debugEvents() {
  console.log('='.repeat(80))
  console.log('DEBUG: Segmentation Events Analysis')
  console.log('='.repeat(80))

  // Get all events for Albury Wodonga
  const { data: awEvents, error: awError } = await supabase
    .from('segmentation_events')
    .select('*')
    .eq('client_name', 'Albury Wodonga Health')
    .order('event_date', { ascending: true })

  if (awError) {
    console.error('Error fetching Albury Wodonga events:', awError)
    return
  }

  console.log('\n📊 Albury Wodonga Health - Events in Database:')
  console.log('-'.repeat(60))

  if (!awEvents || awEvents.length === 0) {
    console.log('❌ NO EVENTS FOUND IN DATABASE!')
  } else {
    console.log(`Found ${awEvents.length} events:`)
    awEvents.forEach(event => {
      console.log(`  - ${event.event_type}: ${event.event_date} (Year: ${event.event_year})`)
    })
  }

  // Check the compliance summary view
  console.log('\n📈 Compliance Summary View for Albury Wodonga:')
  console.log('-'.repeat(60))

  const { data: complianceData, error: compError } = await supabase
    .from('event_compliance_summary')
    .select('*')
    .eq('client_name', 'Albury Wodonga Health')

  if (compError) {
    console.error('Error fetching compliance summary:', compError)
  } else if (complianceData && complianceData.length > 0) {
    complianceData.forEach(row => {
      console.log(`Year ${row.year}:`)
      console.log(`  Overall Score: ${row.overall_compliance_score}%`)
      console.log(`  Event Compliance:`)
      if (row.event_compliance) {
        row.event_compliance.forEach(ec => {
          console.log(`    - ${ec.event_type_name}: ${ec.actual_count}/${ec.expected_count} (${ec.compliance_percentage}%)`)
        })
      }
    })
  } else {
    console.log('No compliance data found')
  }

  // Get total event counts by client
  console.log('\n📊 Event Counts by Client (2025):')
  console.log('-'.repeat(60))

  const { data: eventCounts, error: countError } = await supabase
    .from('segmentation_events')
    .select('client_name')
    .eq('event_year', 2025)

  if (countError) {
    console.error('Error:', countError)
  } else if (eventCounts) {
    const counts = {}
    eventCounts.forEach(e => {
      counts[e.client_name] = (counts[e.client_name] || 0) + 1
    })
    Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([client, count]) => {
      console.log(`  ${client}: ${count} events`)
    })
  }

  // Check event types table
  console.log('\n📋 Event Types in Database:')
  console.log('-'.repeat(60))

  const { data: eventTypes, error: typesError } = await supabase
    .from('segmentation_event_types')
    .select('*')
    .order('event_code')

  if (typesError) {
    console.error('Error fetching event types:', typesError)
  } else if (eventTypes) {
    eventTypes.forEach(et => {
      console.log(`  ${et.event_code}: ${et.event_name}`)
    })
  }
}

debugEvents().catch(console.error)
