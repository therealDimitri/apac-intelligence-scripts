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

async function runMigration() {
  console.log('Running system_settings migration...')

  // Create the table using raw SQL via RPC
  const { error: createError } = await supabase.rpc('exec_sql', {
    sql: `
      CREATE TABLE IF NOT EXISTS system_settings (
        id TEXT PRIMARY KEY DEFAULT 'global',
        health_score_version TEXT DEFAULT 'v4',
        healthy_threshold INTEGER DEFAULT 70,
        at_risk_threshold INTEGER DEFAULT 60,
        health_decline_alert_threshold INTEGER DEFAULT 10,
        nps_risk_threshold INTEGER DEFAULT 6,
        compliance_critical_threshold INTEGER DEFAULT 50,
        renewal_warning_days INTEGER DEFAULT 90,
        action_overdue_days INTEGER DEFAULT 7,
        enable_ai_features BOOLEAN DEFAULT true,
        enable_proactive_insights BOOLEAN DEFAULT true,
        enable_churn_prediction BOOLEAN DEFAULT true,
        enable_email_generator BOOLEAN DEFAULT true,
        enable_in_app_notifications BOOLEAN DEFAULT true,
        enable_email_alerts BOOLEAN DEFAULT true,
        default_alert_severity TEXT DEFAULT 'all',
        audit_log_retention_days INTEGER DEFAULT 365,
        conversation_retention_days INTEGER DEFAULT 90,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `,
  })

  if (createError) {
    // exec_sql function might not exist, try direct insert which will fail gracefully
    console.log('RPC not available, creating via Supabase dashboard SQL editor')
    console.log('Please run docs/migrations/20260125_create_system_settings_table.sql manually')

    // For now, let's try to use the REST API to create a simple insert
    // which will work if the table was created manually
    const { data, error } = await supabase
      .from('system_settings')
      .select('id')
      .limit(1)

    if (error && error.code === '42P01') {
      console.log('\n=== TABLE DOES NOT EXIST ===')
      console.log('Please run this SQL in Supabase Dashboard > SQL Editor:\n')
      console.log(readFileSync('docs/migrations/20260125_create_system_settings_table.sql', 'utf8'))
      return
    }

    if (data) {
      console.log('Table exists! Settings row:', data)
    }
    return
  }

  console.log('Table created successfully')

  // Insert default row
  const { error: insertError } = await supabase.from('system_settings').upsert(
    {
      id: 'global',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  )

  if (insertError) {
    console.log('Insert error:', insertError.message)
  } else {
    console.log('Default settings row created')
  }
}

runMigration().catch(console.error)
