#!/usr/bin/env node

/**
 * Apply Alerts Migration via pg client
 */

import pg from 'pg'
import { config } from 'dotenv'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load environment variables
config({ path: join(__dirname, '..', '.env.local') })

let databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  console.error('❌ Missing DATABASE_URL')
  process.exit(1)
}

// Try to use session mode pooler (port 5432) instead of transaction mode (6543)
// Or construct direct connection
const projectRef = 'usoyxsunetvxdjdglkmn'
const directUrl = databaseUrl.replace(':6543/', ':5432/').replace('pooler.supabase.com', 'db.usoyxsunetvxdjdglkmn.supabase.co')

const { Client } = pg

async function runMigration() {
  console.log('🚀 Applying alerts table migration via PostgreSQL...\n')

  // Try direct connection first, then pooler
  const urlsToTry = [
    { url: databaseUrl, name: 'Pooler (transaction mode)' },
    { url: directUrl, name: 'Direct connection' }
  ]

  let client = null
  let connected = false

  for (const { url, name } of urlsToTry) {
    console.log(`🔄 Trying ${name}...`)
    client = new Client({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000
    })

    try {
      await client.connect()
      console.log(`✅ Connected via ${name}\n`)
      connected = true
      break
    } catch (err) {
      console.log(`⚠️  ${name} failed: ${err.message}`)
      try { await client.end() } catch {}
    }
  }

  if (!connected) {
    console.error('\n❌ Could not connect to database')
    console.log('\n📋 Please run the migration manually in Supabase SQL Editor.')
    console.log('   Open: https://supabase.com/dashboard/project/' + projectRef + '/sql/new')
    process.exit(1)
  }

  try {
    // Execute migration statements
    const statements = [
      // Create alerts table
      `CREATE TABLE IF NOT EXISTS alerts (
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
      )`,

      // Create alert_fingerprints table
      `CREATE TABLE IF NOT EXISTS alert_fingerprints (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        fingerprint TEXT UNIQUE NOT NULL,
        alert_id UUID REFERENCES alerts(id),
        first_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        occurrence_count INTEGER DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,

      // Add source_alert_id to actions
      `DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'actions' AND column_name = 'source_alert_id') THEN
          ALTER TABLE actions ADD COLUMN source_alert_id UUID;
        END IF;
      END $$`,

      // Add source_alert_text_id to actions
      `DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'actions' AND column_name = 'source_alert_text_id') THEN
          ALTER TABLE actions ADD COLUMN source_alert_text_id TEXT;
        END IF;
      END $$`,

      // Create indexes
      `CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status)`,
      `CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity)`,
      `CREATE INDEX IF NOT EXISTS idx_alerts_category ON alerts(category)`,
      `CREATE INDEX IF NOT EXISTS idx_alerts_client_name ON alerts(client_name)`,
      `CREATE INDEX IF NOT EXISTS idx_alerts_detected_at ON alerts(detected_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_alerts_alert_id ON alerts(alert_id)`,
      `CREATE INDEX IF NOT EXISTS idx_alert_fingerprints_fingerprint ON alert_fingerprints(fingerprint)`,
      `CREATE INDEX IF NOT EXISTS idx_actions_source_alert ON actions(source_alert_id) WHERE source_alert_id IS NOT NULL`,

      // Enable RLS
      `ALTER TABLE alerts ENABLE ROW LEVEL SECURITY`,
      `ALTER TABLE alert_fingerprints ENABLE ROW LEVEL SECURITY`,

      // Drop existing policies if they exist
      `DROP POLICY IF EXISTS "alerts_select_all" ON alerts`,
      `DROP POLICY IF EXISTS "alerts_insert_all" ON alerts`,
      `DROP POLICY IF EXISTS "alerts_update_all" ON alerts`,
      `DROP POLICY IF EXISTS "alerts_delete_all" ON alerts`,
      `DROP POLICY IF EXISTS "fingerprints_select_all" ON alert_fingerprints`,
      `DROP POLICY IF EXISTS "fingerprints_insert_all" ON alert_fingerprints`,
      `DROP POLICY IF EXISTS "fingerprints_update_all" ON alert_fingerprints`,

      // Create RLS policies for alerts
      `CREATE POLICY "alerts_select_all" ON alerts FOR SELECT USING (true)`,
      `CREATE POLICY "alerts_insert_all" ON alerts FOR INSERT WITH CHECK (true)`,
      `CREATE POLICY "alerts_update_all" ON alerts FOR UPDATE USING (true)`,
      `CREATE POLICY "alerts_delete_all" ON alerts FOR DELETE USING (true)`,

      // Create RLS policies for alert_fingerprints
      `CREATE POLICY "fingerprints_select_all" ON alert_fingerprints FOR SELECT USING (true)`,
      `CREATE POLICY "fingerprints_insert_all" ON alert_fingerprints FOR INSERT WITH CHECK (true)`,
      `CREATE POLICY "fingerprints_update_all" ON alert_fingerprints FOR UPDATE USING (true)`,

      // Create updated_at trigger function
      `CREATE OR REPLACE FUNCTION update_alerts_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql`,

      // Create trigger
      `DROP TRIGGER IF EXISTS alerts_updated_at_trigger ON alerts`,
      `CREATE TRIGGER alerts_updated_at_trigger
        BEFORE UPDATE ON alerts
        FOR EACH ROW
        EXECUTE FUNCTION update_alerts_updated_at()`,

      // Create fingerprint generation function
      `CREATE OR REPLACE FUNCTION generate_alert_fingerprint(
        p_category TEXT,
        p_client_name TEXT,
        p_current_value TEXT DEFAULT NULL
      )
      RETURNS TEXT AS $$
      BEGIN
        RETURN md5(
          p_category || '|' ||
          LOWER(TRIM(p_client_name)) || '|' ||
          COALESCE(p_current_value, '')
        );
      END;
      $$ LANGUAGE plpgsql IMMUTABLE`,
    ]

    let successCount = 0
    let errorCount = 0

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i]
      const preview = stmt.substring(0, 50).replace(/\n/g, ' ').trim()

      try {
        await client.query(stmt)
        console.log(`✅ [${i + 1}/${statements.length}] ${preview}...`)
        successCount++
      } catch (err) {
        if (err.message.includes('already exists')) {
          console.log(`⏭️  [${i + 1}/${statements.length}] ${preview}... (already exists)`)
          successCount++
        } else {
          console.error(`❌ [${i + 1}/${statements.length}] ${preview}...`)
          console.error(`   Error: ${err.message}`)
          errorCount++
        }
      }
    }

    console.log('\n' + '='.repeat(60))
    console.log(`📊 Migration Summary:`)
    console.log(`   ✅ Successful: ${successCount}`)
    console.log(`   ❌ Errors: ${errorCount}`)
    console.log('='.repeat(60))

    // Verify tables
    console.log('\n🔍 Verifying migration...\n')

    const alertsResult = await client.query(`SELECT COUNT(*) FROM alerts`)
    console.log(`✅ alerts table: ${alertsResult.rows[0].count} rows`)

    const fpResult = await client.query(`SELECT COUNT(*) FROM alert_fingerprints`)
    console.log(`✅ alert_fingerprints table: ${fpResult.rows[0].count} rows`)

    const actionsResult = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'actions' AND column_name IN ('source_alert_id', 'source_alert_text_id')
    `)
    console.log(`✅ actions columns added: ${actionsResult.rows.map(r => r.column_name).join(', ')}`)

    console.log('\n✨ Migration complete!')

  } catch (error) {
    console.error('❌ Migration error:', error.message)
    process.exit(1)
  } finally {
    await client.end()
  }
}

runMigration()
