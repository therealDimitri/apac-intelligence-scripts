import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const sql = `
-- Drop and recreate client_health_summary with latest quarter NPS
DROP MATERIALIZED VIEW IF EXISTS client_health_summary CASCADE;

CREATE MATERIALIZED VIEW client_health_summary AS
SELECT
  c.id,
  c.client_name,
  c.segment,
  c.cse,
  c.created_at,

  -- NPS metrics from LATEST QUARTER/PERIOD only
  nps.calculated_nps as nps_score,
  0 as nps_trend,
  nps.response_count as nps_response_count,
  nps.latest_period as nps_period,

  -- Meeting metrics
  meeting_metrics.meeting_count_30d,
  meeting_metrics.days_since_last_meeting,

  -- Action metrics
  action_metrics.open_action_count,
  action_metrics.completed_action_count,
  CASE
    WHEN action_metrics.open_action_count + action_metrics.completed_action_count = 0 THEN 100
    ELSE ROUND((action_metrics.completed_action_count::DECIMAL /
      (action_metrics.open_action_count + action_metrics.completed_action_count)) * 100)
  END as completion_rate,

  -- Compliance metrics
  COALESCE(compliance_metrics.compliance_percentage, 50) as compliance_percentage,

  -- Working Capital metrics
  COALESCE(working_capital.working_capital_percentage, 100) as working_capital_percentage,

  -- Health Score v3.0: NPS (40pts) + Compliance (50pts) + Working Capital (10pts)
  (
    -- NPS: normalise from -100 to +100 → 0 to 100, then apply 0.4 weight
    ((COALESCE(nps.calculated_nps, 0) + 100) / 2.0) * 0.4 +
    -- Compliance: 50% weight
    COALESCE(compliance_metrics.compliance_percentage, 50) * 0.5 +
    -- Working Capital: 10% weight
    COALESCE(working_capital.working_capital_percentage, 100) * 0.1
  )::INTEGER as health_score,

  -- Status based on health score
  CASE
    WHEN (
      ((COALESCE(nps.calculated_nps, 0) + 100) / 2.0) * 0.4 +
      COALESCE(compliance_metrics.compliance_percentage, 50) * 0.5 +
      COALESCE(working_capital.working_capital_percentage, 100) * 0.1
    ) >= 70 THEN 'Healthy'
    WHEN (
      ((COALESCE(nps.calculated_nps, 0) + 100) / 2.0) * 0.4 +
      COALESCE(compliance_metrics.compliance_percentage, 50) * 0.5 +
      COALESCE(working_capital.working_capital_percentage, 100) * 0.1
    ) >= 50 THEN 'At Risk'
    ELSE 'Critical'
  END as status

FROM clients c

-- NPS from LATEST period only
LEFT JOIN LATERAL (
  SELECT
    latest.period as latest_period,
    -- Proper NPS calculation: %Promoters - %Detractors
    ROUND(
      (COUNT(*) FILTER (WHERE nr.score >= 9)::DECIMAL / NULLIF(COUNT(*), 0) * 100) -
      (COUNT(*) FILTER (WHERE nr.score <= 6)::DECIMAL / NULLIF(COUNT(*), 0) * 100)
    )::INTEGER as calculated_nps,
    COUNT(*) as response_count
  FROM nps_responses nr
  INNER JOIN (
    -- Find the latest period for this client
    SELECT period
    FROM nps_responses
    WHERE client_name = c.client_name
       OR client_name IN (
         SELECT display_name
         FROM client_name_aliases
         WHERE canonical_name = c.client_name
           AND is_active = true
       )
    ORDER BY
      -- Sort periods: Q4 25 > Q2 25 > Q4 24 > Q2 24 > 2023
      CASE
        WHEN period LIKE 'Q% 25' THEN 2025
        WHEN period LIKE 'Q% 24' THEN 2024
        WHEN period = '2023' THEN 2023
        ELSE 2000
      END DESC,
      CASE
        WHEN period LIKE 'Q4%' THEN 4
        WHEN period LIKE 'Q3%' THEN 3
        WHEN period LIKE 'Q2%' THEN 2
        WHEN period LIKE 'Q1%' THEN 1
        ELSE 0
      END DESC
    LIMIT 1
  ) latest ON nr.period = latest.period
  WHERE nr.client_name = c.client_name
     OR nr.client_name IN (
       SELECT display_name
       FROM client_name_aliases
       WHERE canonical_name = c.client_name
         AND is_active = true
     )
  GROUP BY latest.period
) nps ON true

-- Meeting metrics
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) FILTER (WHERE m.date >= CURRENT_DATE - INTERVAL '30 days') as meeting_count_30d,
    EXTRACT(DAY FROM CURRENT_TIMESTAMP - MAX(m.date))::INTEGER as days_since_last_meeting
  FROM unified_meetings m
  WHERE m.client_name = c.client_name
     OR m.client_name IN (
       SELECT display_name
       FROM client_name_aliases
       WHERE canonical_name = c.client_name
         AND is_active = true
     )
) meeting_metrics ON true

-- Action metrics
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) FILTER (WHERE a.status IN ('Open', 'In Progress', 'Pending')) as open_action_count,
    COUNT(*) FILTER (WHERE a.status = 'Completed') as completed_action_count
  FROM actions a
  WHERE a.client = c.client_name
     OR a.client IN (
       SELECT display_name
       FROM client_name_aliases
       WHERE canonical_name = c.client_name
         AND is_active = true
     )
) action_metrics ON true

-- Compliance metrics from event_compliance_summary
LEFT JOIN LATERAL (
  SELECT
    CASE
      WHEN SUM(ecs.expected_count) = 0 THEN 100
      ELSE ROUND((SUM(ecs.actual_count)::DECIMAL / SUM(ecs.expected_count)) * 100)
    END as compliance_percentage
  FROM event_compliance_summary ecs
  WHERE ecs.client_name = c.client_name
    AND ecs.year = EXTRACT(YEAR FROM CURRENT_DATE)
) compliance_metrics ON true

-- Working Capital metrics from aged_accounts_receivable
LEFT JOIN LATERAL (
  SELECT
    CASE
      WHEN COALESCE(SUM(total_outstanding), 0) = 0 THEN 100
      ELSE ROUND(
        (1.0 - (COALESCE(SUM(over_90_days), 0)::DECIMAL / NULLIF(SUM(total_outstanding), 0))) * 100
      )
    END as working_capital_percentage
  FROM aged_accounts_receivable aar
  WHERE aar.client_name = c.client_name
     OR aar.client_name IN (
       SELECT display_name
       FROM client_name_aliases
       WHERE canonical_name = c.client_name
         AND is_active = true
     )
) working_capital ON true

WHERE c.is_active = true;

-- Create indexes for performance
CREATE UNIQUE INDEX idx_client_health_summary_id ON client_health_summary(id);
CREATE INDEX idx_client_health_summary_name ON client_health_summary(client_name);
CREATE INDEX idx_client_health_summary_health ON client_health_summary(health_score);
CREATE INDEX idx_client_health_summary_status ON client_health_summary(status);

-- Grant access
GRANT SELECT ON client_health_summary TO anon, authenticated;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
`

async function runMigration() {
  console.log('Updating client_health_summary to use latest quarter NPS...')

  const { error } = await supabase.rpc('exec_sql', { sql_query: sql })

  if (error) {
    console.error('Error:', error.message)
    // Try direct query approach
    console.log('Trying alternative approach...')

    // This won't work via Supabase JS, need to use SQL Editor
    console.log('\n=== SQL to run in Supabase Dashboard ===')
    console.log(sql)
  } else {
    console.log('Success!')
  }

  // Verify the change
  const { data } = await supabase
    .from('client_health_summary')
    .select('client_name, nps_score, nps_period, health_score')
    .ilike('client_name', '%gippsland%')

  console.log('\nGHA after update:')
  console.table(data)
}

runMigration()
