/**
 * Script to capture a compliance snapshot from Invoice Tracker
 * Run with: node scripts/capture-compliance-snapshot.js
 */

/* eslint-disable @typescript-eslint/no-require-imports */
const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })
/* eslint-enable @typescript-eslint/no-require-imports */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const INVOICE_TRACKER_URL =
  process.env.INVOICE_TRACKER_URL || 'https://invoice-tracker.altera-apac.com'
const INVOICE_TRACKER_EMAIL = process.env.INVOICE_TRACKER_EMAIL
const INVOICE_TRACKER_PASSWORD = process.env.INVOICE_TRACKER_PASSWORD

const GOAL_UNDER_60_DAYS = 90
const GOAL_UNDER_90_DAYS = 95

async function getAuthToken() {
  console.log('Authenticating with Invoice Tracker...')
  const response = await fetch(`${INVOICE_TRACKER_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      email: INVOICE_TRACKER_EMAIL,
      password: INVOICE_TRACKER_PASSWORD,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Failed to authenticate: ${response.status} - ${text}`)
  }

  const data = await response.json()
  return data.token
}

function normaliseClientName(name) {
  return name
    .toLowerCase()
    .replace(/\s+(pte|pty|ltd|inc|corp|limited|hospital|health|medical|centre|center)\.?/gi, '')
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

function findCSEForClient(clientName, assignments) {
  const exact = assignments.find(
    a => a.client_name_normalized.toLowerCase() === clientName.toLowerCase()
  )
  if (exact) return exact.cse_name

  const normalised = normaliseClientName(clientName)
  const fuzzy = assignments.find(a => normaliseClientName(a.client_name_normalized) === normalised)
  if (fuzzy) return fuzzy.cse_name

  const partial = assignments.find(
    a =>
      clientName.toLowerCase().includes(a.client_name_normalized.toLowerCase()) ||
      a.client_name_normalized.toLowerCase().includes(clientName.toLowerCase())
  )
  if (partial) return partial.cse_name

  return 'Unassigned'
}

async function captureSnapshot() {
  console.log('=== Compliance Snapshot Capture ===')
  console.log('')

  // Get auth token
  const token = await getAuthToken()
  console.log('✓ Authenticated')

  // Fetch aging report
  console.log('Fetching aging report from Invoice Tracker...')
  const response = await fetch(`${INVOICE_TRACKER_URL}/api/aging-report`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch aging report: ${response.status}`)
  }

  const agingReport = await response.json()
  console.log('✓ Got aging report')

  // Get CSE assignments from database
  console.log('Fetching CSE assignments from Supabase...')
  const { data: assignments, error: assignmentError } = await supabase
    .from('cse_client_assignments')
    .select('cse_name, client_name, client_name_normalized')
    .eq('is_active', true)

  if (assignmentError) {
    throw new Error(`Failed to fetch CSE assignments: ${assignmentError.message}`)
  }
  console.log(`✓ Got ${assignments.length} CSE assignments`)

  // Transform Invoice Tracker data to client summaries
  const clientMap = {}
  const bucketMapping = {
    Current: 'current',
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

  console.log(`✓ Processed ${Object.keys(clientMap).length} clients`)

  // Group clients by CSE
  const cseGroups = {}

  Object.values(clientMap).forEach(client => {
    const cseName = findCSEForClient(client.client, assignments)
    if (!cseGroups[cseName]) {
      cseGroups[cseName] = []
    }
    cseGroups[cseName].push(client)
  })

  console.log(`✓ Grouped into ${Object.keys(cseGroups).length} CSEs`)

  // Calculate week ending date (Sunday)
  const now = new Date()
  const dayOfWeek = now.getDay()
  const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek
  const weekEndingDate = new Date(now)
  weekEndingDate.setDate(now.getDate() + daysUntilSunday)
  const weekEndingStr = weekEndingDate.toISOString().split('T')[0]

  console.log(`Week ending: ${weekEndingStr}`)

  // Calculate compliance for each CSE
  const complianceRecords = Object.entries(cseGroups).map(([cseName, clients]) => {
    const totalClients = clients.length
    const totalOutstanding = clients.reduce((sum, c) => sum + c.totalUSD, 0)

    // Under 60 days = current + 31-60
    const amountUnder60 = clients.reduce((sum, c) => sum + c.current + c.days31to60, 0)
    // Under 90 days = under60 + 61-90
    const amountUnder90 = amountUnder60 + clients.reduce((sum, c) => sum + c.days61to90, 0)
    // Overdue = over 90 days
    const totalOverdue = clients.reduce(
      (sum, c) =>
        sum + c.days91to120 + c.days121to180 + c.days181to270 + c.days271to365 + c.over365,
      0
    )

    const percentUnder60 = totalOutstanding > 0 ? (amountUnder60 / totalOutstanding) * 100 : 100
    const percentUnder90 = totalOutstanding > 0 ? (amountUnder90 / totalOutstanding) * 100 : 100
    const meetsGoals = percentUnder60 >= GOAL_UNDER_60_DAYS && percentUnder90 >= GOAL_UNDER_90_DAYS

    return {
      cse_name: cseName,
      week_ending_date: weekEndingStr,
      total_clients: totalClients,
      total_outstanding: totalOutstanding,
      total_overdue: totalOverdue,
      amount_under_60_days: amountUnder60,
      amount_under_90_days: amountUnder90,
      percent_under_60_days: Math.round(percentUnder60 * 100) / 100,
      percent_under_90_days: Math.round(percentUnder90 * 100) / 100,
      meets_goals: meetsGoals,
    }
  })

  // Delete existing records for this week (upsert by deleting first)
  console.log(`Deleting existing records for ${weekEndingStr}...`)
  const { error: deleteError } = await supabase
    .from('aging_compliance_history')
    .delete()
    .eq('week_ending_date', weekEndingStr)

  if (deleteError) {
    console.warn('Warning: Could not delete existing records:', deleteError.message)
  }

  // Insert new records
  console.log(`Inserting ${complianceRecords.length} records...`)
  const { data, error } = await supabase
    .from('aging_compliance_history')
    .insert(complianceRecords)
    .select()

  if (error) {
    throw new Error(`Failed to insert records: ${error.message}`)
  }

  console.log('')
  console.log('✅ Successfully captured snapshot!')
  console.log('')
  console.log('Summary:')
  console.log(`  Records inserted: ${data.length}`)
  console.log(`  Meeting goals: ${complianceRecords.filter(r => r.meets_goals).length}`)
  console.log(`  At risk: ${complianceRecords.filter(r => !r.meets_goals).length}`)
  console.log('')

  // Show CSE breakdown
  console.log('CSE Breakdown:')
  complianceRecords
    .sort((a, b) => b.total_outstanding - a.total_outstanding)
    .forEach(r => {
      const status = r.meets_goals ? '✓' : '✗'
      console.log(
        `  ${status} ${r.cse_name}: $${r.total_outstanding.toLocaleString()} (${r.percent_under_60_days.toFixed(1)}% <60d, ${r.percent_under_90_days.toFixed(1)}% <90d)`
      )
    })
}

captureSnapshot().catch(err => {
  console.error('')
  console.error('❌ Error:', err.message)
  process.exit(1)
})
