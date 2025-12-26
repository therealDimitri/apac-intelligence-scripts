import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/**
 * Migration: Add client_id to event_compliance_summary
 *
 * This enhances the compliance view with client_id for better join performance.
 * Executes via exec_sql RPC function where possible.
 */

async function execSQL(sql, description) {
  console.log(`\n=== ${description} ===`)
  try {
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql })

    if (error) {
      console.log('RPC Error:', error.message)
      return { success: false, error: error.message }
    }

    if (data && !data.success) {
      console.log('SQL Error:', data.error || data.message)
      return { success: false, error: data.error || data.message }
    }

    console.log('✓ Success:', data?.message || 'Completed')
    return { success: true, data }
  } catch (err) {
    console.log('Exception:', err.message)
    return { success: false, error: err.message }
  }
}

async function runMigration() {
  console.log('===========================================')
  console.log('Event Compliance Summary: Client ID Enhancement')
  console.log('===========================================')

  // Step 1: Add client_id column to segmentation_events
  console.log('\n--- STEP 1: Add client_id to segmentation_events ---')

  const step1 = await execSQL(`
    ALTER TABLE segmentation_events
    ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES nps_clients(id);
  `, 'Adding client_id column')

  if (!step1.success) {
    console.log('⚠️  Step 1 failed - may need manual execution')
  }

  // Step 2: Create index
  console.log('\n--- STEP 2: Create index on client_id ---')

  await execSQL(`
    CREATE INDEX IF NOT EXISTS idx_segmentation_events_client_id
    ON segmentation_events(client_id);
  `, 'Creating index')

  // Step 3: Populate client_id
  console.log('\n--- STEP 3: Populate client_id values ---')

  const step3 = await execSQL(`
    UPDATE segmentation_events
    SET client_id = resolve_client_id_int(client_name)
    WHERE client_id IS NULL;
  `, 'Populating client_id')

  // Step 4: Verify segmentation_events update
  console.log('\n--- STEP 4: Verify segmentation_events ---')

  const { data: eventStats } = await supabase
    .from('segmentation_events')
    .select('client_name, client_id')
    .limit(100)

  const withId = eventStats?.filter(r => r.client_id) || []
  const withoutId = eventStats?.filter(r => !r.client_id) || []

  console.log(`segmentation_events (sample of 100):`)
  console.log(`  - With client_id: ${withId.length}`)
  console.log(`  - Without client_id: ${withoutId.length}`)

  // Step 5: Drop and recreate materialized view
  console.log('\n--- STEP 5: Recreate event_compliance_summary ---')
  console.log('⚠️  This requires DDL permissions - attempting via exec_sql...')

  const dropResult = await execSQL(`
    DROP MATERIALIZED VIEW IF EXISTS event_compliance_summary CASCADE;
  `, 'Dropping existing view')

  if (!dropResult.success) {
    console.log('\n❌ Cannot drop view via RPC - DDL not permitted')
    console.log('\n📋 MANUAL STEPS REQUIRED:')
    console.log('   1. Open Supabase Dashboard: https://supabase.com/dashboard')
    console.log('   2. Navigate to SQL Editor')
    console.log('   3. Run the contents of: docs/migrations/20251223_event_compliance_client_id.sql')
    console.log('   4. Start from "Step 3: Drop existing view"')
    return
  }

  // If DROP worked, CREATE should work too
  const createSQL = `
CREATE MATERIALIZED VIEW event_compliance_summary AS
WITH
client_segment_periods AS (
  SELECT DISTINCT
    cs.client_name,
    c.id as client_id,
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
    c.id as client_id,
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
    client_id,
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
    csp.client_id,
    csp.year,
    tr.event_type_id,
    tr.event_name,
    tr.event_code,
    MAX(tr.expected_frequency) as expected_count
  FROM client_segment_periods csp
  INNER JOIN tier_requirements tr ON tr.tier_id = csp.tier_id
  GROUP BY
    csp.client_name,
    csp.client_id,
    csp.year,
    tr.event_type_id,
    tr.event_name,
    tr.event_code
),

event_counts AS (
  SELECT
    se.client_name,
    se.client_id,
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
  GROUP BY se.client_name, se.client_id, se.event_year, se.event_type_id
),

event_type_compliance AS (
  SELECT
    cr.client_name,
    cr.client_id,
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
    ON (ec.client_id = cr.client_id OR ec.client_name = cr.client_name)
    AND ec.event_year = cr.year
    AND ec.event_type_id = cr.event_type_id
),

client_year_summary AS (
  SELECT
    etc.client_name,
    etc.client_id,
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
    ON (ls.client_id = etc.client_id OR ls.client_name = etc.client_name)
    AND ls.year = etc.year
  GROUP BY etc.client_name, etc.client_id, ls.segment, ls.cse, etc.year
)

SELECT
  client_name,
  client_id,
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
`

  await execSQL(createSQL, 'Creating enhanced view')

  // Create indexes
  console.log('\n--- STEP 6: Create indexes ---')

  const indexes = [
    'CREATE INDEX idx_event_compliance_client_year ON event_compliance_summary(client_name, year)',
    'CREATE INDEX idx_event_compliance_client_id ON event_compliance_summary(client_id)',
    'CREATE INDEX idx_event_compliance_client_id_year ON event_compliance_summary(client_id, year DESC)',
    'CREATE INDEX idx_event_compliance_cse ON event_compliance_summary(cse)',
    'CREATE INDEX idx_event_compliance_year ON event_compliance_summary(year DESC)',
    'CREATE INDEX idx_event_compliance_status ON event_compliance_summary(overall_status)',
    'CREATE INDEX idx_event_compliance_segment ON event_compliance_summary(segment)',
    'CREATE INDEX idx_event_compliance_cse_year ON event_compliance_summary(cse, year DESC)',
    'CREATE UNIQUE INDEX idx_event_compliance_unique_client_year ON event_compliance_summary(client_name, year)',
  ]

  for (const idx of indexes) {
    await execSQL(idx, idx.split(' ')[2])
  }

  // Grant permissions
  console.log('\n--- STEP 7: Grant permissions ---')
  await execSQL('GRANT SELECT ON event_compliance_summary TO anon, authenticated', 'Granting permissions')

  // Refresh view
  console.log('\n--- STEP 8: Refresh view ---')
  await execSQL('REFRESH MATERIALIZED VIEW event_compliance_summary', 'Refreshing view')

  // Notify PostgREST
  await execSQL("NOTIFY pgrst, 'reload schema'", 'Notifying PostgREST')

  // Verify
  console.log('\n--- STEP 9: Verification ---')

  const { data: sample } = await supabase
    .from('event_compliance_summary')
    .select('client_name, client_id, year, overall_compliance_score')
    .limit(5)

  console.log('\nSample data from updated view:')
  console.log(JSON.stringify(sample, null, 2))

  const withClientId = sample?.filter(r => r.client_id) || []
  console.log(`\n✓ ${withClientId.length}/${sample?.length || 0} records have client_id populated`)

  console.log('\n===========================================')
  console.log('Migration Complete!')
  console.log('===========================================')
}

runMigration().catch(console.error)
