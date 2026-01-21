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

async function checkRenewals() {
  console.log('\n=== FINANCIAL ALERTS: RENEWALS ===\n')
  
  const { data: renewalAlerts, error: alertError } = await supabase
    .from('financial_alerts')
    .select('client_name, alert_type, due_date, financial_impact, severity, description')
    .in('alert_type', ['renewal_due', 'renewal_overdue'])
    .order('due_date', { ascending: true })
  
  if (alertError) {
    console.error('Error fetching alerts:', alertError)
    return
  }
  
  const alerts = renewalAlerts || []
  console.log('Found ' + alerts.length + ' renewal alerts:\n')
  
  const today = new Date()
  let totalValue = 0
  let overdueCount = 0
  
  alerts.forEach(alert => {
    const dueDate = alert.due_date ? new Date(alert.due_date) : null
    const daysUntil = dueDate ? Math.floor((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : 'N/A'
    const isOverdue = dueDate && dueDate < today
    
    if (isOverdue) overdueCount++
    totalValue += alert.financial_impact || 0
    
    console.log('- ' + alert.client_name)
    console.log('  Type: ' + alert.alert_type)
    console.log('  Due: ' + (dueDate ? dueDate.toLocaleDateString('en-AU') : 'N/A') + ' (' + daysUntil + ' days ' + (daysUntil < 0 ? 'AGO' : 'away') + ')')
    console.log('  Value: $' + (alert.financial_impact || 0).toLocaleString())
    console.log('  Severity: ' + alert.severity)
    console.log('')
  })
  
  console.log('=== SUMMARY ===')
  console.log('Total renewals: ' + alerts.length)
  console.log('Total value: $' + totalValue.toLocaleString())
  console.log('Overdue count: ' + overdueCount)
  
  console.log('\n\n=== BURC_ARR: CONTRACT END DATES ===\n')
  
  const { data: burcData, error: burcError } = await supabase
    .from('burc_arr')
    .select('client_name, contract_end_date, arr_2025, cse_name')
    .not('contract_end_date', 'is', null)
    .order('contract_end_date', { ascending: true })
    .limit(20)
  
  if (burcError) {
    console.error('Error fetching burc_arr:', burcError)
    return
  }
  
  const contracts = burcData || []
  console.log('Showing first 20 contracts with end dates:\n')
  
  contracts.forEach(client => {
    const endDate = new Date(client.contract_end_date)
    const daysUntil = Math.floor((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    const withinWindow = daysUntil <= 90
    
    console.log('- ' + client.client_name)
    console.log('  Contract End: ' + endDate.toLocaleDateString('en-AU') + ' (' + daysUntil + ' days)')
    console.log('  ARR 2025: $' + (client.arr_2025 || 0).toLocaleString())
    console.log('  CSE: ' + (client.cse_name || 'N/A'))
    console.log('  Within 90 days: ' + (withinWindow ? 'YES' : 'NO'))
    console.log('')
  })
}

checkRenewals()
