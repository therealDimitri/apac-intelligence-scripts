#!/usr/bin/env node
/**
 * Create BURC Enhancement Tables Directly
 * Uses Supabase client to create tables one by one
 */

import { createClient } from '@supabase/supabase-js'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  db: { schema: 'public' }
})

// Table creation SQL statements
const tables = [
  {
    name: 'burc_historical_revenue',
    sql: `CREATE TABLE IF NOT EXISTS burc_historical_revenue (
      id SERIAL PRIMARY KEY,
      parent_company TEXT,
      customer_name TEXT NOT NULL,
      revenue_type TEXT NOT NULL,
      year_2019 DECIMAL(14,2) DEFAULT 0,
      year_2020 DECIMAL(14,2) DEFAULT 0,
      year_2021 DECIMAL(14,2) DEFAULT 0,
      year_2022 DECIMAL(14,2) DEFAULT 0,
      year_2023 DECIMAL(14,2) DEFAULT 0,
      year_2024 DECIMAL(14,2) DEFAULT 0,
      year_2025 DECIMAL(14,2) DEFAULT 0,
      year_2026 DECIMAL(14,2) DEFAULT 0,
      currency TEXT DEFAULT 'USD',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      last_synced TIMESTAMPTZ DEFAULT NOW()
    )`
  },
  {
    name: 'burc_monthly_revenue_detail',
    sql: `CREATE TABLE IF NOT EXISTS burc_monthly_revenue_detail (
      id SERIAL PRIMARY KEY,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      month_name TEXT,
      revenue_stream TEXT NOT NULL,
      customer_name TEXT,
      product_line TEXT,
      gross_revenue DECIMAL(14,2) DEFAULT 0,
      cogs DECIMAL(14,2) DEFAULT 0,
      currency TEXT DEFAULT 'USD',
      source_file TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      last_synced TIMESTAMPTZ DEFAULT NOW()
    )`
  },
  {
    name: 'burc_contracts',
    sql: `CREATE TABLE IF NOT EXISTS burc_contracts (
      id SERIAL PRIMARY KEY,
      client_name TEXT NOT NULL,
      solution TEXT,
      annual_value_aud DECIMAL(14,2),
      annual_value_usd DECIMAL(14,2),
      renewal_date DATE,
      contract_end_date DATE,
      comments TEXT,
      exchange_rate DECIMAL(6,4) DEFAULT 0.64,
      auto_renewal BOOLEAN DEFAULT false,
      cpi_applicable BOOLEAN DEFAULT false,
      cpi_percentage DECIMAL(4,2),
      contract_term_months INTEGER,
      contract_status TEXT DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      last_synced TIMESTAMPTZ DEFAULT NOW()
    )`
  },
  {
    name: 'burc_attrition_risk',
    sql: `CREATE TABLE IF NOT EXISTS burc_attrition_risk (
      id SERIAL PRIMARY KEY,
      client_name TEXT NOT NULL,
      risk_type TEXT,
      forecast_date DATE,
      revenue_2024 DECIMAL(14,2) DEFAULT 0,
      revenue_2025 DECIMAL(14,2) DEFAULT 0,
      revenue_2026 DECIMAL(14,2) DEFAULT 0,
      revenue_2027 DECIMAL(14,2) DEFAULT 0,
      revenue_2028 DECIMAL(14,2) DEFAULT 0,
      total_at_risk DECIMAL(14,2) DEFAULT 0,
      status TEXT DEFAULT 'open',
      mitigation_notes TEXT,
      churn_reason TEXT,
      product_affected TEXT,
      snapshot_date DATE DEFAULT CURRENT_DATE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      last_synced TIMESTAMPTZ DEFAULT NOW()
    )`
  },
  {
    name: 'burc_business_cases',
    sql: `CREATE TABLE IF NOT EXISTS burc_business_cases (
      id SERIAL PRIMARY KEY,
      opportunity_name TEXT NOT NULL,
      client_name TEXT,
      forecast_category TEXT,
      closure_date DATE,
      oracle_agreement_number TEXT,
      sw_revenue_date DATE,
      ps_revenue_date DATE,
      maint_revenue_date DATE,
      hw_revenue_date DATE,
      estimated_sw_value DECIMAL(14,2) DEFAULT 0,
      estimated_ps_value DECIMAL(14,2) DEFAULT 0,
      estimated_maint_value DECIMAL(14,2) DEFAULT 0,
      estimated_hw_value DECIMAL(14,2) DEFAULT 0,
      probability DECIMAL(3,2) DEFAULT 0.5,
      stage TEXT DEFAULT 'active',
      owner TEXT,
      snapshot_month TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      last_synced TIMESTAMPTZ DEFAULT NOW()
    )`
  },
  {
    name: 'burc_cross_charges',
    sql: `CREATE TABLE IF NOT EXISTS burc_cross_charges (
      id SERIAL PRIMARY KEY,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      source_bu TEXT NOT NULL,
      target_bu TEXT NOT NULL,
      charge_type TEXT,
      amount DECIMAL(14,2) NOT NULL,
      hours DECIMAL(10,2),
      rate DECIMAL(10,2),
      description TEXT,
      currency TEXT DEFAULT 'USD',
      source_file TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      last_synced TIMESTAMPTZ DEFAULT NOW()
    )`
  },
  {
    name: 'burc_fx_rates',
    sql: `CREATE TABLE IF NOT EXISTS burc_fx_rates (
      id SERIAL PRIMARY KEY,
      rate_date DATE NOT NULL,
      currency_from TEXT NOT NULL,
      currency_to TEXT NOT NULL DEFAULT 'USD',
      rate DECIMAL(10,6) NOT NULL,
      rate_type TEXT DEFAULT 'period_end',
      source TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`
  },
  {
    name: 'burc_arr_tracking',
    sql: `CREATE TABLE IF NOT EXISTS burc_arr_tracking (
      id SERIAL PRIMARY KEY,
      client_name TEXT NOT NULL,
      cse_owner TEXT,
      arr_usd DECIMAL(14,2) NOT NULL,
      target_pipeline_percent DECIMAL(5,2) DEFAULT 10,
      target_pipeline_value DECIMAL(14,2),
      actual_bookings DECIMAL(14,2) DEFAULT 0,
      variance DECIMAL(14,2),
      year INTEGER NOT NULL,
      quarter TEXT,
      snapshot_date DATE DEFAULT CURRENT_DATE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      last_synced TIMESTAMPTZ DEFAULT NOW()
    )`
  },
  {
    name: 'burc_sync_audit',
    sql: `CREATE TABLE IF NOT EXISTS burc_sync_audit (
      id SERIAL PRIMARY KEY,
      sync_id UUID DEFAULT gen_random_uuid(),
      sync_type TEXT NOT NULL,
      table_name TEXT NOT NULL,
      operation TEXT,
      records_processed INTEGER DEFAULT 0,
      records_inserted INTEGER DEFAULT 0,
      records_updated INTEGER DEFAULT 0,
      records_deleted INTEGER DEFAULT 0,
      source_file TEXT,
      error_message TEXT,
      duration_ms INTEGER,
      metadata JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`
  }
]

async function createTables() {
  console.log('🚀 Creating BURC Enhancement Tables...\n')

  for (const table of tables) {
    try {
      // Try using the REST API directly
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        },
        body: JSON.stringify({ sql_query: table.sql })
      })

      if (response.ok) {
        console.log(`✅ ${table.name}`)
      } else {
        const text = await response.text()
        if (text.includes('already exists') || text.includes('42P07')) {
          console.log(`✅ ${table.name} (already exists)`)
        } else {
          console.log(`⚠️ ${table.name}: ${text.substring(0, 80)}...`)
        }
      }
    } catch (err) {
      console.log(`⚠️ ${table.name}: ${err.message}`)
    }
  }

  // Verify tables
  console.log('\n🔍 Verifying tables...')
  for (const table of tables) {
    const { data, error } = await supabase.from(table.name).select('id').limit(1)
    if (error) {
      console.log(`   ❌ ${table.name}: ${error.message.substring(0, 50)}`)
    } else {
      console.log(`   ✅ ${table.name}: Ready`)
    }
  }
}

createTables().catch(console.error)
