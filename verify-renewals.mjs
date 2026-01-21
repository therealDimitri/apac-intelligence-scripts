import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function verify() {
  const { data: alerts } = await supabase
    .from('financial_alerts')
    .select('client_name, alert_type, due_date, financial_impact')
    .in('alert_type', ['renewal_due', 'renewal_overdue'])
    .order('due_date', { ascending: true })
  
  console.log('\n=== VERIFIED RENEWAL ALERTS ===\n')
  
  let total = 0
  let overdueCount = 0
  const today = new Date()
  
  alerts.forEach(a => {
    const dueDate = new Date(a.due_date)
    const isOverdue = a.alert_type === 'renewal_overdue'
    if (isOverdue) overdueCount++
    total += a.financial_impact || 0
    console.log('- ' + a.client_name + ': $' + (a.financial_impact/1000).toFixed(0) + 'K (' + dueDate.toLocaleDateString('en-AU') + ') - ' + a.alert_type)
  })
  
  console.log('\n=== EXPECTED DISPLAY ===')
  console.log('Total: $' + (total/1000).toFixed(0) + 'K')
  console.log('Overdue: ' + overdueCount)
  console.log('Count: ' + alerts.length)
}

verify()
