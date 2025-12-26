#!/usr/bin/env node
/**
 * Refresh the event_compliance_summary materialized view to apply exclusions
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function main() {
  console.log('\n=== Refreshing Compliance View with Exclusions ===\n')

  // First, verify the exclusion exists
  console.log('1. Verifying exclusion exists...')
  const { data: exclusions, error: exclusionError } = await supabase
    .from('client_event_exclusions')
    .select(`
      *,
      segmentation_event_types!inner(event_name)
    `)
    .eq('client_name', 'Department of Health - Victoria')

  if (exclusionError) {
    console.log('   Error fetching exclusions:', exclusionError.message)
  } else {
    console.log('   Exclusions found:', exclusions?.length || 0)
    exclusions?.forEach((e) => {
      console.log(`    - ${e.segmentation_event_types?.event_name || e.event_type_id}`)
      console.log(`      Reason: ${e.reason}`)
    })
  }

  // Refresh the materialized view using the existing function
  console.log('\n2. Refreshing materialized view...')

  // Try using the RPC function if it exists
  const { error: rpcError } = await supabase.rpc('refresh_event_compliance_summary')

  if (rpcError) {
    console.log('   RPC error (trying direct refresh):', rpcError.message)

    // Try direct SQL via the REST API
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/exec_sql`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          query: 'REFRESH MATERIALIZED VIEW CONCURRENTLY event_compliance_summary'
        })
      }
    )

    if (!response.ok) {
      const text = await response.text()
      console.log('   Direct SQL also failed:', text)
      console.log('\n   ⚠️  Please refresh manually via Supabase Dashboard SQL Editor:')
      console.log('   REFRESH MATERIALIZED VIEW CONCURRENTLY event_compliance_summary;')
    } else {
      console.log('   ✓ View refreshed via direct SQL')
    }
  } else {
    console.log('   ✓ View refreshed via RPC')
  }

  // Verify the change
  console.log('\n3. Verifying Department of Health - Victoria compliance...')
  const { data: compliance, error: complianceError } = await supabase
    .from('event_compliance_summary')
    .select('client_name, overall_compliance_score, event_compliance')
    .eq('client_name', 'Department of Health - Victoria')
    .eq('year', 2025)
    .single()

  if (complianceError) {
    console.log('   Error:', complianceError.message)
  } else if (compliance) {
    console.log('   Client:', compliance.client_name)
    console.log('   Overall Score:', compliance.overall_compliance_score, '%')

    // Check if Health Check (Opal) is still in the requirements
    const events = compliance.event_compliance || []
    const healthCheck = events.find(e => e.event_type_name === 'Health Check (Opal)')

    if (healthCheck) {
      console.log('\n   ⚠️  Health Check (Opal) still appears in requirements!')
      console.log('   This means the view needs to be recreated, not just refreshed.')
      console.log('\n   Please run the full migration SQL in Supabase Dashboard:')
      console.log('   File: docs/migrations/20251223_add_client_event_exclusions.sql')
    } else {
      console.log('\n   ✓ Health Check (Opal) successfully excluded!')
      console.log('\n   Event types now required:')
      events.forEach(e => {
        console.log(`    - ${e.event_type_name}: ${e.actual_count}/${e.expected_count} (${e.compliance_percentage}%)`)
      })
    }
  }

  console.log('\n=== Done ===\n')
}

main().catch(console.error)
