#!/usr/bin/env node
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const functionSQL = `
CREATE OR REPLACE FUNCTION capture_health_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_client RECORD;
  v_prev_record RECORD;
  v_status_changed BOOLEAN;
  v_inserted_count INTEGER := 0;
  v_alert_count INTEGER := 0;
  v_nps_points INTEGER;
  v_compliance_points INTEGER;
  v_working_capital_points INTEGER;
  v_health_score INTEGER;
  v_status TEXT;
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY client_health_summary;

  FOR v_client IN
    SELECT client_name, nps_score, compliance_percentage, working_capital_percentage, cse
    FROM client_health_summary
  LOOP
    v_nps_points := ROUND(((COALESCE(v_client.nps_score, 0) + 100) / 200.0) * 40);
    v_compliance_points := ROUND((LEAST(100, COALESCE(v_client.compliance_percentage, 50)) / 100.0) * 50);
    v_working_capital_points := ROUND((LEAST(100, COALESCE(v_client.working_capital_percentage, 100)) / 100.0) * 10);
    v_health_score := v_nps_points + v_compliance_points + v_working_capital_points;

    v_status := CASE
      WHEN v_health_score >= 70 THEN 'healthy'
      WHEN v_health_score >= 60 THEN 'at-risk'
      ELSE 'critical'
    END;

    SELECT status, health_score INTO v_prev_record
    FROM client_health_history
    WHERE client_name = v_client.client_name AND snapshot_date < v_today
    ORDER BY snapshot_date DESC LIMIT 1;

    v_status_changed := (v_prev_record.status IS NOT NULL AND v_prev_record.status != v_status);

    INSERT INTO client_health_history (
      client_name, snapshot_date, health_score, status,
      nps_points, compliance_points, working_capital_points,
      nps_score, compliance_percentage, working_capital_percentage,
      previous_status, status_changed
    ) VALUES (
      v_client.client_name, v_today, v_health_score, v_status,
      v_nps_points, v_compliance_points, v_working_capital_points,
      v_client.nps_score, v_client.compliance_percentage, v_client.working_capital_percentage,
      v_prev_record.status, v_status_changed
    )
    ON CONFLICT (client_name, snapshot_date) DO UPDATE SET
      health_score = EXCLUDED.health_score,
      status = EXCLUDED.status,
      nps_points = EXCLUDED.nps_points,
      compliance_points = EXCLUDED.compliance_points,
      working_capital_points = EXCLUDED.working_capital_points,
      nps_score = EXCLUDED.nps_score,
      compliance_percentage = EXCLUDED.compliance_percentage,
      working_capital_percentage = EXCLUDED.working_capital_percentage,
      previous_status = EXCLUDED.previous_status,
      status_changed = EXCLUDED.status_changed;

    v_inserted_count := v_inserted_count + 1;

    IF v_status_changed THEN
      INSERT INTO health_status_alerts (
        client_name, alert_date, previous_status, new_status,
        previous_score, new_score, direction, cse_name
      ) VALUES (
        v_client.client_name, v_today, v_prev_record.status, v_status,
        COALESCE(v_prev_record.health_score, 0), v_health_score,
        CASE WHEN v_health_score > COALESCE(v_prev_record.health_score, 0) THEN 'improved' ELSE 'declined' END,
        v_client.cse
      ) ON CONFLICT (client_name, alert_date) DO NOTHING;
      v_alert_count := v_alert_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'snapshot_date', v_today,
    'clients_processed', v_inserted_count,
    'alerts_generated', v_alert_count,
    'timestamp', NOW()
  );
END;
$func$;
`

async function run() {
  console.log('📝 Creating capture_health_snapshot function...')

  const response = await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/rpc/exec_sql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY
    },
    body: JSON.stringify({ sql_query: functionSQL })
  })

  const result = await response.json()

  if (result.success) {
    console.log('✅ Function created successfully!')

    // Now call the function to seed data
    console.log('')
    console.log('🌱 Seeding initial data...')

    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const { data, error } = await supabase.rpc('capture_health_snapshot')

    if (error) {
      console.log('❌ Error calling function:', error.message)
    } else {
      console.log('✅ Initial snapshot captured!')
      console.log('   📊 Clients processed:', data.clients_processed)
      console.log('   🚨 Alerts generated:', data.alerts_generated)
      console.log('   📅 Snapshot date:', data.snapshot_date)
    }
  } else {
    console.log('❌ Failed to create function:', result.error || result.message)
  }
}

run().catch(console.error)
