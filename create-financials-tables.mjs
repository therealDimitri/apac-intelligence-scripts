#!/usr/bin/env node
/**
 * Create Client Financials Tables via Supabase Management API
 *
 * This script creates the financial tracking tables one by one
 * using the Supabase service role.
 */

import { createClient } from '@supabase/supabase-js'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
})

// SQL statements to execute (in order)
const statements = [
  // 1. Client Financials Table
  {
    name: 'client_financials table',
    sql: `
CREATE TABLE IF NOT EXISTS client_financials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID,
    client_name TEXT NOT NULL,
    fiscal_year INTEGER NOT NULL,
    fiscal_quarter INTEGER,
    revenue_maintenance DECIMAL(12, 2) DEFAULT 0,
    revenue_professional_services DECIMAL(12, 2) DEFAULT 0,
    revenue_software_licences DECIMAL(12, 2) DEFAULT 0,
    revenue_hardware DECIMAL(12, 2) DEFAULT 0,
    revenue_business_case DECIMAL(12, 2) DEFAULT 0,
    cogs_maintenance DECIMAL(12, 2) DEFAULT 0,
    cogs_professional_services DECIMAL(12, 2) DEFAULT 0,
    cogs_software DECIMAL(12, 2) DEFAULT 0,
    cogs_hardware DECIMAL(12, 2) DEFAULT 0,
    revenue_category TEXT,
    primary_solution TEXT,
    source_document TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
)`
  },

  // 2. Contract Renewals Table
  {
    name: 'contract_renewals table',
    sql: `
CREATE TABLE IF NOT EXISTS contract_renewals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID,
    client_name TEXT NOT NULL,
    contract_type TEXT NOT NULL,
    solution TEXT,
    oracle_agreement_number TEXT,
    contract_start_date DATE,
    contract_end_date DATE NOT NULL,
    renewal_date DATE NOT NULL,
    annual_value DECIMAL(12, 2) NOT NULL,
    renewal_value DECIMAL(12, 2),
    cpi_increase_percent DECIMAL(5, 2) DEFAULT 0,
    renewal_status TEXT DEFAULT 'pending',
    renewal_probability INTEGER DEFAULT 80,
    renewal_term_months INTEGER DEFAULT 12,
    auto_renewal BOOLEAN DEFAULT FALSE,
    assigned_cse TEXT,
    last_contact_date DATE,
    next_action TEXT,
    next_action_date DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
)`
  },

  // 3. Attrition Risk Table
  {
    name: 'attrition_risk table',
    sql: `
CREATE TABLE IF NOT EXISTS attrition_risk (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID,
    client_name TEXT NOT NULL,
    attrition_type TEXT NOT NULL,
    forecast_date DATE NOT NULL,
    forecast_quarter TEXT,
    fiscal_year INTEGER NOT NULL,
    revenue_at_risk DECIMAL(12, 2) NOT NULL,
    revenue_2025_impact DECIMAL(12, 2) DEFAULT 0,
    revenue_2026_impact DECIMAL(12, 2) DEFAULT 0,
    revenue_2027_impact DECIMAL(12, 2) DEFAULT 0,
    revenue_2028_impact DECIMAL(12, 2) DEFAULT 0,
    risk_level TEXT DEFAULT 'medium',
    probability INTEGER DEFAULT 50,
    affected_solutions TEXT[],
    attrition_reason TEXT,
    mitigation_strategy TEXT,
    mitigation_owner TEXT,
    status TEXT DEFAULT 'identified',
    notes TEXT,
    source_document TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
)`
  },

  // 4. Business Case Pipeline Table
  {
    name: 'business_case_pipeline table',
    sql: `
CREATE TABLE IF NOT EXISTS business_case_pipeline (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_case_code TEXT NOT NULL,
    business_case_name TEXT NOT NULL,
    client_id UUID,
    client_name TEXT NOT NULL,
    solution TEXT NOT NULL,
    revenue_software DECIMAL(12, 2) DEFAULT 0,
    revenue_professional_services DECIMAL(12, 2) DEFAULT 0,
    revenue_maintenance DECIMAL(12, 2) DEFAULT 0,
    cogs_total DECIMAL(12, 2) DEFAULT 0,
    current_gate INTEGER DEFAULT 0,
    gate_1_date DATE,
    gate_1_status TEXT,
    gate_1_criteria TEXT,
    gate_2_date DATE,
    gate_2_status TEXT,
    gate_2_criteria TEXT,
    gate_3_date DATE,
    gate_3_status TEXT,
    gate_3_criteria TEXT,
    scenario TEXT DEFAULT 'base',
    scenario_description TEXT,
    start_date DATE,
    target_completion_date DATE,
    status TEXT DEFAULT 'active',
    business_owner TEXT,
    technical_lead TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
)`
  }
]

async function executeSql(sql) {
  // Use fetch to call the Supabase SQL endpoint
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseServiceKey,
      'Authorization': `Bearer ${supabaseServiceKey}`
    },
    body: JSON.stringify({ sql_query: sql })
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`HTTP ${response.status}: ${text}`)
  }

  return response.json()
}

async function createTables() {
  console.log('🚀 Creating Client Financials Tables...\n')

  for (const { name, sql } of statements) {
    console.log(`📝 Creating ${name}...`)

    try {
      // Try direct table creation via Supabase
      // First check if table exists
      const tableName = name.replace(' table', '')
      const { error: checkError } = await supabase
        .from(tableName)
        .select('id')
        .limit(0)

      if (!checkError) {
        console.log(`   ⏭️  Already exists\n`)
        continue
      }

      // Table doesn't exist - needs to be created via SQL Editor
      console.log(`   ⚠️  Table needs to be created via Supabase SQL Editor\n`)

    } catch (err) {
      console.log(`   ❌ Error: ${err.message}\n`)
    }
  }

  // Verify final state
  console.log('\n' + '='.repeat(60))
  console.log('📊 Table Status Check')
  console.log('='.repeat(60) + '\n')

  const tables = [
    'client_financials',
    'contract_renewals',
    'attrition_risk',
    'business_case_pipeline'
  ]

  const missingTables = []

  for (const table of tables) {
    const { error } = await supabase.from(table).select('id').limit(0)

    if (error && error.code === '42P01') {
      console.log(`❌ ${table}: Not found`)
      missingTables.push(table)
    } else if (error) {
      console.log(`⚠️  ${table}: ${error.message}`)
    } else {
      console.log(`✅ ${table}: Ready`)
    }
  }

  if (missingTables.length > 0) {
    console.log('\n' + '='.repeat(60))
    console.log('⚠️  MANUAL STEP REQUIRED')
    console.log('='.repeat(60))
    console.log('\nPlease run the following SQL in Supabase SQL Editor:')
    console.log('https://supabase.com/dashboard/project/usoyxsunetvxdjdglkmn/sql/new')
    console.log('\nFile: docs/migrations/20251228_client_financials.sql')
    console.log('\nOr copy this SQL:\n')

    // Output the SQL for missing tables
    for (const { name, sql } of statements) {
      const tableName = name.replace(' table', '')
      if (missingTables.includes(tableName)) {
        console.log(`-- ${name}`)
        console.log(sql + ';\n')
      }
    }
  }

  console.log('\n✨ Done!\n')
}

createTables().catch(err => {
  console.error('❌ Error:', err)
  process.exit(1)
})
