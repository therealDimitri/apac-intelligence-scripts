#!/usr/bin/env node
/**
 * Check BURC table schemas and data
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

async function checkTables() {
  console.log('='.repeat(70))
  console.log('BURC TABLE SCHEMA CHECK')
  console.log('='.repeat(70))

  // Try to query each known table
  const burcTables = [
    'burc_historical_revenue',
    'burc_business_cases',
    'burc_attrition_risk',
    'burc_arr_targets',
    'burc_fx_rates',
    'burc_opal_contracts',
    'burc_waterfall_data',
    'burc_client_revenue_detail',
    'burc_pipeline_deals',
    'burc_monthly_forecast',
    'burc_quarterly_comparison',
    'burc_product_revenue'
  ]

  for (const tableName of burcTables) {
    console.log('\n' + '-'.repeat(70))
    console.log('TABLE:', tableName)
    console.log('-'.repeat(70))

    // Try to get one row to see columns
    const { data, error, count } = await supabase
      .from(tableName)
      .select('*', { count: 'exact' })
      .limit(1)

    if (error) {
      console.log('Status: ❌ NOT FOUND or ERROR')
      console.log('Error:', error.message)
    } else {
      console.log('Status: ✅ EXISTS')
      console.log('Row count:', count || data?.length || 0)

      if (data && data.length > 0) {
        console.log('Columns:', Object.keys(data[0]).join(', '))
        console.log('Sample data:', JSON.stringify(data[0], null, 2).substring(0, 500))
      }
    }
  }

  console.log('\n' + '='.repeat(70))
}

checkTables().catch(console.error)
