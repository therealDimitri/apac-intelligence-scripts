#!/usr/bin/env node
/**
 * Test dropdown tables accessibility
 */

import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { createClient } from '@supabase/supabase-js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

console.log('🔍 Testing Dropdown Tables Accessibility\n')
console.log('Supabase URL:', supabaseUrl ? '✓ Set' : '✗ Not set')
console.log('Anon Key:', supabaseAnonKey ? '✓ Set' : '✗ Not set')
console.log('Service Key:', supabaseServiceKey ? '✓ Set' : '✗ Not set')
console.log()

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials')
  process.exit(1)
}

// Create clients
const anonClient = createClient(supabaseUrl, supabaseAnonKey)
const serviceClient = createClient(supabaseUrl, supabaseServiceKey)

async function testTable(client, clientName, tableName) {
  try {
    const { data, error } = await client
      .from(tableName)
      .select('*')
      .limit(5)

    if (error) {
      console.log(`  ${clientName}: ❌ ${error.message}`)
      return { success: false, error: error.message }
    }

    console.log(`  ${clientName}: ✓ ${data?.length || 0} rows`)
    if (data?.length > 0) {
      console.log(`    Sample: ${JSON.stringify(data[0]).substring(0, 100)}...`)
    }
    return { success: true, count: data?.length || 0, sample: data?.[0] }
  } catch (err) {
    console.log(`  ${clientName}: ❌ ${err.message}`)
    return { success: false, error: err.message }
  }
}

async function runTests() {
  const tables = ['departments', 'activity_types', 'client_health_summary']

  for (const table of tables) {
    console.log(`\n📊 Testing ${table}:`)
    const serviceResult = await testTable(serviceClient, 'Service Role', table)
    const anonResult = await testTable(anonClient, 'Anon Key', table)

    // Diagnosis
    if (serviceResult.success && !anonResult.success) {
      console.log(`\n  🔧 DIAGNOSIS: RLS policies blocking anon access to ${table}`)
      console.log('     Solution: Run the RLS fix migration in Supabase SQL Editor')
    } else if (!serviceResult.success && !anonResult.success) {
      console.log(`\n  🔧 DIAGNOSIS: Table ${table} may not exist or have other issues`)
    } else if (serviceResult.success && anonResult.success) {
      console.log(`\n  ✅ ${table} is accessible via both roles`)
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log('\nIf anon access is blocked, run this SQL in Supabase SQL Editor:\n')
  console.log(`
-- Fix departments RLS
DROP POLICY IF EXISTS "Allow authenticated users to read departments" ON departments;
DROP POLICY IF EXISTS "Allow users to read active departments" ON departments;
CREATE POLICY "departments_public_read" ON departments FOR SELECT TO anon, authenticated, public USING (true);
GRANT SELECT ON departments TO anon;

-- Fix activity_types RLS
DROP POLICY IF EXISTS "Allow authenticated users to read activity_types" ON activity_types;
DROP POLICY IF EXISTS "Allow users to read active activity_types" ON activity_types;
CREATE POLICY "activity_types_public_read" ON activity_types FOR SELECT TO anon, authenticated, public USING (true);
GRANT SELECT ON activity_types TO anon;

-- Grant access to materialized view
GRANT SELECT ON client_health_summary TO anon;
  `.trim())
}

runTests().then(() => process.exit(0)).catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
