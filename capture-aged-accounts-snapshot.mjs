/**
 * Capture Aged Accounts Snapshot
 * Manually triggers the aged accounts snapshot capture from Invoice Tracker
 * Run: node scripts/capture-aged-accounts-snapshot.mjs
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: join(__dirname, '../.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const INVOICE_TRACKER_URL = process.env.INVOICE_TRACKER_URL || 'https://invoice-tracker.altera-apac.com'
const INVOICE_TRACKER_EMAIL = process.env.INVOICE_TRACKER_EMAIL
const INVOICE_TRACKER_PASSWORD = process.env.INVOICE_TRACKER_PASSWORD

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials')
  process.exit(1)
}

if (!INVOICE_TRACKER_EMAIL || !INVOICE_TRACKER_PASSWORD) {
  console.error('❌ Missing Invoice Tracker credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function getAuthToken() {
  console.log('🔐 Authenticating with Invoice Tracker...')

  const response = await fetch(`${INVOICE_TRACKER_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      email: INVOICE_TRACKER_EMAIL,
      password: INVOICE_TRACKER_PASSWORD,
    }),
  })

  if (!response.ok) {
    throw new Error(`Auth failed: ${response.status}`)
  }

  const data = await response.json()
  console.log('✅ Authenticated successfully')
  return data.token
}

async function captureSnapshot() {
  console.log('=== Aged Accounts Snapshot Capture ===\n')

  // Authenticate
  const token = await getAuthToken()

  // Fetch aging data
  console.log('\n📊 Fetching aging report from Invoice Tracker...')
  const response = await fetch(`${INVOICE_TRACKER_URL}/api/aging-report`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Aging report failed: ${response.status}`)
  }

  const agingReport = await response.json()
  console.log('✅ Aging report fetched')

  // Transform data
  const clientMap = {}
  const bucketMapping = {
    'Current': 'current',
    '31-60': 'days31to60',
    '61-90': 'days61to90',
    '91-120': 'days91to120',
    '121-180': 'days121to180',
    '181-270': 'days181to270',
    '271-365': 'days271to365',
    '>365': 'over365',
  }

  Object.entries(agingReport.buckets || {}).forEach(([bucket, data]) => {
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

      clientMap[clientName][field] = clientData.totalUSD
      clientMap[clientName].totalUSD += clientData.totalUSD
    })
  })

  // Exclude non-CSE owned clients
  const excludedClients = ['provation', 'iqht', 'philips', 'altera']
  const clients = Object.values(clientMap).filter(client => {
    const clientNameLower = client.client.toLowerCase()
    return !excludedClients.some(excluded => clientNameLower.includes(excluded))
  })

  console.log(`\n📋 Processing ${clients.length} clients...`)

  // Prepare snapshot records
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
      compliance_under_90: Math.round(((bucket_0_30 + bucket_31_60 + bucket_61_90) / total) * 10000) / 100,
    }
  })

  // Insert into database
  console.log(`\n💾 Inserting ${snapshotRecords.length} records for ${today}...`)
  const { error } = await supabase
    .from('aged_accounts_history')
    .upsert(snapshotRecords, { onConflict: 'client_name,snapshot_date' })

  if (error) {
    throw new Error(`Database error: ${error.message}`)
  }

  console.log(`✅ Snapshot captured successfully for ${today}`)

  // Verify
  const { data: latest } = await supabase
    .from('aged_accounts_history')
    .select('snapshot_date')
    .order('snapshot_date', { ascending: false })
    .limit(1)

  console.log(`\n📅 Latest snapshot date: ${latest?.[0]?.snapshot_date}`)

  return snapshotRecords.length
}

captureSnapshot()
  .then(count => {
    console.log(`\n🎉 Done! Captured ${count} client records.`)
    process.exit(0)
  })
  .catch(err => {
    console.error('\n❌ Error:', err.message)
    process.exit(1)
  })
