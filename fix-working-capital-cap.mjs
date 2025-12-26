import pg from 'pg'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const { Pool } = pg

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Use session mode (port 5432) for DDL operations
const sessionUrl = process.env.DATABASE_URL?.replace(':6543/', ':5432/') || process.env.DATABASE_URL
const pool = new Pool({
  connectionString: sessionUrl,
  ssl: { rejectUnauthorized: false }
})

async function fixView() {
  const client = await pool.connect()

  try {
    console.log('📊 Checking current GHA health score...')
    const beforeResult = await client.query(`
      SELECT client_name, health_score, working_capital_percentage
      FROM client_health_summary
      WHERE client_name ILIKE '%Gippsland%'
    `)
    console.log('Before fix:', beforeResult.rows[0])

    // Drop and recreate with capped working capital
    console.log('\n🔄 Dropping existing view...')
    await client.query('DROP MATERIALIZED VIEW IF EXISTS client_health_summary CASCADE')

  const sql = `
CREATE MATERIALIZED VIEW client_health_summary AS
SELECT
  c.id, c.client_name, c.segment, c.cse, c.created_at, c.updated_at,
  nps.calculated_nps as nps_score,
  nps.promoter_count, nps.passive_count, nps.detractor_count,
  nps.response_count, nps.last_response_date,
  nps.latest_period as nps_period,
  meeting_metrics.last_meeting_date,
  meeting_metrics.meeting_count_30d, meeting_metrics.meeting_count_90d,
  meeting_metrics.days_since_last_meeting,
  action_metrics.total_actions_count, action_metrics.completed_actions_count,
  action_metrics.open_actions_count, 0 as overdue_actions_count,
  action_metrics.completion_rate,
  COALESCE(compliance_metrics.compliance_percentage, 50) as compliance_percentage,
  COALESCE(compliance_metrics.compliance_status, 'Unknown') as compliance_status,
  -- CAPPED working capital (0-100)
  LEAST(100, GREATEST(0, working_capital.working_capital_percentage)) as working_capital_percentage,
  working_capital.total_outstanding,
  working_capital.amount_under_90_days,
  working_capital.amount_over_90_days,
  -- Health score with CAPPED working capital
  (
    ((COALESCE(nps.calculated_nps, 0) + 100) / 2.0) * 0.4 +
    COALESCE(compliance_metrics.compliance_percentage, 50) * 0.5 +
    LEAST(100, GREATEST(0, COALESCE(working_capital.working_capital_percentage, 100))) * 0.1
  )::INTEGER as health_score,
  CASE
    WHEN (
      ((COALESCE(nps.calculated_nps, 0) + 100) / 2.0) * 0.4 +
      COALESCE(compliance_metrics.compliance_percentage, 50) * 0.5 +
      LEAST(100, GREATEST(0, COALESCE(working_capital.working_capital_percentage, 100))) * 0.1
    ) >= 70 THEN 'Healthy'
    WHEN (
      ((COALESCE(nps.calculated_nps, 0) + 100) / 2.0) * 0.4 +
      COALESCE(compliance_metrics.compliance_percentage, 50) * 0.5 +
      LEAST(100, GREATEST(0, COALESCE(working_capital.working_capital_percentage, 100))) * 0.1
    ) >= 50 THEN 'At Risk'
    ELSE 'Critical'
  END as status,
  NOW() as last_refreshed
FROM nps_clients c
LEFT JOIN LATERAL (
  SELECT
    latest.period as latest_period,
    ROUND((COUNT(*) FILTER (WHERE nr.score >= 9)::DECIMAL / NULLIF(COUNT(*), 0) * 100) -
          (COUNT(*) FILTER (WHERE nr.score <= 6)::DECIMAL / NULLIF(COUNT(*), 0) * 100))::INTEGER as calculated_nps,
    COUNT(*) FILTER (WHERE nr.score >= 9) as promoter_count,
    COUNT(*) FILTER (WHERE nr.score >= 7 AND nr.score <= 8) as passive_count,
    COUNT(*) FILTER (WHERE nr.score <= 6) as detractor_count,
    COUNT(*) as response_count,
    MAX(nr.response_date) as last_response_date
  FROM nps_responses nr
  INNER JOIN (
    SELECT period FROM nps_responses WHERE client_id = c.id
    ORDER BY
      CASE WHEN period LIKE 'Q% 25' THEN 2025 WHEN period LIKE 'Q% 24' THEN 2024 WHEN period = '2023' THEN 2023 ELSE 2000 END DESC,
      CASE WHEN period LIKE 'Q4%' THEN 4 WHEN period LIKE 'Q3%' THEN 3 WHEN period LIKE 'Q2%' THEN 2 WHEN period LIKE 'Q1%' THEN 1 ELSE 0 END DESC
    LIMIT 1
  ) latest ON nr.period = latest.period
  WHERE nr.client_id = c.id
  GROUP BY latest.period
) nps ON true
LEFT JOIN LATERAL (
  SELECT
    MAX(m.meeting_date) as last_meeting_date,
    COUNT(*) FILTER (WHERE m.meeting_date >= CURRENT_DATE - INTERVAL '30 days') as meeting_count_30d,
    COUNT(*) FILTER (WHERE m.meeting_date >= CURRENT_DATE - INTERVAL '90 days') as meeting_count_90d,
    EXTRACT(DAY FROM CURRENT_TIMESTAMP - MAX(m.meeting_date))::INTEGER as days_since_last_meeting
  FROM unified_meetings m WHERE m.client_id = c.id
) meeting_metrics ON true
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) as total_actions_count,
    COUNT(*) FILTER (WHERE a."Status" = 'Completed') as completed_actions_count,
    COUNT(*) FILTER (WHERE a."Status" IN ('Open', 'In Progress', 'Pending', 'To Do')) as open_actions_count,
    CASE WHEN COUNT(*) = 0 THEN 100 ELSE ROUND((COUNT(*) FILTER (WHERE a."Status" = 'Completed')::DECIMAL / COUNT(*)) * 100) END as completion_rate
  FROM actions a WHERE a.client_id = c.id
) action_metrics ON true
LEFT JOIN LATERAL (
  SELECT ecs.overall_compliance_score as compliance_percentage, ecs.overall_status as compliance_status
  FROM event_compliance_summary ecs
  WHERE (ecs.client_name = c.client_name
     OR ecs.client_name IN (SELECT display_name FROM client_name_aliases WHERE canonical_name = c.client_name AND is_active = true)
     OR ecs.client_name IN (SELECT canonical_name FROM client_name_aliases WHERE display_name = c.client_name AND is_active = true))
    AND ecs.year = EXTRACT(YEAR FROM CURRENT_DATE)
  LIMIT 1
) compliance_metrics ON true
LEFT JOIN LATERAL (
  SELECT
    CASE
      WHEN COALESCE(SUM(aa.total_outstanding), 0) = 0 THEN NULL
      ELSE ROUND(
        (1.0 - (
          COALESCE(SUM(COALESCE(aa.days_91_to_120, 0) + COALESCE(aa.days_121_to_180, 0) + COALESCE(aa.days_181_to_270, 0) + COALESCE(aa.days_271_to_365, 0) + COALESCE(aa.days_over_365, 0)), 0)::DECIMAL
          / NULLIF(SUM(aa.total_outstanding), 0)
        )) * 100
      )
    END as working_capital_percentage,
    SUM(aa.total_outstanding) as total_outstanding,
    SUM(COALESCE(aa.current_amount, 0) + COALESCE(aa.days_1_to_30, 0) + COALESCE(aa.days_31_to_60, 0) + COALESCE(aa.days_61_to_90, 0)) as amount_under_90_days,
    SUM(COALESCE(aa.days_91_to_120, 0) + COALESCE(aa.days_121_to_180, 0) + COALESCE(aa.days_181_to_270, 0) + COALESCE(aa.days_271_to_365, 0) + COALESCE(aa.days_over_365, 0)) as amount_over_90_days
  FROM aging_accounts aa
  WHERE aa.client_id = c.id AND aa.is_inactive = false
) working_capital ON true
`

    console.log('✅ Creating view with capped working capital...')
    await client.query(sql)

    console.log('📇 Creating indexes...')
    await client.query('CREATE UNIQUE INDEX idx_client_health_summary_id ON client_health_summary(id)')
    await client.query('CREATE INDEX idx_client_health_summary_name ON client_health_summary(client_name)')
    await client.query('CREATE INDEX idx_client_health_summary_health ON client_health_summary(health_score)')
    await client.query('CREATE INDEX idx_client_health_summary_status ON client_health_summary(status)')

    console.log('🔐 Granting access...')
    await client.query('GRANT SELECT ON client_health_summary TO anon, authenticated')

    console.log('🔔 Notifying PostgREST...')
    await client.query("NOTIFY pgrst, 'reload schema'")

    // Verify fix
    console.log('\n📊 Verifying fix...')
    const afterResult = await client.query(`
      SELECT client_name, nps_score, compliance_percentage, working_capital_percentage, health_score, status
      FROM client_health_summary
      WHERE client_name ILIKE '%Gippsland%'
    `)
    console.log('After fix:', afterResult.rows[0])

    const healthScore = afterResult.rows[0]?.health_score
    if (healthScore && healthScore <= 100 && healthScore >= 0) {
      console.log('\n✅ SUCCESS: Health score is now within valid range (0-100)')
    } else {
      console.log('\n⚠️ WARNING: Health score may still need adjustment')
    }
  } catch (error) {
    console.error('❌ Error:', error.message)
    if (error.detail) console.error('   Detail:', error.detail)
  } finally {
    client.release()
    await pool.end()
  }
}

fixView()
