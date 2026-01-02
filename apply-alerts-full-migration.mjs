#!/usr/bin/env node
/**
 * Apply Alerts Table Migration - Full SQL execution
 */

import pg from 'pg'
import dotenv from 'dotenv'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '..', '.env.local') })

const databaseUrl = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL

if (!databaseUrl) {
  console.error('❌ Missing DATABASE_URL')
  process.exit(1)
}

async function runMigration() {
  console.log('🚀 Starting Alerts Table Full Migration...\n')

  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  })

  try {
    console.log('📡 Connecting to database...')
    await client.connect()
    console.log('✅ Connected\n')

    // Execute each section separately
    const sections = [
      {
        name: 'Create alerts table',
        sql: `
CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_id TEXT UNIQUE NOT NULL,
    category TEXT NOT NULL CHECK (category IN (
        'health_decline', 'health_status_change', 'nps_risk',
        'compliance_risk', 'renewal_approaching', 'action_overdue',
        'attrition_risk', 'engagement_gap', 'servicing_issue'
    )),
    severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'resolved', 'dismissed')),
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
);`
      },
      {
        name: 'Create alerts indexes',
        sql: `
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);
CREATE INDEX IF NOT EXISTS idx_alerts_category ON alerts(category);
CREATE INDEX IF NOT EXISTS idx_alerts_client_name ON alerts(client_name);
CREATE INDEX IF NOT EXISTS idx_alerts_cse_name ON alerts(cse_name);
CREATE INDEX IF NOT EXISTS idx_alerts_detected_at ON alerts(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_alert_id ON alerts(alert_id);
CREATE INDEX IF NOT EXISTS idx_alerts_status_severity ON alerts(status, severity);`
      },
      {
        name: 'Add source_alert_id to actions',
        sql: `
ALTER TABLE actions ADD COLUMN IF NOT EXISTS source_alert_id UUID;
ALTER TABLE actions ADD COLUMN IF NOT EXISTS source_alert_text_id TEXT;`
      },
      {
        name: 'Create index on actions.source_alert_id',
        sql: `CREATE INDEX IF NOT EXISTS idx_actions_source_alert ON actions(source_alert_id) WHERE source_alert_id IS NOT NULL;`
      },
      {
        name: 'Create alert_fingerprints table',
        sql: `
CREATE TABLE IF NOT EXISTS alert_fingerprints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fingerprint TEXT UNIQUE NOT NULL,
    alert_id UUID REFERENCES alerts(id) ON DELETE CASCADE,
    first_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    occurrence_count INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_alert_fingerprints_fingerprint ON alert_fingerprints(fingerprint);`
      },
      {
        name: 'Enable RLS on alerts',
        sql: `ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;`
      },
      {
        name: 'Enable RLS on alert_fingerprints',
        sql: `ALTER TABLE alert_fingerprints ENABLE ROW LEVEL SECURITY;`
      },
      {
        name: 'Create RLS policies for alerts',
        sql: `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'alerts' AND policyname = 'alerts_select_policy') THEN
    CREATE POLICY alerts_select_policy ON alerts FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'alerts' AND policyname = 'alerts_insert_policy') THEN
    CREATE POLICY alerts_insert_policy ON alerts FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'alerts' AND policyname = 'alerts_update_policy') THEN
    CREATE POLICY alerts_update_policy ON alerts FOR UPDATE TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'alerts' AND policyname = 'alerts_delete_policy') THEN
    CREATE POLICY alerts_delete_policy ON alerts FOR DELETE TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'alerts' AND policyname = 'alerts_service_role_all') THEN
    CREATE POLICY alerts_service_role_all ON alerts FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;`
      },
      {
        name: 'Create RLS policies for alert_fingerprints',
        sql: `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'alert_fingerprints' AND policyname = 'alert_fingerprints_select_policy') THEN
    CREATE POLICY alert_fingerprints_select_policy ON alert_fingerprints FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'alert_fingerprints' AND policyname = 'alert_fingerprints_insert_policy') THEN
    CREATE POLICY alert_fingerprints_insert_policy ON alert_fingerprints FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'alert_fingerprints' AND policyname = 'alert_fingerprints_update_policy') THEN
    CREATE POLICY alert_fingerprints_update_policy ON alert_fingerprints FOR UPDATE TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'alert_fingerprints' AND policyname = 'alert_fingerprints_service_role_all') THEN
    CREATE POLICY alert_fingerprints_service_role_all ON alert_fingerprints FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;`
      },
      {
        name: 'Create updated_at trigger function',
        sql: `
CREATE OR REPLACE FUNCTION update_alerts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;`
      },
      {
        name: 'Create updated_at trigger',
        sql: `
DROP TRIGGER IF EXISTS alerts_updated_at_trigger ON alerts;
CREATE TRIGGER alerts_updated_at_trigger
    BEFORE UPDATE ON alerts
    FOR EACH ROW
    EXECUTE FUNCTION update_alerts_updated_at();`
      },
      {
        name: 'Grant permissions',
        sql: `
GRANT ALL ON alerts TO authenticated;
GRANT ALL ON alert_fingerprints TO authenticated;`
      }
    ]

    for (const section of sections) {
      try {
        console.log(`📋 ${section.name}...`)
        await client.query(section.sql)
        console.log(`   ✅ Done`)
      } catch (err) {
        if (err.message.includes('already exists') || err.message.includes('duplicate')) {
          console.log(`   ⏭️  Skipped (already exists)`)
        } else {
          console.log(`   ⚠️  ${err.message.substring(0, 80)}`)
        }
      }
    }

    // Verify
    console.log('\n📊 Verifying tables...')
    
    const alertsCheck = await client.query(`SELECT COUNT(*) FROM alerts`)
    console.log(`   ✅ alerts table: ${alertsCheck.rows[0].count} rows`)

    const fpCheck = await client.query(`SELECT COUNT(*) FROM alert_fingerprints`)
    console.log(`   ✅ alert_fingerprints table: ${fpCheck.rows[0].count} rows`)

    const colCheck = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'actions' AND column_name = 'source_alert_id'
    `)
    console.log(`   ✅ actions.source_alert_id: ${colCheck.rows.length > 0 ? 'exists' : 'missing'}`)

    console.log('\n🎉 Migration complete!')

  } catch (err) {
    console.error('\n❌ Migration failed:', err.message)
    process.exit(1)
  } finally {
    await client.end()
  }
}

runMigration()
