import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function getClientARRFromBURC() {
  // Get all client maintenance data
  const { data, error } = await supabase
    .from('burc_client_maintenance')
    .select('client_name, category, annual_total')
    .order('annual_total', { ascending: false })

  if (error) {
    console.error('Error:', error.message)
    return
  }

  console.log('=== BURC Client Maintenance Data ===')
  console.log('Total rows:', data.length)
  console.log('')

  // Group by client and sum
  const clientTotals = {}
  data.forEach(row => {
    const client = row.client_name
    if (!clientTotals[client]) {
      clientTotals[client] = { total: 0, categories: [] }
    }
    clientTotals[client].total += row.annual_total || 0
    clientTotals[client].categories.push(`${row.category}: ${(row.annual_total || 0).toLocaleString()}`)
  })

  // Sort by total and display
  const sorted = Object.entries(clientTotals).sort((a, b) => b[1].total - a[1].total)

  let grandTotal = 0
  sorted.forEach(([client, info]) => {
    grandTotal += info.total
    console.log(`${client}: AUD ${info.total.toLocaleString()}`)
  })

  console.log('')
  console.log(`Grand Total: AUD ${grandTotal.toLocaleString()}`)
  console.log('')
  console.log(`Total clients: ${sorted.length}`)
}

getClientARRFromBURC().catch(console.error)
