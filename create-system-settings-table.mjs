import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

// Load env
const envContent = readFileSync('.env.local', 'utf8')
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^=]+)=(.*)$/)
  if (match) process.env[match[1]] = match[2].replace(/^["']|["']$/g, '')
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function createTable() {
  console.log('Creating system_settings table...')

  // Try to insert default settings (this will create the row if table exists)
  const { data, error } = await supabase.from('system_settings').upsert(
    {
      id: 'global',
      health_score_version: 'v4',
      healthy_threshold: 70,
      at_risk_threshold: 60,
      health_decline_alert_threshold: 10,
      nps_risk_threshold: 6,
      compliance_critical_threshold: 50,
      renewal_warning_days: 90,
      action_overdue_days: 7,
      enable_ai_features: true,
      enable_proactive_insights: true,
      enable_churn_prediction: true,
      enable_email_generator: true,
      enable_in_app_notifications: true,
      enable_email_alerts: true,
      default_alert_severity: 'all',
      audit_log_retention_days: 365,
      conversation_retention_days: 90,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  )

  if (error) {
    if (error.code === '42P01') {
      console.log('Table does not exist. Please run the SQL migration first:')
      console.log('docs/migrations/20260125_create_system_settings_table.sql')
    } else {
      console.log('Error:', error.message)
    }
    return false
  }

  console.log('Default settings inserted successfully')
  return true
}

createTable().catch(console.error)
