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
  // Check financial_alerts for attrition_risk
  console.log('=== financial_alerts (attrition_risk) ===')
  const { data: alerts, error: alertsError } = await supabase
    .from('financial_alerts')
    .select('*')
    .eq('alert_type', 'attrition_risk')

  if (alertsError) {
    console.log('Error:', alertsError.message)
  } else if (alerts && alerts.length > 0) {
    let total = 0
    alerts.forEach(a => {
      total += a.financial_impact || 0
      console.log(`${a.client_name}: $${(a.financial_impact/1000).toFixed(0)}K`)
    })
    console.log(`Total: $${(total/1000).toFixed(0)}K`)
    console.log('Sample columns:', Object.keys(alerts[0]))
  } else {
    console.log('No attrition_risk alerts')
  }

  // Check burc_attrition table schema by trying to insert
  console.log('\n=== burc_attrition schema check ===')
  const { error: schemaError } = await supabase
    .from('burc_attrition')
    .insert({
      client_name: 'Test',
      fiscal_year: 2026,
      revenue_at_risk: 1000
    })

  if (schemaError) {
    console.log('Insert test error:', schemaError.message)
    // Try without fiscal_year
    const { error: err2 } = await supabase
      .from('burc_attrition')
      .insert({
        client_name: 'Test2',
        revenue_at_risk: 1000
      })
    if (err2) {
      console.log('Insert test 2 error:', err2.message)
    }
  } else {
    // Delete the test record
    await supabase.from('burc_attrition').delete().eq('client_name', 'Test')
    console.log('Schema test passed')
  }
}

check()
