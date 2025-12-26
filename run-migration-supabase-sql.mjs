/**
 * Execute migration using Supabase SQL API
 * Uses the @supabase/supabase-js built-in SQL execution
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing environment variables')
  process.exit(1)
}

// Create a Supabase client with direct access
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  db: { schema: 'public' },
  auth: { persistSession: false },
})

async function main() {
  console.log('\n=== Running View Migration via Supabase SQL ===\n')

  // Step 1: Check current state
  console.log('1. Current state for DoH Victoria...')
  const { data: before } = await supabase
    .from('event_compliance_summary')
    .select('overall_compliance_score, total_event_types_count')
    .eq('client_name', 'Department of Health - Victoria')
    .eq('year', 2025)
    .single()

  if (before) {
    console.log('   Score:', before.overall_compliance_score + '%')
    console.log('   Event Types:', before.total_event_types_count)
  }

  // Step 2: Try using Supabase's SQL method (if available)
  console.log('\n2. Attempting SQL execution via Supabase client...')

  // Check if the sql method exists
  if (typeof supabase.from('').sql === 'function') {
    console.log('   Found .sql() method!')
    // Use it here
  }

  // Alternative: Use rpc to call pg_* functions
  console.log('   Trying pg_catalog approach...')

  // First, let's check if we can create a function
  const createFuncSQL = `
    CREATE OR REPLACE FUNCTION run_migration_sql()
    RETURNS void AS $$
    BEGIN
      -- This won't work via RPC, but let's try
      RAISE NOTICE 'Migration function called';
    END;
    $$ LANGUAGE plpgsql;
  `

  // Try to find an existing migration function
  const { data: funcs, error: funcError } = await supabase
    .rpc('exec_sql', { sql: 'SELECT 1' })
    .select()

  if (!funcError) {
    console.log('   exec_sql function exists!')
  } else {
    console.log('   exec_sql not available:', funcError.message)
  }

  // Step 3: Use Supabase Management API
  console.log('\n3. Trying Supabase Management API...')

  // Extract project ref
  const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]

  // Try the new SQL API endpoint
  const endpoints = [
    `${SUPABASE_URL}/rest/v1/rpc/execute_sql`,
    `${SUPABASE_URL}/pg/sql`,
    `${SUPABASE_URL}/pg/execute`,
    `${SUPABASE_URL}/v1/pg/query`,
  ]

  for (const endpoint of endpoints) {
    try {
      console.log('   Trying:', endpoint)
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
        body: JSON.stringify({ query: 'SELECT 1 as test' }),
      })

      if (response.ok) {
        console.log('   ✓ Endpoint works!')
        const data = await response.json()
        console.log('   Response:', data)
        break
      } else {
        const err = await response.text()
        console.log('   ✗', response.status, err.substring(0, 100))
      }
    } catch (e) {
      console.log('   ✗ Error:', e.message)
    }
  }

  // Step 4: Alternative - check if pg_background extension exists
  console.log('\n4. Checking for pg extensions...')
  const { data: extensions } = await supabase
    .from('pg_catalog.pg_extension')
    .select('extname')

  if (extensions) {
    console.log('   Extensions:', extensions.map(e => e.extname).join(', '))
  }

  // Step 5: Try RPC with postgres_fdw if available
  console.log('\n5. Final attempt via RPC...')

  // Create the exec_sql function if it doesn't exist
  // This needs to be run manually first
  console.log('   The exec_sql function needs to be created manually first.')
  console.log('   Run this SQL in Supabase Dashboard:')
  console.log(`
    CREATE OR REPLACE FUNCTION exec_sql(sql TEXT)
    RETURNS void AS $$
    BEGIN
      EXECUTE sql;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `)

  console.log('\n=== Migration Status ===')
  console.log('❌ Automatic SQL execution not available.')
  console.log('')
  console.log('The exclusion record has been created successfully.')
  console.log('To complete the migration, run the view update SQL manually.')
  console.log('')
  console.log('Steps:')
  console.log('1. Go to: https://supabase.com/dashboard/project/' + projectRef + '/sql')
  console.log('2. Paste the SQL from: supabase/migrations/20251223000000_update_compliance_view_with_exclusions.sql')
  console.log('3. Click Run')
  console.log('')
  console.log('After running the SQL, the compliance score will be recalculated')
  console.log('and Health Check (Opal) will be excluded for DoH Victoria.')
  console.log('')
}

main().catch(console.error)
