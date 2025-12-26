/**
 * Update event_compliance_summary view with proper exclusion logic
 * Only applies exclusions where reason is NOT "Greyed out in Excel"
 * This fixes DoH Victoria's Health Check (Opal) exclusion while preserving
 * all event types for clients with only informational exclusions
 */

import postgres from 'postgres'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD

// Extract project ref from URL
const projectRef = SUPABASE_URL?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]

// Connection strings to try
const connectionStrings = [
  `postgresql://postgres.${projectRef}:${DB_PASSWORD}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`,
  `postgresql://postgres.${projectRef}:${DB_PASSWORD}@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`,
]

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function main() {
  console.log('\n=== Updating Event Compliance View with Proper Exclusions ===\n')

  // Step 1: Check current state for DoH Victoria
  console.log('1. Current state for Department of Health - Victoria...')
  const { data: before } = await supabase
    .from('event_compliance_summary')
    .select('overall_compliance_score, total_event_types_count, event_compliance')
    .eq('client_name', 'Department of Health - Victoria')
    .eq('year', 2025)
    .single()

  if (before) {
    console.log('   Score:', before.overall_compliance_score + '%')
    console.log('   Event Types:', before.total_event_types_count)
    const hasHealthCheck = before.event_compliance?.some(e => e.event_type_name?.includes('Health Check'))
    console.log('   Has Health Check (Opal):', hasHealthCheck ? 'YES (needs to be excluded)' : 'NO')
  }

  // Step 2: Connect to database
  console.log('\n2. Connecting to database...')

  let sql = null
  for (const connStr of connectionStrings) {
    const maskedStr = connStr.replace(/:[^:@]+@/, ':****@')
    console.log(`   Trying: ${maskedStr.substring(0, 80)}...`)

    try {
      const testSql = postgres(connStr, {
        ssl: { rejectUnauthorized: false },
        max: 1,
        idle_timeout: 10,
        connect_timeout: 15,
        prepare: false,
      })

      const [result] = await testSql`SELECT current_database() as db, current_user as user`
      console.log(`   ✅ Connected to: ${result.db} as ${result.user}`)
      sql = testSql
      break
    } catch (err) {
      console.log(`   ❌ Failed: ${err.message}`)
    }
  }

  if (!sql) {
    console.error('\n❌ Could not connect to database')
    console.log('\nPlease run the SQL manually in Supabase Dashboard')
    process.exit(1)
  }

  try {
    // Step 3: Execute migration with proper exclusion logic
    console.log('\n3. Updating event_compliance_summary view...')

    // Drop existing view
    console.log('   Dropping existing view...')
    await sql`DROP MATERIALIZED VIEW IF EXISTS event_compliance_summary CASCADE`
    console.log('   ✅ View dropped.')

    // Create view WITH proper exclusion logic
    console.log('   Creating view with proper exclusion filter...')
    await sql.unsafe(`
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
        -- ONLY exclude event types where there's a business-decision exclusion
        -- (NOT "Greyed out in Excel" informational exclusions)
        WHERE NOT EXISTS (
          SELECT 1 FROM client_event_exclusions cee
          WHERE cee.client_name = csp.client_name
            AND cee.event_type_id = tr.event_type_id
            AND cee.reason NOT LIKE '%Greyed out%'
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
      ORDER BY year DESC, client_name
    `)
    console.log('   ✅ View created with exclusion filter.')

    // Create indexes
    console.log('   Creating indexes...')
    await sql.unsafe(`
      CREATE INDEX idx_event_compliance_client_year ON event_compliance_summary(client_name, year);
      CREATE INDEX idx_event_compliance_cse ON event_compliance_summary(cse);
      CREATE INDEX idx_event_compliance_year ON event_compliance_summary(year DESC);
      CREATE INDEX idx_event_compliance_status ON event_compliance_summary(overall_status);
      CREATE INDEX idx_event_compliance_segment ON event_compliance_summary(segment);
      CREATE INDEX idx_event_compliance_cse_year ON event_compliance_summary(cse, year DESC);
      CREATE UNIQUE INDEX idx_event_compliance_unique_client_year ON event_compliance_summary(client_name, year);
    `)
    console.log('   ✅ Indexes created.')

    // Grant permissions
    await sql`GRANT SELECT ON event_compliance_summary TO anon, authenticated`
    await sql`NOTIFY pgrst, 'reload schema'`
    console.log('   ✅ Permissions granted.')

    // Step 4: Recreate client_health_summary (dropped by CASCADE)
    console.log('\n4. Recreating client_health_summary view...')

    await sql.unsafe(`
      DROP MATERIALIZED VIEW IF EXISTS client_health_summary CASCADE;

      CREATE MATERIALIZED VIEW client_health_summary AS
      SELECT
        c.id,
        c.client_name,
        c.cse,
        c.segment,
        COALESCE(nps.current_score, 0) as nps_score,
        COALESCE(nps.trend, 0) as nps_trend,
        COALESCE(nps.response_count, 0) as nps_response_count,
        compliance_metrics.compliance_percentage,
        compliance_metrics.compliance_status,
        COALESCE(engagement.meeting_count, 0) as meeting_count,
        COALESCE(engagement.action_count, 0) as action_count,
        COALESCE(engagement.open_action_count, 0) as open_action_count,
        (
          COALESCE(nps.current_score, 0) * 0.4 +
          compliance_metrics.compliance_percentage * 0.4 +
          LEAST(COALESCE(engagement.meeting_count, 0) * 5, 20) +
          GREATEST(20 - COALESCE(engagement.open_action_count, 0) * 2, 0)
        )::INTEGER as health_score,
        CASE
          WHEN (
            COALESCE(nps.current_score, 0) * 0.4 +
            compliance_metrics.compliance_percentage * 0.4 +
            LEAST(COALESCE(engagement.meeting_count, 0) * 5, 20) +
            GREATEST(20 - COALESCE(engagement.open_action_count, 0) * 2, 0)
          ) >= 70 THEN 'healthy'
          WHEN (
            COALESCE(nps.current_score, 0) * 0.4 +
            compliance_metrics.compliance_percentage * 0.4 +
            LEAST(COALESCE(engagement.meeting_count, 0) * 5, 20) +
            GREATEST(20 - COALESCE(engagement.open_action_count, 0) * 2, 0)
          ) >= 50 THEN 'at-risk'
          ELSE 'critical'
        END as health_status,
        NOW() as last_updated
      FROM nps_clients c
      LEFT JOIN LATERAL (
        SELECT
          AVG(score)::INTEGER as current_score,
          (AVG(score) - LAG(AVG(score)) OVER (ORDER BY MAX(response_date)))::INTEGER as trend,
          COUNT(*) as response_count
        FROM nps_responses nr
        WHERE nr.client_name = c.client_name
          OR nr.client_name IN (SELECT alias FROM client_aliases WHERE canonical_name = c.client_name)
        GROUP BY nr.client_name
        ORDER BY MAX(response_date) DESC
        LIMIT 1
      ) nps ON true
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(ecs.overall_compliance_score, 0) as compliance_percentage,
          COALESCE(ecs.overall_status, 'critical') as compliance_status
        FROM event_compliance_summary ecs
        WHERE ecs.client_name = c.client_name
          AND ecs.year = EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
      ) compliance_metrics ON true
      LEFT JOIN LATERAL (
        SELECT
          COUNT(DISTINCT um.id) as meeting_count,
          COUNT(DISTINCT a.id) as action_count,
          COUNT(DISTINCT a.id) FILTER (WHERE a."Status" != 'Completed') as open_action_count
        FROM unified_meetings um
        LEFT JOIN actions a ON a.client = c.client_name
        WHERE um.client_name = c.client_name
          AND um.meeting_date >= CURRENT_DATE - INTERVAL '90 days'
      ) engagement ON true
      WHERE c.segment IS NOT NULL
      ORDER BY health_score DESC;

      CREATE INDEX idx_client_health_client ON client_health_summary(client_name);
      CREATE INDEX idx_client_health_cse ON client_health_summary(cse);
      CREATE INDEX idx_client_health_score ON client_health_summary(health_score DESC);
      CREATE INDEX idx_client_health_status ON client_health_summary(health_status);

      GRANT SELECT ON client_health_summary TO anon, authenticated;
      NOTIFY pgrst, 'reload schema';
    `)
    console.log('   ✅ Client health summary view recreated!')

  } catch (err) {
    console.error('\n   ❌ Migration failed:', err.message)
    if (err.detail) console.error('   Detail:', err.detail)
    process.exit(1)
  } finally {
    await sql.end()
  }

  // Step 5: Verify the fix
  console.log('\n5. Verifying migration...')
  await new Promise(r => setTimeout(r, 3000))

  // Check DoH Victoria
  const { data: afterDoH } = await supabase
    .from('event_compliance_summary')
    .select('overall_compliance_score, total_event_types_count, event_compliance')
    .eq('client_name', 'Department of Health - Victoria')
    .eq('year', 2025)
    .single()

  if (afterDoH) {
    console.log('\n   Department of Health - Victoria:')
    console.log('   Score:', afterDoH.overall_compliance_score + '%')
    console.log('   Event Types:', afterDoH.total_event_types_count)
    const hasHealthCheck = afterDoH.event_compliance?.some(e => e.event_type_name?.includes('Health Check'))
    console.log('   Has Health Check (Opal):', hasHealthCheck ? 'YES ❌ (still appearing)' : 'NO ✅ (correctly excluded)')
    console.log('   Event Types:', afterDoH.event_compliance?.map(e => e.event_type_name).join(', '))
  }

  // Check Te Whatu Ora Waikato (should still have 9 event types)
  const { data: afterWaikato } = await supabase
    .from('event_compliance_summary')
    .select('overall_compliance_score, total_event_types_count')
    .eq('client_name', 'Te Whatu Ora Waikato')
    .eq('year', 2025)
    .single()

  if (afterWaikato) {
    console.log('\n   Te Whatu Ora Waikato:')
    console.log('   Score:', afterWaikato.overall_compliance_score + '%')
    console.log('   Event Types:', afterWaikato.total_event_types_count, afterWaikato.total_event_types_count >= 9 ? '✅' : '❌')
  }

  // Check Albury Wodonga Health
  const { data: afterAlbury } = await supabase
    .from('event_compliance_summary')
    .select('overall_compliance_score, total_event_types_count')
    .eq('client_name', 'Albury Wodonga Health')
    .eq('year', 2025)
    .single()

  if (afterAlbury) {
    console.log('\n   Albury Wodonga Health:')
    console.log('   Score:', afterAlbury.overall_compliance_score + '%')
    console.log('   Event Types:', afterAlbury.total_event_types_count, afterAlbury.total_event_types_count >= 9 ? '✅' : '❌')
  }

  console.log('\n=== Done ===\n')
}

main().catch(console.error)
