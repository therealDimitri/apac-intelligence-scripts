#!/usr/bin/env node

/**
 * Apply BURC Historical Cache Migration
 * Creates cache tables for pre-aggregated analytics data
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function createCacheTables() {
  console.log('Creating BURC cache tables...\n')

  // Create tables one by one using simple queries
  const tables = [
    {
      name: 'burc_cache_revenue_trend',
      sql: `CREATE TABLE IF NOT EXISTS burc_cache_revenue_trend (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        fiscal_year INTEGER NOT NULL UNIQUE,
        sw_revenue NUMERIC DEFAULT 0,
        ps_revenue NUMERIC DEFAULT 0,
        maint_revenue NUMERIC DEFAULT 0,
        hw_revenue NUMERIC DEFAULT 0,
        total_revenue NUMERIC DEFAULT 0,
        yoy_growth NUMERIC DEFAULT 0,
        cached_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )`
    },
    {
      name: 'burc_cache_client_lifetime',
      sql: `CREATE TABLE IF NOT EXISTS burc_cache_client_lifetime (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_name TEXT NOT NULL UNIQUE,
        parent_company TEXT,
        years_active INTEGER DEFAULT 0,
        lifetime_revenue NUMERIC DEFAULT 0,
        revenue_2019 NUMERIC DEFAULT 0,
        revenue_2020 NUMERIC DEFAULT 0,
        revenue_2021 NUMERIC DEFAULT 0,
        revenue_2022 NUMERIC DEFAULT 0,
        revenue_2023 NUMERIC DEFAULT 0,
        revenue_2024 NUMERIC DEFAULT 0,
        revenue_2025 NUMERIC DEFAULT 0,
        yoy_growth NUMERIC DEFAULT 0,
        cached_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )`
    },
    {
      name: 'burc_cache_concentration',
      sql: `CREATE TABLE IF NOT EXISTS burc_cache_concentration (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        fiscal_year INTEGER NOT NULL UNIQUE,
        total_clients INTEGER DEFAULT 0,
        total_revenue NUMERIC DEFAULT 0,
        top5_percent NUMERIC DEFAULT 0,
        top10_percent NUMERIC DEFAULT 0,
        top20_percent NUMERIC DEFAULT 0,
        hhi NUMERIC DEFAULT 0,
        risk_level TEXT DEFAULT 'Low',
        cached_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )`
    },
    {
      name: 'burc_cache_nrr',
      sql: `CREATE TABLE IF NOT EXISTS burc_cache_nrr (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        fiscal_year INTEGER NOT NULL UNIQUE,
        nrr NUMERIC DEFAULT 0,
        grr NUMERIC DEFAULT 0,
        expansion NUMERIC DEFAULT 0,
        contraction NUMERIC DEFAULT 0,
        churn NUMERIC DEFAULT 0,
        new_business NUMERIC DEFAULT 0,
        cached_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )`
    },
    {
      name: 'burc_cache_metadata',
      sql: `CREATE TABLE IF NOT EXISTS burc_cache_metadata (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cache_key TEXT NOT NULL UNIQUE,
        last_refreshed TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        record_count INTEGER DEFAULT 0,
        total_revenue NUMERIC DEFAULT 0,
        notes TEXT
      )`
    }
  ]

  for (const table of tables) {
    console.log(`  Creating ${table.name}...`)
    // Use rpc to execute SQL or check if table exists
    const { error } = await supabase.rpc('exec_sql', { sql: table.sql })

    if (error) {
      // Table might already exist, try to select from it
      const { error: selectError } = await supabase
        .from(table.name)
        .select('id')
        .limit(1)

      if (selectError && !selectError.message.includes('does not exist')) {
        console.log(`    ⚠️  ${table.name}: ${error.message}`)
      } else if (!selectError) {
        console.log(`    ✓ ${table.name} already exists`)
      } else {
        // Table doesn't exist, need manual creation
        console.log(`    ❌ ${table.name}: Needs manual creation in Supabase dashboard`)
      }
    } else {
      console.log(`    ✓ ${table.name} created`)
    }
  }

  console.log('\n✅ Cache table setup complete')
}

async function checkTables() {
  console.log('\nVerifying cache tables...\n')

  const tables = [
    'burc_cache_revenue_trend',
    'burc_cache_client_lifetime',
    'burc_cache_concentration',
    'burc_cache_nrr',
    'burc_cache_metadata'
  ]

  for (const table of tables) {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })

    if (error) {
      console.log(`  ❌ ${table}: ${error.message}`)
    } else {
      console.log(`  ✓ ${table}: ${count ?? 0} records`)
    }
  }
}

async function main() {
  console.log('='.repeat(60))
  console.log('BURC Historical Cache Migration')
  console.log('='.repeat(60))

  await createCacheTables()
  await checkTables()

  console.log('\n' + '='.repeat(60))
  console.log('Migration complete. Run refresh-burc-cache.mjs to populate data.')
  console.log('='.repeat(60))
}

main().catch(console.error)
