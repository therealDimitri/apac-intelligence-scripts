#!/usr/bin/env node
/**
 * Refresh Health View With Actions
 *
 * This script:
 * 1. Checks if the client_health_summary view includes Actions
 * 2. If not, applies the migration
 * 3. Refreshes the materialized view
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function main() {
  console.log('🔍 Checking client_health_summary view structure...\n')

  // Check if completion_rate column exists
  const { data: viewCheck, error: viewError } = await supabase
    .from('client_health_summary')
    .select('client_name, health_score, completion_rate')
    .limit(1)

  if (viewError) {
    if (viewError.message.includes('completion_rate')) {
      console.log('❌ completion_rate column not found - Actions migration needed')
      console.log('\n📋 Please run the migration in Supabase SQL Editor:')
      console.log('   docs/migrations/20260102_add_actions_to_health_score.sql\n')
      process.exit(1)
    }
    console.error('Error:', viewError)
    process.exit(1)
  }

  console.log('✅ View includes completion_rate column (Actions component)')
  console.log('   Sample row:', JSON.stringify(viewCheck[0], null, 2))

  // Refresh the materialized view
  console.log('\n🔄 Refreshing client_health_summary materialized view...')

  const { error: refreshError } = await supabase.rpc('refresh_client_health_summary')

  if (refreshError) {
    if (refreshError.message.includes('does not exist')) {
      // Try direct refresh via SQL
      console.log('   RPC not found, attempting direct REFRESH...')
      const { error: directError } = await supabase.rpc('exec_sql', {
        query: 'REFRESH MATERIALIZED VIEW client_health_summary;'
      })
      if (directError) {
        console.log('   Direct refresh failed:', directError.message)
        console.log('\n📋 Please run in Supabase SQL Editor:')
        console.log('   REFRESH MATERIALIZED VIEW client_health_summary;')
      } else {
        console.log('✅ View refreshed successfully!')
      }
    } else {
      console.error('Error refreshing view:', refreshError)
    }
  } else {
    console.log('✅ View refreshed successfully!')
  }

  // Show sample health scores for verification
  console.log('\n📊 Sample health scores after refresh:')
  const { data: samples, error: samplesError } = await supabase
    .from('client_health_summary')
    .select('client_name, nps_score, compliance_percentage, working_capital_percentage, completion_rate, health_score')
    .order('client_name')
    .limit(10)

  if (samplesError) {
    console.error('Error fetching samples:', samplesError)
  } else {
    console.log('\n   Client Name                | NPS | Comp | WC  | Actions | Health')
    console.log('   ---------------------------|-----|------|-----|---------|-------')
    samples.forEach(row => {
      const name = (row.client_name || '').padEnd(27).slice(0, 27)
      const nps = String(row.nps_score ?? '-').padStart(3)
      const comp = String(row.compliance_percentage ?? '-').padStart(4)
      const wc = String(row.working_capital_percentage ?? '-').padStart(3)
      const actions = String(row.completion_rate ?? '-').padStart(7)
      const health = String(row.health_score ?? '-').padStart(5)
      console.log(`   ${name} | ${nps} | ${comp} | ${wc} | ${actions} | ${health}`)
    })
  }

  console.log('\n✨ Done!')
}

main().catch(console.error)
