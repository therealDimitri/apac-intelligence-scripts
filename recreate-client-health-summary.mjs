#!/usr/bin/env node
/**
 * Recreate client_health_summary materialized view
 */

import pg from 'pg';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;

console.log('Connecting to database...');

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  let client;
  try {
    client = await pool.connect();
    console.log('Connected.');

    console.log('\n1. Dropping existing view...');
    await client.query('DROP MATERIALIZED VIEW IF EXISTS client_health_summary CASCADE;');
    console.log('✅ Dropped');

    console.log('\n2. Creating materialized view...');
    await client.query(`
CREATE MATERIALIZED VIEW client_health_summary AS
SELECT
  c.id,
  c.client_name,
  c.segment,
  nps_metrics.nps_score,
  nps_metrics.response_count,
  nps_metrics.last_nps_date,
  meeting_metrics.meeting_count_30d,
  meeting_metrics.meeting_count_90d,
  meeting_metrics.last_meeting_date,
  meeting_metrics.days_since_last_meeting,
  meeting_metrics.completion_rate,
  COALESCE(action_metrics.total_actions_count, 0) as total_actions_count,
  COALESCE(action_metrics.completed_actions_count, 0) as completed_actions_count,
  COALESCE(action_metrics.open_actions_count, 0) as open_actions_count,
  COALESCE(action_metrics.overdue_actions_count, 0) as overdue_actions_count,
  LEAST(100, COALESCE(compliance_metrics.compliance_percentage, 0))::INTEGER as compliance_percentage,
  compliance_metrics.compliance_status,
  aging_metrics.working_capital_percentage,
  aging_metrics.percent_under_60_days,
  aging_metrics.percent_under_90_days,
  c.cse,
  LEAST(100, GREATEST(0, ROUND(
    ((COALESCE(nps_metrics.nps_score, 0) + 100) / 200.0 * 25) +
    (CASE
      WHEN meeting_metrics.days_since_last_meeting <= 14 THEN 15
      WHEN meeting_metrics.days_since_last_meeting <= 30 THEN 12
      WHEN meeting_metrics.days_since_last_meeting <= 60 THEN 8
      WHEN meeting_metrics.days_since_last_meeting <= 90 THEN 5
      ELSE 0
    END +
    CASE
      WHEN COALESCE(nps_metrics.response_count, 0) >= 5 THEN 10
      WHEN COALESCE(nps_metrics.response_count, 0) >= 3 THEN 7.5
      WHEN COALESCE(nps_metrics.response_count, 0) >= 1 THEN 5
      ELSE 0
    END) +
    (LEAST(100, COALESCE(compliance_metrics.compliance_percentage, 0)) / 100.0 * 30) +
    (20 - LEAST(20, COALESCE(action_metrics.open_actions_count, 0) * 2))
  ))) as health_score,
  CASE
    WHEN ROUND(
      ((COALESCE(nps_metrics.nps_score, 0) + 100) / 200.0 * 25) +
      (CASE WHEN meeting_metrics.days_since_last_meeting <= 14 THEN 15 WHEN meeting_metrics.days_since_last_meeting <= 30 THEN 12 WHEN meeting_metrics.days_since_last_meeting <= 60 THEN 8 WHEN meeting_metrics.days_since_last_meeting <= 90 THEN 5 ELSE 0 END +
      CASE WHEN COALESCE(nps_metrics.response_count, 0) >= 5 THEN 10 WHEN COALESCE(nps_metrics.response_count, 0) >= 3 THEN 7.5 WHEN COALESCE(nps_metrics.response_count, 0) >= 1 THEN 5 ELSE 0 END) +
      (LEAST(100, COALESCE(compliance_metrics.compliance_percentage, 0)) / 100.0 * 30) +
      (20 - LEAST(20, COALESCE(action_metrics.open_actions_count, 0) * 2))
    ) >= 75 THEN 'healthy'
    WHEN ROUND(
      ((COALESCE(nps_metrics.nps_score, 0) + 100) / 200.0 * 25) +
      (CASE WHEN meeting_metrics.days_since_last_meeting <= 14 THEN 15 WHEN meeting_metrics.days_since_last_meeting <= 30 THEN 12 WHEN meeting_metrics.days_since_last_meeting <= 60 THEN 8 WHEN meeting_metrics.days_since_last_meeting <= 90 THEN 5 ELSE 0 END +
      CASE WHEN COALESCE(nps_metrics.response_count, 0) >= 5 THEN 10 WHEN COALESCE(nps_metrics.response_count, 0) >= 3 THEN 7.5 WHEN COALESCE(nps_metrics.response_count, 0) >= 1 THEN 5 ELSE 0 END) +
      (LEAST(100, COALESCE(compliance_metrics.compliance_percentage, 0)) / 100.0 * 30) +
      (20 - LEAST(20, COALESCE(action_metrics.open_actions_count, 0) * 2))
    ) < 50 THEN 'critical'
    ELSE 'at-risk'
  END as status,
  NOW() as last_refreshed
FROM nps_clients c
LEFT JOIN LATERAL (
  SELECT
    ROUND(AVG(r.score))::INTEGER as nps_score,
    COUNT(r.id)::INTEGER as response_count,
    MAX(r.response_date) as last_nps_date
  FROM nps_responses r WHERE r.client_name = c.client_name
) nps_metrics ON true
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) FILTER (WHERE m.meeting_date >= CURRENT_DATE - INTERVAL '30 days')::INTEGER as meeting_count_30d,
    COUNT(*) FILTER (WHERE m.meeting_date >= CURRENT_DATE - INTERVAL '90 days')::INTEGER as meeting_count_90d,
    MAX(m.meeting_date) as last_meeting_date,
    CASE
      WHEN MAX(m.meeting_date) IS NULL THEN 999
      ELSE (CURRENT_DATE - MAX(m.meeting_date))::INTEGER
    END as days_since_last_meeting,
    CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND((COUNT(*) FILTER (WHERE m.status = 'completed') * 100.0 / NULLIF(COUNT(*), 0)))::INTEGER END as completion_rate
  FROM unified_meetings m WHERE m.client_name = c.client_name AND (m.status IS NULL OR m.status != 'cancelled')
) meeting_metrics ON true
LEFT JOIN LATERAL (
  SELECT
    COUNT(*)::INTEGER as total_actions_count,
    COUNT(*) FILTER (WHERE a."Status" IN ('Completed', 'Closed'))::INTEGER as completed_actions_count,
    COUNT(*) FILTER (WHERE a."Status" NOT IN ('Completed', 'Closed', 'Cancelled'))::INTEGER as open_actions_count,
    COUNT(*) FILTER (WHERE a."Status" NOT IN ('Completed', 'Closed', 'Cancelled') AND a."Due_Date" IS NOT NULL AND
      CASE
        WHEN a."Due_Date" ~ '^\d{4}-\d{2}-\d{2}$' THEN a."Due_Date"::DATE
        WHEN a."Due_Date" ~ '^\d{2}/\d{2}/\d{4}$' THEN TO_DATE(a."Due_Date", 'DD/MM/YYYY')
        ELSE NULL
      END < CURRENT_DATE
    )::INTEGER as overdue_actions_count
  FROM actions a WHERE a.client = c.client_name
) action_metrics ON true
LEFT JOIN LATERAL (
  SELECT
    AVG(ec.compliance_percentage) as compliance_percentage,
    CASE WHEN AVG(ec.compliance_percentage) >= 90 THEN 'compliant' WHEN AVG(ec.compliance_percentage) >= 70 THEN 'warning' ELSE 'non-compliant' END as compliance_status
  FROM segmentation_event_compliance ec
  WHERE ec.year = EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
    AND (ec.client_name = c.client_name OR ec.client_name IN (SELECT cna.display_name FROM client_name_aliases cna WHERE cna.canonical_name = c.client_name AND cna.is_active = true))
) compliance_metrics ON true
LEFT JOIN LATERAL (
  SELECT
    ROUND(CASE WHEN SUM(COALESCE(aa.total_outstanding, 0)) > 0 THEN (SUM(COALESCE(aa.current_amount, 0) + COALESCE(aa.days_1_to_30, 0) + COALESCE(aa.days_31_to_60, 0) + COALESCE(aa.days_61_to_90, 0)) * 100.0 / SUM(aa.total_outstanding)) ELSE NULL END)::INTEGER as working_capital_percentage,
    ROUND(CASE WHEN SUM(COALESCE(aa.total_outstanding, 0)) > 0 THEN (SUM(COALESCE(aa.current_amount, 0) + COALESCE(aa.days_1_to_30, 0) + COALESCE(aa.days_31_to_60, 0)) * 100.0 / SUM(aa.total_outstanding)) ELSE NULL END)::INTEGER as percent_under_60_days,
    ROUND(CASE WHEN SUM(COALESCE(aa.total_outstanding, 0)) > 0 THEN (SUM(COALESCE(aa.current_amount, 0) + COALESCE(aa.days_1_to_30, 0) + COALESCE(aa.days_31_to_60, 0) + COALESCE(aa.days_61_to_90, 0)) * 100.0 / SUM(aa.total_outstanding)) ELSE NULL END)::INTEGER as percent_under_90_days
  FROM aging_accounts aa WHERE aa.client_name = c.client_name OR aa.client_name IN (SELECT cna.display_name FROM client_name_aliases cna WHERE cna.canonical_name = c.client_name AND cna.is_active = true)
) aging_metrics ON true
WHERE c.client_name != 'Parkway'
ORDER BY c.client_name;
    `);
    console.log('✅ View created');

    console.log('\n3. Creating indexes...');
    await client.query('CREATE UNIQUE INDEX idx_client_health_summary_client_name ON client_health_summary(client_name);');
    await client.query('CREATE INDEX idx_client_health_summary_cse ON client_health_summary(cse);');
    await client.query('CREATE INDEX idx_client_health_summary_health_score ON client_health_summary(health_score DESC);');
    await client.query('CREATE INDEX idx_client_health_summary_status ON client_health_summary(status);');
    console.log('✅ Indexes created');

    console.log('\n4. Granting permissions...');
    await client.query('GRANT SELECT ON client_health_summary TO anon, authenticated;');
    console.log('✅ Permissions granted');

    console.log('\n5. Verifying...');
    const result = await client.query('SELECT COUNT(*) as count FROM client_health_summary');
    console.log('   Rows in view:', result.rows[0].count);

    await client.query("NOTIFY pgrst, 'reload schema'");
    console.log('✅ Schema reload notification sent');

    console.log('\n🎉 client_health_summary recreated successfully!');

  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

main();
