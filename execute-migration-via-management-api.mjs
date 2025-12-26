/**
 * Execute SQL migration via Supabase Management API
 * This uses the project's management API to execute DDL statements
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

dotenv.config({ path: '.env.local' })

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SUPABASE_DB_URL = process.env.DATABASE_URL_DIRECT || process.env.SUPABASE_DB_URL || process.env.DATABASE_URL

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing environment variables')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  db: { schema: 'public' },
  auth: { persistSession: false },
})

// Read the migration SQL
const migrationPath = path.join(
  __dirname,
  '../supabase/migrations/20251223000000_update_compliance_view_with_exclusions.sql'
)
const migrationSQL = fs.readFileSync(migrationPath, 'utf-8')

async function main() {
  console.log('\n=== Executing Migration via Management API ===\n')

  // Step 1: Check current state
  console.log('1. Current DoH Victoria compliance...')
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

  // Step 2: Extract project ID from URL
  const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]
  console.log('\n2. Project reference:', projectRef)

  // Step 3: Try the Supabase Edge Function approach
  // Create a temporary edge function to execute SQL
  console.log('\n3. Attempting SQL execution...')

  // Method 1: Try using postgres.js via the bundled connection
  if (SUPABASE_DB_URL) {
    console.log('   Found DATABASE_URL, attempting direct connection...')
    try {
      const { default: postgres } = await import('postgres')
      const sql = postgres(SUPABASE_DB_URL, {
        ssl: { rejectUnauthorized: false },
        connection: {
          application_name: 'migration-script',
        },
        connect_timeout: 30,
      })

      console.log('   Executing migration...')
      await sql.unsafe(migrationSQL)
      console.log('   ✅ Migration executed successfully!')

      await sql.end()

      // Verify
      console.log('\n4. Verifying migration...')
      await new Promise((r) => setTimeout(r, 2000))

      const { data: after } = await supabase
        .from('event_compliance_summary')
        .select('overall_compliance_score, total_event_types_count, event_compliance')
        .eq('client_name', 'Department of Health - Victoria')
        .eq('year', 2025)
        .single()

      if (after) {
        console.log('   Score:', after.overall_compliance_score + '%')
        console.log('   Event Types:', after.total_event_types_count)

        const hasHealthCheck = after.event_compliance?.some(
          (ec) => ec.event_type_name === 'Health Check (Opal)'
        )
        console.log(
          '   Health Check excluded:',
          hasHealthCheck ? '❌ NO' : '✅ YES'
        )

        if (before) {
          console.log(
            `\n   Change: ${before.overall_compliance_score}% → ${after.overall_compliance_score}%`
          )
        }
      }

      console.log('\n=== Done ===\n')
      return
    } catch (err) {
      console.log('   Direct connection failed:', err.message)
    }
  }

  // Method 2: Use Supabase's internal SQL execution
  console.log('\n   Trying Supabase SQL endpoint...')

  // The SQL endpoint for executing queries
  const sqlEndpoint = `${SUPABASE_URL}/sql`

  try {
    const response = await fetch(sqlEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
      body: JSON.stringify({
        query: migrationSQL,
      }),
    })

    if (response.ok) {
      console.log('   ✅ SQL executed via /sql endpoint!')
    } else {
      const errorText = await response.text()
      console.log('   /sql endpoint failed:', response.status, errorText)
    }
  } catch (err) {
    console.log('   /sql fetch failed:', err.message)
  }

  console.log('\n   ❌ Could not execute DDL automatically.')
  console.log('   Please run the SQL manually in Supabase Dashboard.')
  console.log('\n=== Manual Steps Required ===')
  console.log('1. Go to: https://supabase.com/dashboard/project/' + projectRef + '/sql')
  console.log('2. Paste the contents of:')
  console.log('   supabase/migrations/20251223000000_update_compliance_view_with_exclusions.sql')
  console.log('3. Click Run')
  console.log('\n')
}

main().catch(console.error)
