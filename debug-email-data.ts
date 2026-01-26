/**
 * Debug script to check email data sources
 */
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function debugData() {
  console.log('\n=== NPS PERIODS ===')
  const { data: npsPeriods } = await supabase
    .from('nps_responses')
    .select('period')
    .order('period', { ascending: false })
  const periods = [...new Set(npsPeriods?.map(r => r.period))]
  console.log('Available periods:', periods)

  // Check period config
  const { data: periodConfig } = await supabase
    .from('nps_period_config')
    .select('*')
    .eq('is_active', true)
  console.log('Active period config:', periodConfig)

  console.log('\n=== AGED ACCOUNTS (check column names) ===')
  const { data: arSample } = await supabase
    .from('aging_accounts')
    .select('*')
    .limit(1)
  console.log('AR columns:', arSample?.[0] ? Object.keys(arSample[0]) : 'No data')

  // Check aged_accounts_history too
  const { data: arHistorySample } = await supabase
    .from('aged_accounts_history')
    .select('*')
    .order('snapshot_date', { ascending: false })
    .limit(1)
  console.log('AR History columns:', arHistorySample?.[0] ? Object.keys(arHistorySample[0]) : 'No data')
  if (arHistorySample?.[0]) {
    console.log('Sample AR History:', arHistorySample[0])
  }

  console.log('\n=== CLIENT HEALTH STATUS VALUES ===')
  const { data: healthData } = await supabase
    .from('client_health_history')
    .select('client_name, status, health_score')
    .order('snapshot_date', { ascending: false })
    .limit(10)
  console.log('Health data sample:', healthData)

  // Get unique status values
  const { data: allHealth } = await supabase
    .from('client_health_history')
    .select('status')
  const statuses = [...new Set(allHealth?.map(h => h.status))]
  console.log('Unique status values:', statuses)

  console.log('\n=== PIPELINE DATA ===')
  const { data: pipeline } = await supabase
    .from('pipeline_by_cse')
    .select('*')
  console.log('Pipeline data:', pipeline)

  console.log('\n=== SEGMENTATION COMPLIANCE ===')
  const { data: segData } = await supabase
    .from('segmentation_event_compliance')
    .select('*')
    .eq('year', 2026)
    .limit(5)
  console.log('Segmentation 2026:', segData)

  // Check what years exist
  const { data: segYears } = await supabase
    .from('segmentation_event_compliance')
    .select('year')
  const years = [...new Set(segYears?.map(s => s.year))]
  console.log('Available years:', years)

  console.log('\n=== CLIENT SEGMENTATION (CSE assignments) ===')
  const { data: cseClients } = await supabase
    .from('client_segmentation')
    .select('client_name, cse_name')
  console.log('CSE Client assignments:', cseClients?.slice(0, 5))

  // Group by CSE
  const byCSE: Record<string, number> = {}
  cseClients?.forEach(c => {
    byCSE[c.cse_name] = (byCSE[c.cse_name] || 0) + 1
  })
  console.log('Clients per CSE:', byCSE)
}

debugData().catch(console.error)
