import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

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

  console.log('Success:', data.message, data.rows_affected ? `(${data.rows_affected} rows)` : '')
  return true
}

async function fixAndPopulate() {
  // Drop and recreate the function with correct return type
  await execSQL('DROP FUNCTION IF EXISTS resolve_client_id(TEXT);',
    'Dropping old resolve_client_id function')

  await execSQL(`
    CREATE OR REPLACE FUNCTION resolve_client_id_int(input_name TEXT)
    RETURNS INTEGER AS $$
    DECLARE
      result_id INTEGER;
    BEGIN
      -- Direct match
      SELECT id INTO result_id FROM nps_clients WHERE client_name = input_name LIMIT 1;
      IF result_id IS NOT NULL THEN RETURN result_id; END IF;

      -- Match via aliases (canonical_name points to client_name in nps_clients)
      SELECT c.id INTO result_id
      FROM nps_clients c
      JOIN client_name_aliases a ON c.client_name = a.canonical_name
      WHERE a.display_name = input_name AND a.is_active = true
      LIMIT 1;
      IF result_id IS NOT NULL THEN RETURN result_id; END IF;

      -- Reverse alias match (display_name points to client_name in nps_clients)
      SELECT c.id INTO result_id
      FROM nps_clients c
      JOIN client_name_aliases a ON c.client_name = a.display_name
      WHERE a.canonical_name = input_name AND a.is_active = true
      LIMIT 1;
      IF result_id IS NOT NULL THEN RETURN result_id; END IF;

      -- Case-insensitive match
      SELECT id INTO result_id FROM nps_clients
      WHERE LOWER(client_name) = LOWER(input_name) LIMIT 1;

      RETURN result_id;
    END;
    $$ LANGUAGE plpgsql;
  `, 'Creating resolve_client_id_int function')

  // Populate client_id
  console.log('\n--- Populating client_id values ---')

  await execSQL(`
    UPDATE aging_accounts
    SET client_id = resolve_client_id_int(client_name)
    WHERE client_id IS NULL;
  `, 'Populating aging_accounts.client_id')

  await execSQL(`
    UPDATE nps_responses
    SET client_id = resolve_client_id_int(client_name)
    WHERE client_id IS NULL;
  `, 'Populating nps_responses.client_id')

  await execSQL(`
    UPDATE unified_meetings
    SET client_id = resolve_client_id_int(client_name)
    WHERE client_id IS NULL;
  `, 'Populating unified_meetings.client_id')

  await execSQL(`
    UPDATE actions
    SET client_id = resolve_client_id_int(client)
    WHERE client_id IS NULL;
  `, 'Populating actions.client_id')

  // Verification
  console.log('\n--- Verification ---')

  const tables = [
    { name: 'aging_accounts', col: 'client_name', filter: { is_inactive: false } },
    { name: 'nps_responses', col: 'client_name', filter: {} },
    { name: 'unified_meetings', col: 'client_name', filter: {} },
    { name: 'actions', col: 'client', filter: {} }
  ]

  for (const table of tables) {
    let query = supabase.from(table.name).select(`${table.col}, client_id`)
    if (Object.keys(table.filter).length > 0) {
      for (const [key, val] of Object.entries(table.filter)) {
        query = query.eq(key, val)
      }
    }
    const { data } = await query

    const withId = data?.filter(r => r.client_id) || []
    const withoutId = data?.filter(r => !r.client_id) || []

    console.log(`\n${table.name}:`)
    console.log(`  ✅ With client_id: ${withId.length}`)
    console.log(`  ❌ Without client_id: ${withoutId.length}`)

    if (withoutId.length > 0) {
      const uniqueNames = [...new Set(withoutId.map(r => r[table.col]))].slice(0, 10)
      console.log('  Unmatched (sample):', uniqueNames)
    }
  }

  console.log('\n===========================================')
  console.log('Population Complete!')
  console.log('===========================================')
}

fixAndPopulate()
