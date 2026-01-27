const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function check() {
  // Check client_health_summary
  const { data: summary } = await supabase
    .from('client_health_summary')
    .select('client_name, status, cse_name')

  const statusCounts = {}
  for (const row of summary || []) {
    statusCounts[row.status] = (statusCounts[row.status] || 0) + 1
  }
  console.log('client_health_summary status distribution:', statusCounts)

  // Check client_health_history (latest only)
  const { data: history } = await supabase
    .from('client_health_history')
    .select('client_name, status')
    .order('snapshot_date', { ascending: false })

  // Get unique latest per client
  const latestByClient = new Map()
  for (const row of history || []) {
    if (!latestByClient.has(row.client_name)) {
      latestByClient.set(row.client_name, row.status)
    }
  }

  const historyStatusCounts = {}
  for (const status of latestByClient.values()) {
    historyStatusCounts[status] = (historyStatusCounts[status] || 0) + 1
  }
  console.log('client_health_history latest status distribution:', historyStatusCounts)

  // Show CSE breakdown from summary
  const byCse = {}
  for (const row of summary || []) {
    if (!byCse[row.cse_name]) {
      byCse[row.cse_name] = { healthy: 0, 'at-risk': 0, critical: 0 }
    }
    if (byCse[row.cse_name][row.status] !== undefined) {
      byCse[row.cse_name][row.status]++
    }
  }
  console.log('\nBy CSE from client_health_summary:')
  for (const [cse, counts] of Object.entries(byCse)) {
    console.log(`  ${cse}: healthy=${counts.healthy}, at-risk=${counts['at-risk']}, critical=${counts.critical}`)
  }
}

check()
