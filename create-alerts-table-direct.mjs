#!/usr/bin/env node

/**
 * Create Alerts Table via Supabase Management API
 * Direct table creation without exec_sql function
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load environment variables
config({ path: join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Extract project ref from URL
const projectRef = supabaseUrl.replace('https://', '').split('.')[0]

async function createTablesViaAPI() {
  console.log('🚀 Creating alerts tables via Management API...\n')
  console.log(`📍 Project: ${projectRef}`)

  const sql = `
-- Create alerts table
CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_id TEXT UNIQUE NOT NULL,
    category TEXT NOT NULL,
    severity TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    recommendation TEXT,
    client_name TEXT NOT NULL,
    client_id INTEGER,
    client_uuid TEXT,
    cse_name TEXT,
    cse_email TEXT,
    current_value TEXT,
    previous_value TEXT,
    threshold_value TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    auto_action_created BOOLEAN DEFAULT FALSE,
    linked_action_id TEXT,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by TEXT,
    resolved_at TIMESTAMPTZ,
    resolved_by TEXT,
    dismissed_at TIMESTAMPTZ,
    dismissed_by TEXT,
    dismiss_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create alert_fingerprints table
CREATE TABLE IF NOT EXISTS alert_fingerprints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fingerprint TEXT UNIQUE NOT NULL,
    alert_id UUID,
    first_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    occurrence_count INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add source_alert_id to actions if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'actions' AND column_name = 'source_alert_id') THEN
        ALTER TABLE actions ADD COLUMN source_alert_id UUID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'actions' AND column_name = 'source_alert_text_id') THEN
        ALTER TABLE actions ADD COLUMN source_alert_text_id TEXT;
    END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);
CREATE INDEX IF NOT EXISTS idx_alerts_category ON alerts(category);
CREATE INDEX IF NOT EXISTS idx_alerts_client_name ON alerts(client_name);
CREATE INDEX IF NOT EXISTS idx_alerts_detected_at ON alerts(detected_at DESC);

-- Enable RLS
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_fingerprints ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for alerts
DROP POLICY IF EXISTS "alerts_select_all" ON alerts;
CREATE POLICY "alerts_select_all" ON alerts FOR SELECT USING (true);

DROP POLICY IF EXISTS "alerts_insert_all" ON alerts;
CREATE POLICY "alerts_insert_all" ON alerts FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "alerts_update_all" ON alerts;
CREATE POLICY "alerts_update_all" ON alerts FOR UPDATE USING (true);

DROP POLICY IF EXISTS "alerts_delete_all" ON alerts;
CREATE POLICY "alerts_delete_all" ON alerts FOR DELETE USING (true);

-- Create RLS policies for alert_fingerprints
DROP POLICY IF EXISTS "fingerprints_select_all" ON alert_fingerprints;
CREATE POLICY "fingerprints_select_all" ON alert_fingerprints FOR SELECT USING (true);

DROP POLICY IF EXISTS "fingerprints_insert_all" ON alert_fingerprints;
CREATE POLICY "fingerprints_insert_all" ON alert_fingerprints FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "fingerprints_update_all" ON alert_fingerprints;
CREATE POLICY "fingerprints_update_all" ON alert_fingerprints FOR UPDATE USING (true);
`

  try {
    // Use the SQL endpoint directly
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({})
    })

    // Since we can't use exec_sql, let's try creating tables through the dashboard
    // For now, let's output the SQL for manual execution
    console.log('\n⚠️  Direct SQL execution not available via REST API.')
    console.log('📋 Please run the following SQL in the Supabase SQL Editor:\n')
    console.log('='.repeat(70))
    console.log(sql)
    console.log('='.repeat(70))

    // Try to verify if tables already exist
    console.log('\n🔍 Checking if tables exist...\n')

    const { data: alertsCheck, error: alertsError } = await supabase
      .from('alerts')
      .select('id')
      .limit(1)

    if (alertsError && alertsError.message.includes('does not exist')) {
      console.log('❌ alerts table: Does not exist')
    } else if (alertsError) {
      console.log(`⚠️  alerts table: ${alertsError.message}`)
    } else {
      console.log('✅ alerts table: Exists')
    }

    const { data: fpCheck, error: fpError } = await supabase
      .from('alert_fingerprints')
      .select('id')
      .limit(1)

    if (fpError && fpError.message.includes('does not exist')) {
      console.log('❌ alert_fingerprints table: Does not exist')
    } else if (fpError) {
      console.log(`⚠️  alert_fingerprints table: ${fpError.message}`)
    } else {
      console.log('✅ alert_fingerprints table: Exists')
    }

    // Check actions table columns
    const { error: actionsError } = await supabase
      .from('actions')
      .select('source_alert_id, source_alert_text_id')
      .limit(1)

    if (actionsError) {
      console.log(`⚠️  actions.source_alert_id: ${actionsError.message}`)
    } else {
      console.log('✅ actions.source_alert_id: Column exists')
    }

    console.log('\n📌 To apply this migration:')
    console.log('   1. Open Supabase Dashboard: https://supabase.com/dashboard/project/' + projectRef + '/sql/new')
    console.log('   2. Copy the SQL above and run it')
    console.log('   3. Or run: open "' + join(__dirname, '..', 'docs', 'migrations', '20251231_alerts_table_and_action_linking.sql') + '"')

  } catch (error) {
    console.error('❌ Error:', error.message)
  }
}

createTablesViaAPI()
