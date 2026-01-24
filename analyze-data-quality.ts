import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Internal meeting patterns to exclude from mismatch detection
const internalMeetingPatterns = [
  'internal meeting',
  'internal',
  'declined',
  'town hall',
  'quarterly',
  'weekly',
  'monthly',
  'all hands',
  'team meeting',
  'staff meeting',
  'nps analysis',
  'sunrise series',
  'client success connect',
  'client forum',
  'critical incident',
  'action plan',
  'showcase',
  'knowledge sharing',
  'documentation',
  'walkthru',
  'walkthrough',
  'training',
  'evp approval',
  'evp presentation',
  'incident briefing',
  'potluck',
  'morning tea',
  'segmentation',
  'reminder',
  'cse ',
  'final',
  'following',
  'confirmed',
]

const isInternalMeeting = (name: string): boolean => {
  const lower = name.toLowerCase()
  if (lower.startsWith('re:') || lower.startsWith('fwd:')) return true
  if (lower.startsWith('apac ') || lower === 'apac') return true
  if (lower.length <= 3 && !lower.includes(' ')) return true
  return internalMeetingPatterns.some(pattern => lower.includes(pattern))
}

async function analyzeDataQuality() {
  console.log('=== STALE DATA SOURCES ===\n')

  // Health snapshots
  const { data: healthLatest } = await supabase
    .from('client_health_history')
    .select('snapshot_date')
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .single()
  const healthDate = healthLatest?.snapshot_date
  const healthHours = healthDate
    ? Math.round((Date.now() - new Date(healthDate).getTime()) / (1000 * 60 * 60))
    : null
  console.log(`Health Snapshots: ${healthDate || 'Never'} (${healthHours || 'N/A'} hours ago)`)

  // Actions
  const { data: actionsLatest } = await supabase
    .from('actions')
    .select('updated_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()
  const actionsDate = actionsLatest?.updated_at
  const actionsHours = actionsDate
    ? Math.round((Date.now() - new Date(actionsDate).getTime()) / (1000 * 60 * 60))
    : null
  console.log(`Actions: ${actionsDate || 'Never'} (${actionsHours || 'N/A'} hours ago)`)

  // Meetings
  const { data: meetingsLatest } = await supabase
    .from('unified_meetings')
    .select('updated_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()
  const meetingsDate = meetingsLatest?.updated_at
  const meetingsHours = meetingsDate
    ? Math.round((Date.now() - new Date(meetingsDate).getTime()) / (1000 * 60 * 60))
    : null
  console.log(`Meetings: ${meetingsDate || 'Never'} (${meetingsHours || 'N/A'} hours ago)`)

  // Aging accounts
  const { data: agingLatest } = await supabase
    .from('aging_accounts')
    .select('updated_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()
  const agingDate = agingLatest?.updated_at
  const agingHours = agingDate
    ? Math.round((Date.now() - new Date(agingDate).getTime()) / (1000 * 60 * 60))
    : null
  console.log(`Aged Accounts: ${agingDate || 'Never'} (${agingHours || 'N/A'} hours ago)`)

  // NPS
  const { data: npsLatest } = await supabase
    .from('nps_responses')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  const npsDate = npsLatest?.created_at
  const npsHours = npsDate
    ? Math.round((Date.now() - new Date(npsDate).getTime()) / (1000 * 60 * 60))
    : null
  console.log(`NPS Responses: ${npsDate || 'Never'} (${npsHours || 'N/A'} hours ago)`)

  // 2. Get name mismatches
  console.log('\n=== NAME MISMATCHES ===\n')

  // Get known clients
  const { data: knownClients } = await supabase.from('clients').select('canonical_name')
  const { data: aliases } = await supabase
    .from('client_name_aliases')
    .select('display_name, canonical_name')
    .eq('is_active', true)

  const knownNames = new Set<string>()
  knownClients?.forEach(c => c.canonical_name && knownNames.add(c.canonical_name.toLowerCase()))
  aliases?.forEach(a => {
    if (a.display_name) knownNames.add(a.display_name.toLowerCase())
    if (a.canonical_name) knownNames.add(a.canonical_name.toLowerCase())
  })

  console.log(`Known client names/aliases: ${knownNames.size}`)

  // Check aging_accounts mismatches
  const { data: agingClients } = await supabase.from('aging_accounts').select('client_name')
  const agingMismatches = new Map<string, number>()
  agingClients?.forEach(record => {
    if (record.client_name && !knownNames.has(record.client_name.toLowerCase())) {
      agingMismatches.set(record.client_name, (agingMismatches.get(record.client_name) || 0) + 1)
    }
  })

  // Check meetings mismatches (excluding internal meetings)
  const { data: meetingClients } = await supabase
    .from('unified_meetings')
    .select('client_name')
    .not('client_name', 'is', null)
  const meetingMismatches = new Map<string, number>()
  const excludedAsInternal = new Map<string, number>()
  meetingClients?.forEach(record => {
    if (record.client_name && !knownNames.has(record.client_name.toLowerCase())) {
      if (isInternalMeeting(record.client_name)) {
        excludedAsInternal.set(
          record.client_name,
          (excludedAsInternal.get(record.client_name) || 0) + 1
        )
      } else {
        meetingMismatches.set(
          record.client_name,
          (meetingMismatches.get(record.client_name) || 0) + 1
        )
      }
    }
  })

  const totalExcluded = [...excludedAsInternal.values()].reduce((a, b) => a + b, 0)
  console.log(`Excluded as internal meetings: ${excludedAsInternal.size} unique names (${totalExcluded} records)`)

  console.log(`Aged Accounts mismatches: ${agingMismatches.size} unique names`)
  console.log(`Meetings mismatches: ${meetingMismatches.size} unique names`)

  console.log('\nTop 20 Unmatched Names (Aged Accounts):')
  ;[...agingMismatches.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .forEach(([name, count]) => console.log(`  - "${name}": ${count} records`))

  console.log('\nTop 20 Unmatched Names (Meetings):')
  ;[...meetingMismatches.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .forEach(([name, count]) => console.log(`  - "${name}": ${count} records`))

  // Summary
  const totalMismatches =
    [...agingMismatches.values()].reduce((a, b) => a + b, 0) +
    [...meetingMismatches.values()].reduce((a, b) => a + b, 0)
  console.log(`\nTotal mismatched records: ${totalMismatches}`)
}

analyzeDataQuality().catch(console.error)
