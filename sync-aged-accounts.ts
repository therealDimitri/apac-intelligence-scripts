import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const INVOICE_TRACKER_URL =
  process.env.INVOICE_TRACKER_URL || 'https://invoice-tracker.altera-apac.com'
const INVOICE_TRACKER_EMAIL = process.env.INVOICE_TRACKER_EMAIL
const INVOICE_TRACKER_PASSWORD = process.env.INVOICE_TRACKER_PASSWORD

interface InvoiceTrackerClient {
  client: string
  totalUSD: number
  current: number
  days31to60: number
  days61to90: number
  days91to120: number
  days121to180: number
  days181to270: number
  days271to365: number
  over365: number
}

async function syncAgedAccounts() {
  console.log('=== AGED ACCOUNTS SYNC ===')
  console.log('Invoice Tracker URL:', INVOICE_TRACKER_URL)

  if (!INVOICE_TRACKER_EMAIL || !INVOICE_TRACKER_PASSWORD) {
    console.error('Missing Invoice Tracker credentials')
    return
  }

  // Step 1: Authenticate
  console.log('\n1. Authenticating with Invoice Tracker...')
  const authResponse = await fetch(`${INVOICE_TRACKER_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      email: INVOICE_TRACKER_EMAIL,
      password: INVOICE_TRACKER_PASSWORD,
    }),
  })

  if (!authResponse.ok) {
    console.error('Auth failed:', authResponse.status, await authResponse.text())
    return
  }

  const authData = await authResponse.json()
  console.log('   Auth successful!')

  // Step 2: Fetch aging report
  console.log('\n2. Fetching aging report...')
  const reportResponse = await fetch(`${INVOICE_TRACKER_URL}/api/aging-report`, {
    headers: {
      Authorization: `Bearer ${authData.token}`,
      'Content-Type': 'application/json',
    },
  })

  if (!reportResponse.ok) {
    console.error('Report fetch failed:', reportResponse.status)
    return
  }

  const agingReport = await reportResponse.json()
  console.log('   Report fetched successfully!')

  // Step 3: Transform data
  console.log('\n3. Transforming data...')
  const clientMap: Record<string, InvoiceTrackerClient> = {}
  const bucketMapping: Record<string, keyof InvoiceTrackerClient> = {
    Current: 'current',
    '31-60': 'days31to60',
    '61-90': 'days61to90',
    '91-120': 'days91to120',
    '121-180': 'days121to180',
    '181-270': 'days181to270',
    '271-365': 'days271to365',
    '>365': 'over365',
  }

  const buckets = agingReport.buckets as Record<string, { clients: Record<string, { totalUSD: number }> }> || {}
  Object.entries(buckets).forEach(([bucket, data]) => {
      const field = bucketMapping[bucket]
      if (!field || !data.clients) return

      Object.entries(data.clients).forEach(([clientName, clientData]) => {
        if (!clientMap[clientName]) {
          clientMap[clientName] = {
            client: clientName,
            totalUSD: 0,
            current: 0,
            days31to60: 0,
            days61to90: 0,
            days91to120: 0,
            days121to180: 0,
            days181to270: 0,
            days271to365: 0,
            over365: 0,
          }
        }
        ;(clientMap[clientName][field] as number) = clientData.totalUSD
        clientMap[clientName].totalUSD += clientData.totalUSD
      })
    }
  )

  // Filter excluded clients (non-client entities)
  const excludedClients = ['provation', 'iqht', 'philips', 'altera', 'adelaide milk services', 'cirka', 'floc']
  const clients = Object.values(clientMap).filter(client => {
    const lower = client.client.toLowerCase()
    return !excludedClients.some(ex => lower.includes(ex))
  })

  console.log('   Clients found:', clients.length)

  // Step 4: Prepare history records
  const today = new Date().toISOString().split('T')[0]
  const snapshotRecords = clients.map(client => {
    const bucket_0_30 = client.current
    const bucket_31_60 = client.days31to60
    const bucket_61_90 = client.days61to90
    const bucket_90_plus =
      client.days91to120 +
      client.days121to180 +
      client.days181to270 +
      client.days271to365 +
      client.over365
    const total = client.totalUSD || 1

    return {
      client_name: client.client,
      snapshot_date: today,
      bucket_0_30,
      bucket_31_60,
      bucket_61_90,
      bucket_90_plus,
      total_outstanding: client.totalUSD,
      compliance_under_60: Math.round(((bucket_0_30 + bucket_31_60) / total) * 10000) / 100,
      compliance_under_90:
        Math.round(((bucket_0_30 + bucket_31_60 + bucket_61_90) / total) * 10000) / 100,
    }
  })

  // Step 5: Insert history snapshots
  console.log('\n4. Inserting history snapshots...')
  const { error: historyError } = await supabase
    .from('aged_accounts_history')
    .upsert(snapshotRecords, { onConflict: 'client_name,snapshot_date' })

  if (historyError) {
    console.error('   History insert error:', historyError.message)
  } else {
    console.log(`   History: ${snapshotRecords.length} records upserted`)
  }

  // Step 6: Get CSE assignments for aging_accounts
  const { data: assignments } = await supabase
    .from('cse_client_assignments')
    .select('cse_name, client_name, client_name_normalized')
    .eq('is_active', true)

  const findCSEForClient = (clientName: string): string => {
    const normalise = (name: string) =>
      name
        .toLowerCase()
        .replace(
          /\s+(pte|pty|ltd|inc|corp|limited|hospital|health|medical|centre|center)\.?/gi,
          ''
        )
        .replace(/[^a-z0-9]/g, '')
        .trim()

    const exact = assignments?.find(
      a => a.client_name_normalized.toLowerCase() === clientName.toLowerCase()
    )
    if (exact) return exact.cse_name

    const normalised = normalise(clientName)
    const fuzzy = assignments?.find(a => normalise(a.client_name_normalized) === normalised)
    if (fuzzy) return fuzzy.cse_name

    return 'Unassigned'
  }

  // Step 7: Prepare aging_accounts records
  const agingRecords = clients
    .filter(c => c.totalUSD > 0)
    .map(client => ({
      cse_name: findCSEForClient(client.client),
      client_name: client.client,
      client_name_normalized: client.client,
      most_recent_comment: '',
      current_amount: Math.round(client.current * 100) / 100,
      days_1_to_30: 0,
      days_31_to_60: Math.round(client.days31to60),
      days_61_to_90: Math.round(client.days61to90),
      days_91_to_120: Math.round(client.days91to120),
      days_121_to_180: Math.round(client.days121to180),
      days_181_to_270: Math.round(client.days181to270),
      days_271_to_365: Math.round(client.days271to365),
      days_over_365: Math.round(client.over365),
      total_outstanding: Math.round(client.totalUSD * 100) / 100,
      is_inactive: false,
      data_source: 'invoice_tracker_api',
      import_date: today,
      week_ending_date: today,
      updated_at: new Date().toISOString(),
    }))

  // Step 8: Sync aging_accounts
  console.log('\n5. Syncing aging_accounts table...')
  const { error: deleteError } = await supabase.from('aging_accounts').delete().neq('id', 0)
  if (deleteError) console.error('   Delete error:', deleteError.message)

  const { error: insertError } = await supabase.from('aging_accounts').insert(agingRecords)
  if (insertError) {
    console.error('   Insert error:', insertError.message)
  } else {
    console.log(`   Aging accounts: ${agingRecords.length} records synced`)
  }

  console.log('\n=== SYNC COMPLETE ===')
  console.log('Date:', today)
  console.log('Records synced:', agingRecords.length)
}

syncAgedAccounts().catch(console.error)
