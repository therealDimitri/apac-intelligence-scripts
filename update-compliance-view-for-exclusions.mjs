#!/usr/bin/env node
/**
 * Update the event_compliance_summary view to respect client exclusions
 * This recreates the view with the exclusion logic
 */

import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const { Pool } = pg

// Parse the DATABASE_URL for connection details
// Try DATABASE_URL_DIRECT first (direct connection), fall back to DATABASE_URL
const connectionString = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL
const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
})

const viewSQL = `
-- Drop and recreate the materialized view with exclusion support
DROP MATERIALIZED VIEW IF EXISTS event_compliance_summary CASCADE;

CREATE MATERIALIZED VIEW event_compliance_summary AS
WITH
client_segment_periods AS (
  SELECT DISTINCT
    cs.client_name,
    cs.tier_id,
    COALESCE(t.tier_name, c.segment) as segment,
    c.cse,
    EXTRACT(YEAR FROM cs.effective_from)::INTEGER as year
  FROM client_segmentation cs
  JOIN segmentation_tiers t ON t.id = cs.tier_id
  LEFT JOIN nps_clients c ON c.client_name = cs.client_name
  WHERE cs.effective_from IS NOT NULL
    AND cs.client_name != 'Parkway'

  UNION

  SELECT DISTINCT
    c.client_name,
    t.id as tier_id,
    c.segment,
    c.cse,
    EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER as year
  FROM nps_clients c
  LEFT JOIN segmentation_tiers t ON t.tier_name = c.segment
  WHERE c.segment IS NOT NULL
    AND c.client_name != 'Parkway'
    AND NOT EXISTS (
      SELECT 1 FROM client_segmentation cs2
      WHERE cs2.client_name = c.client_name
    )
),

latest_segment AS (
  SELECT DISTINCT ON (client_name, year)
    client_name,
    segment,
    cse,
    year
  FROM client_segment_periods
  ORDER BY client_name, year, segment DESC
),

tier_requirements AS (
  SELECT
    ter.tier_id,
    ter.event_type_id,
    ter.frequency as expected_frequency,
    et.event_name,
    et.event_code
  FROM tier_event_requirements ter
  JOIN segmentation_event_types et ON et.id = ter.event_type_id
  WHERE ter.frequency > 0
),

-- UPDATED: Combine requirements with client-specific exclusions support
combined_requirements AS (
  SELECT
    csp.client_name,
    csp.year,
    tr.event_type_id,
    tr.event_name,
    tr.event_code,
    MAX(tr.expected_frequency) as expected_count
  FROM client_segment_periods csp
  INNER JOIN tier_requirements tr ON tr.tier_id = csp.tier_id
  -- EXCLUDE client-specific exclusions
  WHERE NOT EXISTS (
    SELECT 1 FROM client_event_exclusions cee
    WHERE cee.client_name = csp.client_name
      AND cee.event_type_id = tr.event_type_id
  )
  GROUP BY
    csp.client_name,
    csp.year,
    tr.event_type_id,
    tr.event_name,
    tr.event_code
),

event_counts AS (
  SELECT
    se.client_name,
    se.event_year,
    se.event_type_id,
    COUNT(*) FILTER (WHERE se.completed = true) as completed_count,
    COUNT(*) as total_count,
    json_agg(
      json_build_object(
        'id', se.id,
        'event_date', se.event_date,
        'period', se.period,
        'completed', se.completed,
        'completed_date', se.completed_date,
        'notes', se.notes,
        'meeting_link', se.meeting_link
      )
      ORDER BY se.event_date DESC
    ) FILTER (WHERE se.completed = true) as completed_events
  FROM segmentation_events se
  GROUP BY se.client_name, se.event_year, se.event_type_id
),

event_type_compliance AS (
  SELECT
    cr.client_name,
    cr.year,
    cr.event_type_id,
    cr.event_name,
    cr.event_code,
    cr.expected_count,
    COALESCE(ec.completed_count, 0) as actual_count,
    COALESCE(ec.completed_events, '[]'::json) as events,
    CASE
      WHEN cr.expected_count > 0 THEN
        ROUND((COALESCE(ec.completed_count, 0)::DECIMAL / cr.expected_count) * 100)
      WHEN COALESCE(ec.completed_count, 0) > 0 THEN 100
      ELSE 0
    END as compliance_percentage,
    CASE
      WHEN cr.expected_count > 0 THEN
        CASE
          WHEN ROUND((COALESCE(ec.completed_count, 0)::DECIMAL / cr.expected_count) * 100) < 50 THEN 'critical'
          WHEN ROUND((COALESCE(ec.completed_count, 0)::DECIMAL / cr.expected_count) * 100) < 100 THEN 'at-risk'
          WHEN ROUND((COALESCE(ec.completed_count, 0)::DECIMAL / cr.expected_count) * 100) = 100 THEN 'compliant'
          ELSE 'exceeded'
        END
      WHEN COALESCE(ec.completed_count, 0) > 0 THEN 'exceeded'
      ELSE 'critical'
    END as status,
    'high' as priority_level,
    TRUE as is_mandatory
  FROM combined_requirements cr
  LEFT JOIN event_counts ec
    ON ec.client_name = cr.client_name
    AND ec.event_year = cr.year
    AND ec.event_type_id = cr.event_type_id
),

client_year_summary AS (
  SELECT
    etc.client_name,
    ls.segment,
    ls.cse,
    etc.year,
    json_agg(
      json_build_object(
        'event_type_id', etc.event_type_id,
        'event_type_name', etc.event_name,
        'event_code', etc.event_code,
        'expected_count', etc.expected_count,
        'actual_count', etc.actual_count,
        'compliance_percentage', etc.compliance_percentage,
        'status', etc.status,
        'priority_level', etc.priority_level,
        'is_mandatory', etc.is_mandatory,
        'events', etc.events
      )
      ORDER BY
        etc.is_mandatory DESC,
        etc.compliance_percentage ASC
    ) as event_compliance,
    COUNT(*) as total_event_types_count,
    COUNT(*) FILTER (WHERE etc.compliance_percentage >= 100) as compliant_event_types_count,
    ROUND(
      (COUNT(*) FILTER (WHERE etc.compliance_percentage >= 100)::DECIMAL /
       NULLIF(COUNT(*), 0)) * 100
    ) as overall_compliance_score,
    CASE
      WHEN ROUND(
        (COUNT(*) FILTER (WHERE etc.compliance_percentage >= 100)::DECIMAL /
         NULLIF(COUNT(*), 0)) * 100
      ) < 50 THEN 'critical'
      WHEN ROUND(
        (COUNT(*) FILTER (WHERE etc.compliance_percentage >= 100)::DECIMAL /
         NULLIF(COUNT(*), 0)) * 100
      ) < 100 THEN 'at-risk'
      ELSE 'compliant'
    END as overall_status,
    NOW() as last_updated
  FROM event_type_compliance etc
  INNER JOIN latest_segment ls
    ON ls.client_name = etc.client_name
    AND ls.year = etc.year
  GROUP BY etc.client_name, ls.segment, ls.cse, etc.year
)

SELECT
  client_name,
  segment,
  cse,
  year,
  event_compliance,
  overall_compliance_score,
  overall_status,
  compliant_event_types_count,
  total_event_types_count,
  last_updated
FROM client_year_summary
ORDER BY year DESC, client_name;

-- Recreate indexes
CREATE INDEX idx_event_compliance_client_year ON event_compliance_summary(client_name, year);
CREATE INDEX idx_event_compliance_cse ON event_compliance_summary(cse);
CREATE INDEX idx_event_compliance_year ON event_compliance_summary(year DESC);
CREATE INDEX idx_event_compliance_status ON event_compliance_summary(overall_status);
CREATE INDEX idx_event_compliance_segment ON event_compliance_summary(segment);
CREATE INDEX idx_event_compliance_cse_year ON event_compliance_summary(cse, year DESC);
CREATE UNIQUE INDEX idx_event_compliance_unique_client_year ON event_compliance_summary(client_name, year);

-- Grant permissions
GRANT SELECT ON event_compliance_summary TO anon, authenticated;
`;

async function main() {
  console.log('\n=== Updating Compliance View with Exclusion Support ===\n')

  try {
    console.log('1. Connecting to database...')
    const client = await pool.connect()
    console.log('   ✓ Connected')

    console.log('\n2. Recreating event_compliance_summary view...')
    await client.query(viewSQL)
    console.log('   ✓ View recreated with exclusion support')

    // Verify
    console.log('\n3. Verifying Department of Health - Victoria...')
    const result = await client.query(`
      SELECT client_name, overall_compliance_score, event_compliance
      FROM event_compliance_summary
      WHERE client_name = 'Department of Health - Victoria'
        AND year = 2025
    `)

    if (result.rows.length > 0) {
      const row = result.rows[0]
      console.log('   Client:', row.client_name)
      console.log('   Overall Score:', row.overall_compliance_score, '%')

      const events = row.event_compliance || []
      const healthCheck = events.find(e => e.event_type_name === 'Health Check (Opal)')

      if (healthCheck) {
        console.log('\n   ⚠️  Health Check (Opal) still appears!')
      } else {
        console.log('\n   ✓ Health Check (Opal) successfully excluded!')
        console.log('\n   Event types now required:')
        events.forEach(e => {
          console.log(`    - ${e.event_type_name}: ${e.actual_count}/${e.expected_count} (${e.compliance_percentage}%)`)
        })
      }
    } else {
      console.log('   No data found for Department of Health - Victoria')
    }

    client.release()
  } catch (error) {
    console.error('Error:', error.message)
    if (error.code) console.error('Code:', error.code)
  } finally {
    await pool.end()
  }

  console.log('\n=== Done ===\n')
}

main()
