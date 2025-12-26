import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/**
 * Migration: Add client_id foreign keys to all data tables
 *
 * This eliminates the need for complex alias lookups by:
 * 1. Adding client_id (UUID) column to each data table
 * 2. Populating client_id using current alias mappings
 * 3. Eventually removing the need for client_name_aliases in views
 */

async function execSQL(sql, description) {
  console.log(`\n=== ${description} ===`)
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql })

  if (error) {
    console.log('Error:', error.message)
    return false
  }

  if (!data.success) {
    console.log('SQL Error:', data.error)
    return false
  }

  console.log('Success:', data.message)
  return true
}

async function runMigration() {
  console.log('===========================================')
  console.log('Client ID Foreign Key Migration')
  console.log('===========================================')

  // Step 1: Add client_id columns to each table
  console.log('\n--- PHASE 1: Adding client_id columns ---')

  // aging_accounts
  await execSQL(`
    ALTER TABLE aging_accounts
    ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES nps_clients(id);
  `, 'Adding client_id to aging_accounts')

  // nps_responses
  await execSQL(`
    ALTER TABLE nps_responses
    ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES nps_clients(id);
  `, 'Adding client_id to nps_responses')

  // unified_meetings
  await execSQL(`
    ALTER TABLE unified_meetings
    ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES nps_clients(id);
  `, 'Adding client_id to unified_meetings')

  // actions
  await execSQL(`
    ALTER TABLE actions
    ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES nps_clients(id);
  `, 'Adding client_id to actions')

  // Step 2: Create helper function to resolve client names
  console.log('\n--- PHASE 2: Creating resolver function ---')

  await execSQL(`
    CREATE OR REPLACE FUNCTION resolve_client_id(input_name TEXT)
    RETURNS UUID AS $$
    DECLARE
      result_id UUID;
    BEGIN
      -- Direct match
      SELECT id INTO result_id FROM nps_clients WHERE client_name = input_name LIMIT 1;
      IF result_id IS NOT NULL THEN RETURN result_id; END IF;

      -- Match via aliases (display_name → canonical_name → client)
      SELECT c.id INTO result_id
      FROM nps_clients c
      JOIN client_name_aliases a ON (
        a.canonical_name = c.client_name OR a.display_name = c.client_name
      )
      WHERE a.display_name = input_name OR a.canonical_name = input_name
      AND a.is_active = true
      LIMIT 1;
      IF result_id IS NOT NULL THEN RETURN result_id; END IF;

      -- Case-insensitive match
      SELECT id INTO result_id FROM nps_clients
      WHERE LOWER(client_name) = LOWER(input_name) LIMIT 1;

      RETURN result_id;
    END;
    $$ LANGUAGE plpgsql;
  `, 'Creating resolve_client_id function')

  // Step 3: Populate client_id for each table
  console.log('\n--- PHASE 3: Populating client_id values ---')

  // aging_accounts
  await execSQL(`
    UPDATE aging_accounts
    SET client_id = resolve_client_id(client_name)
    WHERE client_id IS NULL;
  `, 'Populating aging_accounts.client_id')

  // nps_responses
  await execSQL(`
    UPDATE nps_responses
    SET client_id = resolve_client_id(client_name)
    WHERE client_id IS NULL;
  `, 'Populating nps_responses.client_id')

  // unified_meetings
  await execSQL(`
    UPDATE unified_meetings
    SET client_id = resolve_client_id(client_name)
    WHERE client_id IS NULL;
  `, 'Populating unified_meetings.client_id')

  // actions
  await execSQL(`
    UPDATE actions
    SET client_id = resolve_client_id(client)
    WHERE client_id IS NULL;
  `, 'Populating actions.client_id')

  // Step 4: Create indexes for performance
  console.log('\n--- PHASE 4: Creating indexes ---')

  await execSQL(`
    CREATE INDEX IF NOT EXISTS idx_aging_accounts_client_id ON aging_accounts(client_id);
  `, 'Creating index on aging_accounts.client_id')

  await execSQL(`
    CREATE INDEX IF NOT EXISTS idx_nps_responses_client_id ON nps_responses(client_id);
  `, 'Creating index on nps_responses.client_id')

  await execSQL(`
    CREATE INDEX IF NOT EXISTS idx_unified_meetings_client_id ON unified_meetings(client_id);
  `, 'Creating index on unified_meetings.client_id')

  await execSQL(`
    CREATE INDEX IF NOT EXISTS idx_actions_client_id ON actions(client_id);
  `, 'Creating index on actions.client_id')

  // Step 5: Verify the migration
  console.log('\n--- PHASE 5: Verification ---')

  // Check aging_accounts
  const { data: agingStats } = await supabase
    .from('aging_accounts')
    .select('client_name, client_id')
    .eq('is_inactive', false)

  const agingWithId = agingStats?.filter(r => r.client_id) || []
  const agingWithoutId = agingStats?.filter(r => !r.client_id) || []

  console.log('\naging_accounts:')
  console.log(`  - With client_id: ${agingWithId.length}`)
  console.log(`  - Without client_id: ${agingWithoutId.length}`)
  if (agingWithoutId.length > 0) {
    console.log('  - Unmatched clients:', agingWithoutId.map(r => r.client_name))
  }

  // Check nps_responses
  const { data: npsStats } = await supabase
    .from('nps_responses')
    .select('client_name, client_id')

  const npsWithId = npsStats?.filter(r => r.client_id) || []
  const npsWithoutId = npsStats?.filter(r => !r.client_id) || []

  console.log('\nnps_responses:')
  console.log(`  - With client_id: ${npsWithId.length}`)
  console.log(`  - Without client_id: ${npsWithoutId.length}`)
  if (npsWithoutId.length > 0) {
    const uniqueUnmatched = [...new Set(npsWithoutId.map(r => r.client_name))]
    console.log('  - Unmatched clients:', uniqueUnmatched.slice(0, 10))
  }

  // Check unified_meetings
  const { data: meetingStats } = await supabase
    .from('unified_meetings')
    .select('client_name, client_id')

  const meetingsWithId = meetingStats?.filter(r => r.client_id) || []
  const meetingsWithoutId = meetingStats?.filter(r => !r.client_id) || []

  console.log('\nunified_meetings:')
  console.log(`  - With client_id: ${meetingsWithId.length}`)
  console.log(`  - Without client_id: ${meetingsWithoutId.length}`)

  // Check actions
  const { data: actionStats } = await supabase
    .from('actions')
    .select('client, client_id')

  const actionsWithId = actionStats?.filter(r => r.client_id) || []
  const actionsWithoutId = actionStats?.filter(r => !r.client_id) || []

  console.log('\nactions:')
  console.log(`  - With client_id: ${actionsWithId.length}`)
  console.log(`  - Without client_id: ${actionsWithoutId.length}`)

  console.log('\n===========================================')
  console.log('Migration Complete!')
  console.log('===========================================')
  console.log('\nNext steps:')
  console.log('1. Review any unmatched records above')
  console.log('2. Add missing aliases for unmatched client names')
  console.log('3. Run simplified view migration (scripts/update-view-to-use-client-id.mjs)')
}

runMigration()
