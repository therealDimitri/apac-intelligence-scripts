/**
 * Apply the client_health_summary view migration via exec_sql RPC
 *
 * FIXES APPLIED:
 * - Removed segmentation_clients join (table doesn't exist)
 * - Using c.segment from nps_clients directly
 * - Fixed unified_meetings columns: client → client_name, date → meeting_date
 * - Fixed aging_accounts columns: ar_0_30 → days_1_to_30, total_ar → total_outstanding
 * - Fixed nps_responses column: submitted_at → created_at
 */
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error('Missing Supabase credentials')
}

// TypeScript narrowing - these are now guaranteed to be strings
const supabaseUrl: string = SUPABASE_URL
const serviceKey: string = SERVICE_KEY

async function execSql(sql: string): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql_query: sql }),
  })

  const result = await response.json()
  return result
}

async function applyMigration() {
  console.log('Applying client_health_summary view migration...\n')

  // Step 0: Set datestyle to ISO to ensure correct date parsing
  console.log('0. Setting datestyle to ISO...')
  const setDateStyle = await execSql("SET datestyle = 'ISO, DMY'")
  console.log('   Result:', setDateStyle.message)

  // Step 1: Create the new materialized view with CORRECT table/column names
  const createViewSql = `
SET datestyle = 'ISO, DMY';
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
    ) >= 75 THEN 'healthy'
    WHEN ROUND(
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
    ) < 50 THEN 'critical'
    ELSE 'at-risk'
  END as status,
  NOW() as last_refreshed
FROM nps_clients c
LEFT JOIN LATERAL (
  SELECT
    ROUND(AVG(r.score))::INTEGER as nps_score,
    COUNT(r.id) as response_count,
    MAX(r.created_at) as last_nps_date
  FROM nps_responses r
  WHERE r.client_name = c.client_name
) nps_metrics ON true
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) FILTER (WHERE TO_DATE(m.meeting_date::text, 'YYYY-MM-DD') >= CURRENT_DATE - INTERVAL '30 days') as meeting_count_30d,
    COUNT(*) FILTER (WHERE TO_DATE(m.meeting_date::text, 'YYYY-MM-DD') >= CURRENT_DATE - INTERVAL '90 days') as meeting_count_90d,
    MAX(TO_DATE(m.meeting_date::text, 'YYYY-MM-DD')) as last_meeting_date,
    COALESCE(CURRENT_DATE - MAX(TO_DATE(m.meeting_date::text, 'YYYY-MM-DD')), 999) as days_since_last_meeting,
    CASE
      WHEN COUNT(*) = 0 THEN 0
      ELSE ROUND((COUNT(*) FILTER (WHERE m.status = 'completed') * 100.0 / NULLIF(COUNT(*), 0)))::INTEGER
    END as completion_rate
  FROM unified_meetings m
  WHERE m.client_name = c.client_name
    AND m.status != 'cancelled'
) meeting_metrics ON true
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) as total_actions_count,
    COUNT(*) FILTER (WHERE a."Status" IN ('Completed', 'Closed')) as completed_actions_count,
    COUNT(*) FILTER (WHERE a."Status" NOT IN ('Completed', 'Closed', 'Cancelled')) as open_actions_count,
    COUNT(*) FILTER (
      WHERE a."Status" NOT IN ('Completed', 'Closed', 'Cancelled')
        AND a."Due_Date" IS NOT NULL
        AND (
          CASE
            WHEN a."Due_Date" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN TO_DATE(a."Due_Date", 'YYYY-MM-DD')
            WHEN a."Due_Date" ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$' THEN TO_DATE(a."Due_Date", 'DD/MM/YYYY')
            ELSE NULL
          END
        ) < CURRENT_DATE
    ) as overdue_actions_count
  FROM actions a
  WHERE a.client = c.client_name
) action_metrics ON true
LEFT JOIN LATERAL (
  SELECT
    AVG(ec.compliance_percentage) as compliance_percentage,
    CASE
      WHEN AVG(ec.compliance_percentage) >= 90 THEN 'compliant'
      WHEN AVG(ec.compliance_percentage) >= 70 THEN 'warning'
      ELSE 'non-compliant'
    END as compliance_status
  FROM segmentation_event_compliance ec
  WHERE (
      ec.year = EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
      OR ec.year = (EXTRACT(YEAR FROM CURRENT_DATE) - 1)::INTEGER
    )
    AND (
      ec.client_name = c.client_name
      OR ec.client_name IN (
        SELECT cna.display_name
        FROM client_name_aliases cna
        WHERE cna.canonical_name = c.client_name
          AND cna.is_active = true
      )
    )
) compliance_metrics ON true
LEFT JOIN LATERAL (
  SELECT
    ROUND(
      CASE
        WHEN SUM(COALESCE(aa.total_outstanding, 0)) > 0
        THEN (SUM(COALESCE(aa.days_1_to_30, 0) + COALESCE(aa.days_31_to_60, 0) + COALESCE(aa.days_61_to_90, 0)) * 100.0 / SUM(aa.total_outstanding))
        ELSE NULL
      END
    )::INTEGER as working_capital_percentage,
    ROUND(
      CASE
        WHEN SUM(COALESCE(aa.total_outstanding, 0)) > 0
        THEN (SUM(COALESCE(aa.days_1_to_30, 0) + COALESCE(aa.days_31_to_60, 0)) * 100.0 / SUM(aa.total_outstanding))
        ELSE NULL
      END
    )::INTEGER as percent_under_60_days,
    ROUND(
      CASE
        WHEN SUM(COALESCE(aa.total_outstanding, 0)) > 0
        THEN (SUM(COALESCE(aa.days_1_to_30, 0) + COALESCE(aa.days_31_to_60, 0) + COALESCE(aa.days_61_to_90, 0)) * 100.0 / SUM(aa.total_outstanding))
        ELSE NULL
      END
    )::INTEGER as percent_under_90_days
  FROM aging_accounts aa
  WHERE aa.client_name = c.client_name
    OR aa.client_name IN (
      SELECT cna.display_name
      FROM client_name_aliases cna
      WHERE cna.canonical_name = c.client_name
        AND cna.is_active = true
    )
) aging_metrics ON true
WHERE c.client_name != 'Parkway'
ORDER BY c.client_name
`

  console.log('1. Creating materialized view...')
  let result = await execSql(createViewSql)
  console.log('   Result:', result.message)

  if (!result.success) {
    console.error('Failed to create view:', result)
    return
  }

  // Step 2: Create indexes
  console.log('\n2. Creating indexes...')

  const indexes = [
    'CREATE UNIQUE INDEX idx_client_health_summary_client_name ON client_health_summary(client_name)',
    'CREATE INDEX idx_client_health_summary_cse ON client_health_summary(cse)',
    'CREATE INDEX idx_client_health_summary_health_score ON client_health_summary(health_score DESC)',
    'CREATE INDEX idx_client_health_summary_status ON client_health_summary(status)',
  ]

  for (const indexSql of indexes) {
    result = await execSql(indexSql)
    console.log('   Index:', result.message)
  }

  // Step 3: Verify the fix
  console.log('\n3. Verifying the fix...')
  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(SUPABASE_URL!, SERVICE_KEY!)

  const { data: healthData } = await supabase
    .from('client_health_summary')
    .select('client_name, compliance_percentage, health_score, status')
    .limit(10)

  console.log('\n=== Updated Health Summary ===')
  healthData?.forEach(h => {
    console.log(
      `${h.client_name}: compliance=${h.compliance_percentage}%, health=${h.health_score}, status=${h.status}`
    )
  })

  console.log('\n✅ Migration complete!')
}

applyMigration().catch(console.error)
