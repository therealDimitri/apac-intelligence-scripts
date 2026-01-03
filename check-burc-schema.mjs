#!/usr/bin/env node
/**
 * Check BURC-related tables and views schema
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function main() {
  console.log('🔍 Checking BURC-related tables and views...\n')

  // List all tables/views that start with 'burc'
  const { data: tables, error } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT table_name, table_type
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name LIKE 'burc%'
      ORDER BY table_name
    `
  }).single()

  if (error) {
    // Fallback: try each known table
    const knownTables = [
      'burc_executive_summary',
      'burc_active_alerts',
      'burc_renewal_calendar',
      'burc_attrition_summary',
      'burc_csi_ratios',
      'burc_ps_pipeline',
      'burc_maintenance',
      'burc_revenue',
      'burc_historical_revenue',
      'burc_contracts',
      'burc_waterfall',
      'burc_monthly_financials'
    ]

    console.log('Checking known tables/views:\n')

    for (const table of knownTables) {
      const { count, error: tableError } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })

      if (tableError) {
        console.log(`  ❌ ${table}: ${tableError.message}`)
      } else {
        console.log(`  ✅ ${table}: ${count} records`)

        // Get column info for first record
        const { data: sample } = await supabase
          .from(table)
          .select('*')
          .limit(1)

        if (sample && sample.length > 0) {
          const columns = Object.keys(sample[0])
          console.log(`     Columns: ${columns.join(', ')}`)
        }
      }
    }
  } else {
    console.log(JSON.stringify(tables, null, 2))
  }

  // Check CSI ratios schema specifically
  console.log('\n📊 Checking burc_csi_ratios schema:')
  const { data: csiSample, error: csiError } = await supabase
    .from('burc_csi_ratios')
    .select('*')
    .limit(1)

  if (csiError) {
    console.log(`  ❌ Error: ${csiError.message}`)
  } else if (csiSample && csiSample.length > 0) {
    console.log(`  Columns: ${Object.keys(csiSample[0]).join(', ')}`)
    console.log(`  Sample: ${JSON.stringify(csiSample[0], null, 2)}`)
  }

  // Check historical revenue data
  console.log('\n📊 Checking burc_historical_revenue:')
  const { data: histSample, error: histError } = await supabase
    .from('burc_historical_revenue')
    .select('*')
    .limit(5)

  if (histError) {
    console.log(`  ❌ Error: ${histError.message}`)
  } else if (histSample && histSample.length > 0) {
    console.log(`  Columns: ${Object.keys(histSample[0]).join(', ')}`)
    histSample.forEach(r => {
      console.log(`  - ${r.client_name || r.client_code}: 2024=${r.year_2024}, 2025=${r.year_2025}`)
    })
  }
}

main().catch(console.error)
