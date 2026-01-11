import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function debugEvents() {
  // Get full event details with all columns
  const { data: events, error } = await supabase
    .from('segmentation_events')
    .select('*')
    .eq('client_name', 'Albury Wodonga Health')
    .limit(5)

  console.log('Sample events with ALL columns:')
  console.log(JSON.stringify(events, null, 2))

  // Check the compliance view data directly
  console.log('\n\nCompliance View Data:')
  const { data: compliance, error: compError } = await supabase
    .from('event_compliance_summary')
    .select('*')
    .eq('client_name', 'Albury Wodonga Health')
    .eq('year', 2025)
    .single()

  if (compliance) {
    console.log('Year:', compliance.year)
    console.log('Overall Score:', compliance.overall_compliance_score)
    console.log('Event Compliance (raw):')
    console.log(JSON.stringify(compliance.event_compliance, null, 2))
  }

  // Check what the useEventCompliance hook would get
  console.log('\n\nWhat the hook sees (year 2026, checking priorYear 2025):')
  const priorYear = 2025
  const { data: hookData, error: hookError } = await supabase
    .from('event_compliance_summary')
    .select('*')
    .eq('client_name', 'Albury Wodonga Health')
    .eq('year', priorYear)
    .maybeSingle()

  if (hookError) {
    console.log('Hook Error:', hookError)
  } else if (hookData) {
    console.log('Hook sees:', JSON.stringify(hookData, null, 2))
  } else {
    console.log('Hook sees: NO DATA')
  }
}

debugEvents().catch(console.error)
