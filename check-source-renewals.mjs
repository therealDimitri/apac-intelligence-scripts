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

async function check() {
  // Check burc_renewal_calendar - the source of truth
  const { data: calendar } = await supabase
    .from('burc_renewal_calendar')
    .select('*')
    .order('renewal_year')
    .order('renewal_month')
  
  console.log('=== BURC RENEWAL CALENDAR (Source of Truth) ===\n')
  if (calendar) {
    calendar.forEach(c => {
      const date = new Date(c.renewal_year, c.renewal_month - 1, 1)
      console.log(c.clients + ': ' + date.toLocaleDateString('en-AU', {month: 'short', year: 'numeric'}) + ' - $' + (c.total_value_usd/1000).toFixed(0) + 'K')
    })
  }
  
  console.log('\n=== FINANCIAL ALERTS (May be stale) ===\n')
  const { data: alerts } = await supabase
    .from('financial_alerts')
    .select('client_name, due_date, financial_impact, alert_type')
    .in('alert_type', ['renewal_due', 'renewal_overdue'])
  
  if (alerts) {
    alerts.forEach(a => {
      const date = new Date(a.due_date)
      console.log(a.client_name + ': ' + date.toLocaleDateString('en-AU') + ' - $' + (a.financial_impact/1000).toFixed(0) + 'K - ' + a.alert_type)
    })
  }
}

check()
