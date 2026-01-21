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

async function syncRenewalAlerts() {
  const today = new Date()
  
  console.log('Today: ' + today.toLocaleDateString('en-AU'))
  
  const { data: calendar } = await supabase
    .from('burc_renewal_calendar')
    .select('*')
  
  if (!calendar) {
    console.log('No calendar data found')
    return
  }
  
  console.log('\n=== Processing calendar entries ===')
  
  for (const renewal of calendar) {
    const renewalDate = new Date(renewal.renewal_year, renewal.renewal_month - 1, 1)
    const daysUntil = Math.floor((renewalDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    
    const isOverdue = daysUntil < 0
    const isWithin90Days = daysUntil <= 90
    
    console.log(renewal.clients + ': ' + renewalDate.toLocaleDateString('en-AU') + ' (' + daysUntil + ' days) - ' + (isWithin90Days ? 'INCLUDE' : 'skip'))
    
    if (isWithin90Days) {
      const alertType = isOverdue ? 'renewal_overdue' : 'renewal_due'
      const { error } = await supabase
        .from('financial_alerts')
        .insert({
          alert_type: alertType,
          severity: isOverdue ? 'critical' : daysUntil <= 30 ? 'high' : 'medium',
          priority_score: isOverdue ? 100 : Math.max(0, 100 - daysUntil),
          client_name: renewal.clients,
          title: (isOverdue ? 'Renewal Overdue: ' : 'Renewal Due: ') + renewal.clients,
          description: 'Contract renewal ' + (isOverdue ? 'was due ' + Math.abs(daysUntil) + ' days ago' : 'due in ' + daysUntil + ' days'),
          financial_impact: renewal.total_value_usd || 0,
          due_date: renewalDate.toISOString().split('T')[0],
          status: 'open',
          source_table: 'burc_renewal_calendar',
          source_record_id: renewal.id
        })
      
      if (error) {
        console.log('  Error: ' + error.message)
      } else {
        console.log('  Created: $' + (renewal.total_value_usd/1000).toFixed(0) + 'K - ' + alertType)
      }
    }
  }
  
  console.log('\n=== FINAL STATE ===')
  const { data: final } = await supabase
    .from('financial_alerts')
    .select('client_name, alert_type, due_date, financial_impact')
    .in('alert_type', ['renewal_due', 'renewal_overdue'])
  
  if (final && final.length > 0) {
    let total = 0
    final.forEach(a => {
      total += a.financial_impact || 0
      console.log(a.client_name + ': ' + new Date(a.due_date).toLocaleDateString('en-AU') + ' - $' + (a.financial_impact/1000).toFixed(0) + 'K - ' + a.alert_type)
    })
    console.log('\nTotal: $' + (total/1000).toFixed(0) + 'K')
    console.log('Count: ' + final.length)
  } else {
    console.log('No renewal alerts within 90-day window')
  }
}

syncRenewalAlerts()
