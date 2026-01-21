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

async function fixRenewals() {
  console.log('\n=== FIXING RENEWAL ALERTS ===\n')
  
  const today = new Date()
  const ninetyDaysFromNow = new Date()
  ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90)
  
  console.log('Today: ' + today.toLocaleDateString('en-AU'))
  console.log('90 days from now: ' + ninetyDaysFromNow.toLocaleDateString('en-AU'))
  
  // Find renewal alerts that are outside the 90-day window (not overdue AND not within 90 days)
  const { data: renewalAlerts, error } = await supabase
    .from('financial_alerts')
    .select('id, client_name, alert_type, due_date, financial_impact')
    .in('alert_type', ['renewal_due', 'renewal_overdue'])
  
  if (error) {
    console.error('Error:', error)
    return
  }
  
  const alertsToRemove = []
  
  renewalAlerts.forEach(alert => {
    const dueDate = new Date(alert.due_date)
    const daysUntil = Math.floor((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    
    // If renewal is more than 90 days away and not overdue, it shouldn't be in the list
    if (daysUntil > 90) {
      alertsToRemove.push({
        id: alert.id,
        client_name: alert.client_name,
        due_date: dueDate.toLocaleDateString('en-AU'),
        days_until: daysUntil
      })
    }
  })
  
  if (alertsToRemove.length === 0) {
    console.log('\nNo invalid renewal alerts found.')
    return
  }
  
  console.log('\n=== ALERTS TO REMOVE (outside 90-day window) ===\n')
  alertsToRemove.forEach(a => {
    console.log('- ' + a.client_name + ' (due ' + a.due_date + ', ' + a.days_until + ' days away)')
  })
  
  // Delete the invalid alerts
  const idsToDelete = alertsToRemove.map(a => a.id)
  
  const { error: deleteError } = await supabase
    .from('financial_alerts')
    .delete()
    .in('id', idsToDelete)
  
  if (deleteError) {
    console.error('Error deleting alerts:', deleteError)
    return
  }
  
  console.log('\n✅ Deleted ' + alertsToRemove.length + ' invalid renewal alert(s)')
}

fixRenewals()
