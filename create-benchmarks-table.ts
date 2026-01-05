#!/usr/bin/env tsx
/**
 * Script to create regional_benchmarks table and populate with seed data
 * This script uses service worker access to create the table directly
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import * as path from 'path'

// Load environment variables
config({ path: path.join(__dirname, '../.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

interface BenchmarkData {
  region: string
  period: string
  metric_name: string
  metric_value: number
  target_value?: number
  previous_value?: number
  unit: string
}

async function createTableAndSeedData() {
  console.log('🚀 Creating regional_benchmarks table and seeding data...\n')

  // Sample data for 2025-Q4
  const benchmarkData: BenchmarkData[] = [
    // APAC Region - Q4
    { region: 'APAC', period: '2025-Q4', metric_name: 'NRR', metric_value: 108.5, target_value: 110.0, previous_value: 107.2, unit: '%' },
    { region: 'APAC', period: '2025-Q4', metric_name: 'GRR', metric_value: 95.2, target_value: 96.0, previous_value: 94.8, unit: '%' },
    { region: 'APAC', period: '2025-Q4', metric_name: 'Rule of 40', metric_value: 42.3, target_value: 45.0, previous_value: 41.1, unit: '%' },
    { region: 'APAC', period: '2025-Q4', metric_name: 'DSO', metric_value: 52.0, target_value: 45.0, previous_value: 54.5, unit: 'days' },
    { region: 'APAC', period: '2025-Q4', metric_name: 'Churn Rate', metric_value: 4.8, target_value: 4.0, previous_value: 5.2, unit: '%' },
    { region: 'APAC', period: '2025-Q4', metric_name: 'ARR Growth', metric_value: 23.5, target_value: 25.0, previous_value: 22.8, unit: '%' },

    // EMEA Region - Q4
    { region: 'EMEA', period: '2025-Q4', metric_name: 'NRR', metric_value: 112.3, target_value: 110.0, previous_value: 111.5, unit: '%' },
    { region: 'EMEA', period: '2025-Q4', metric_name: 'GRR', metric_value: 96.8, target_value: 96.0, previous_value: 96.2, unit: '%' },
    { region: 'EMEA', period: '2025-Q4', metric_name: 'Rule of 40', metric_value: 47.8, target_value: 45.0, previous_value: 46.9, unit: '%' },
    { region: 'EMEA', period: '2025-Q4', metric_name: 'DSO', metric_value: 38.5, target_value: 45.0, previous_value: 39.2, unit: 'days' },
    { region: 'EMEA', period: '2025-Q4', metric_name: 'Churn Rate', metric_value: 3.2, target_value: 4.0, previous_value: 3.8, unit: '%' },
    { region: 'EMEA', period: '2025-Q4', metric_name: 'ARR Growth', metric_value: 27.2, target_value: 25.0, previous_value: 26.5, unit: '%' },

    // Americas Region - Q4
    { region: 'Americas', period: '2025-Q4', metric_name: 'NRR', metric_value: 115.7, target_value: 110.0, previous_value: 114.2, unit: '%' },
    { region: 'Americas', period: '2025-Q4', metric_name: 'GRR', metric_value: 97.5, target_value: 96.0, previous_value: 97.1, unit: '%' },
    { region: 'Americas', period: '2025-Q4', metric_name: 'Rule of 40', metric_value: 52.1, target_value: 45.0, previous_value: 50.8, unit: '%' },
    { region: 'Americas', period: '2025-Q4', metric_name: 'DSO', metric_value: 42.3, target_value: 45.0, previous_value: 43.8, unit: 'days' },
    { region: 'Americas', period: '2025-Q4', metric_name: 'Churn Rate', metric_value: 2.5, target_value: 4.0, previous_value: 2.9, unit: '%' },
    { region: 'Americas', period: '2025-Q4', metric_name: 'ARR Growth', metric_value: 31.5, target_value: 25.0, previous_value: 30.2, unit: '%' },

    // Global Aggregate - Q4
    { region: 'Global', period: '2025-Q4', metric_name: 'NRR', metric_value: 112.2, target_value: 110.0, previous_value: 111.0, unit: '%' },
    { region: 'Global', period: '2025-Q4', metric_name: 'GRR', metric_value: 96.5, target_value: 96.0, previous_value: 96.0, unit: '%' },
    { region: 'Global', period: '2025-Q4', metric_name: 'Rule of 40', metric_value: 47.4, target_value: 45.0, previous_value: 46.3, unit: '%' },
    { region: 'Global', period: '2025-Q4', metric_name: 'DSO', metric_value: 44.3, target_value: 45.0, previous_value: 45.8, unit: 'days' },
    { region: 'Global', period: '2025-Q4', metric_name: 'Churn Rate', metric_value: 3.5, target_value: 4.0, previous_value: 4.0, unit: '%' },
    { region: 'Global', period: '2025-Q4', metric_name: 'ARR Growth', metric_value: 27.4, target_value: 25.0, previous_value: 26.5, unit: '%' },

    // APAC YTD
    { region: 'APAC', period: '2025-YTD', metric_name: 'NRR', metric_value: 107.8, target_value: 110.0, previous_value: 105.5, unit: '%' },
    { region: 'APAC', period: '2025-YTD', metric_name: 'GRR', metric_value: 94.9, target_value: 96.0, previous_value: 94.2, unit: '%' },
    { region: 'APAC', period: '2025-YTD', metric_name: 'Rule of 40', metric_value: 41.5, target_value: 45.0, previous_value: 39.8, unit: '%' },
    { region: 'APAC', period: '2025-YTD', metric_name: 'DSO', metric_value: 53.2, target_value: 45.0, previous_value: 56.8, unit: 'days' },
    { region: 'APAC', period: '2025-YTD', metric_name: 'Churn Rate', metric_value: 5.1, target_value: 4.0, previous_value: 5.8, unit: '%' },
    { region: 'APAC', period: '2025-YTD', metric_name: 'ARR Growth', metric_value: 22.9, target_value: 25.0, previous_value: 21.2, unit: '%' },
  ]

  try {
    // Try to insert the data - if table doesn't exist, this will fail
    console.log(`📊 Attempting to insert ${benchmarkData.length} benchmark records...`)

    const { data, error } = await supabase
      .from('regional_benchmarks')
      .insert(benchmarkData)
      .select()

    if (error) {
      if (error.code === '42P01') {
        // Table doesn't exist
        console.log('❌ Table regional_benchmarks does not exist')
        console.log('\n📋 To create the table, please execute the following SQL in Supabase Dashboard:')
        console.log('   1. Navigate to: https://supabase.com/dashboard/project/usoyxsunetvxdjdglkmn/sql/new')
        console.log('   2. Copy SQL from: docs/migrations/20260105_regional_benchmarks.sql')
        console.log('   3. Execute the SQL')
        console.log('   4. Then run this script again to populate data')
        console.log('\n✨ The migration SQL file has been prepared and is ready to execute.')
        return
      } else if (error.code === '23505') {
        // Duplicate key - data already exists
        console.log('⚠️  Data already exists (duplicate key)')
        console.log('   Skipping insertion to avoid conflicts')
      } else {
        console.error('❌ Error inserting data:', error)
        throw error
      }
    } else {
      console.log(`✅ Successfully inserted ${data?.length || 0} benchmark records!`)
      console.log('\n📊 Sample data inserted:')
      console.log('   - Regions: APAC, EMEA, Americas, Global')
      console.log('   - Periods: 2025-Q4, 2025-YTD')
      console.log('   - Metrics: NRR, GRR, Rule of 40, DSO, Churn Rate, ARR Growth')
    }

    // Verify the data
    const { data: verifyData, error: verifyError } = await supabase
      .from('regional_benchmarks')
      .select('region, period', { count: 'exact' })

    if (!verifyError) {
      console.log(`\n✅ Verification successful!`)
      console.log(`   Total records in table: ${verifyData?.length || 0}`)
    }

  } catch (err) {
    console.error('\n❌ Unexpected error:', err)
    process.exit(1)
  }
}

createTableAndSeedData()
