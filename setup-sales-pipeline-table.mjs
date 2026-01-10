#!/usr/bin/env node

/**
 * Setup Sales Pipeline Table
 * Creates the sales_pipeline_opportunities table using Supabase Management API
 *
 * Usage:
 *   node scripts/setup-sales-pipeline-table.mjs
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN

// Extract project ref from URL
const projectRef = SUPABASE_URL?.split('//')[1]?.split('.')[0]

console.log('🏗️  Sales Pipeline Table Setup')
console.log('='.repeat(50))

async function createTableViaSql() {
  // Use the Supabase SQL Editor API
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: `
-- Sales Budget Pipeline Opportunities Table
CREATE TABLE IF NOT EXISTS sales_pipeline_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core identification
  opportunity_name TEXT NOT NULL,
  account_name TEXT NOT NULL,

  -- Assignment
  cse_name TEXT,
  cam_name TEXT,

  -- Classification from Sales Budget
  fiscal_period TEXT,
  forecast_category TEXT,
  in_or_out TEXT,
  is_under_75k BOOLEAN DEFAULT false,
  is_upside BOOLEAN DEFAULT false,
  is_focus_deal BOOLEAN DEFAULT false,

  -- Financials
  close_date DATE,
  oracle_quote_number TEXT,
  oracle_quote_status TEXT,
  total_acv DECIMAL(15,2) DEFAULT 0,
  tcv DECIMAL(15,2) DEFAULT 0,
  weighted_acv DECIMAL(15,2) DEFAULT 0,
  acv_net_cogs DECIMAL(15,2) DEFAULT 0,
  bookings_forecast DECIMAL(15,2) DEFAULT 0,

  -- Cross-reference with BURC pipeline
  burc_pipeline_id UUID,
  burc_matched BOOLEAN DEFAULT false,
  burc_match_confidence TEXT,

  -- Source tracking
  source_file TEXT DEFAULT 'APAC 2026 Sales Budget',
  source_sheet TEXT DEFAULT 'APAC Pipeline by Qtr (2)',

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sales_pipeline_account ON sales_pipeline_opportunities(account_name);
CREATE INDEX IF NOT EXISTS idx_sales_pipeline_cse ON sales_pipeline_opportunities(cse_name);
CREATE INDEX IF NOT EXISTS idx_sales_pipeline_cam ON sales_pipeline_opportunities(cam_name);
CREATE INDEX IF NOT EXISTS idx_sales_pipeline_fiscal ON sales_pipeline_opportunities(fiscal_period);
CREATE INDEX IF NOT EXISTS idx_sales_pipeline_burc_match ON sales_pipeline_opportunities(burc_matched);
CREATE INDEX IF NOT EXISTS idx_sales_pipeline_close_date ON sales_pipeline_opportunities(close_date);

-- RLS
ALTER TABLE sales_pipeline_opportunities ENABLE ROW LEVEL SECURITY;

-- RLS Policies (drop if exists, then create)
DROP POLICY IF EXISTS "Allow all for authenticated" ON sales_pipeline_opportunities;
CREATE POLICY "Allow all for authenticated" ON sales_pipeline_opportunities
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow read for anon" ON sales_pipeline_opportunities;
CREATE POLICY "Allow read for anon" ON sales_pipeline_opportunities
  FOR SELECT TO anon
  USING (true);
      `
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`SQL API Error: ${response.status} - ${error}`)
  }

  return await response.json()
}

async function createTableViaRest() {
  // Alternative: Create table by inserting a dummy record (table auto-creates)
  // This won't work - Supabase doesn't auto-create tables
  console.log('Using REST API approach...')

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // Check if table exists by trying to query it
  const { error: checkError } = await supabase
    .from('sales_pipeline_opportunities')
    .select('id')
    .limit(1)

  if (checkError && checkError.code === 'PGRST116') {
    console.log('❌ Table does not exist and cannot be created via REST API')
    console.log('   Please run the SQL manually in Supabase Dashboard:')
    console.log('   https://supabase.com/dashboard/project/' + projectRef + '/sql')
    return false
  } else if (checkError) {
    console.log('Table check error:', checkError.message)
    return false
  }

  console.log('✅ Table already exists!')
  return true
}

async function createViews() {
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: `
-- Combined Pipeline View
CREATE OR REPLACE VIEW combined_pipeline_view AS
SELECT
  'sales_budget' as source,
  sp.id,
  sp.opportunity_name,
  sp.account_name as client_name,
  sp.cse_name as assigned_cse,
  sp.cam_name as assigned_cam,
  sp.fiscal_period,
  sp.forecast_category,
  CASE WHEN sp.in_or_out = 'In' THEN true ELSE false END as in_target,
  sp.is_focus_deal as focus_deal,
  sp.is_under_75k as rats_and_mice,
  sp.close_date,
  sp.total_acv as acv,
  sp.weighted_acv,
  sp.acv_net_cogs,
  sp.tcv,
  sp.burc_matched,
  sp.burc_pipeline_id
FROM sales_pipeline_opportunities sp
UNION ALL
SELECT
  'burc' as source,
  po.id,
  po.opportunity_name,
  po.client_name,
  po.assigned_cse,
  po.assigned_cam,
  po.quarter as fiscal_period,
  po.booking_forecast as forecast_category,
  po.in_target,
  po.focus_deal,
  po.rats_and_mice,
  po.close_date,
  po.acv,
  po.weighted_acv,
  po.acv_net_cogs,
  po.tcv,
  false as burc_matched,
  NULL as burc_pipeline_id
FROM pipeline_opportunities po;

-- Territory Rollup View
CREATE OR REPLACE VIEW territory_targets_rollup AS
SELECT
  t.territory,
  t.region,
  t.quarter,
  t.fiscal_year,
  SUM(t.weighted_acv_target) as weighted_acv_target,
  SUM(t.acv_net_cogs_target) as acv_net_cogs_target,
  SUM(t.total_acv_target) as total_acv_target,
  SUM(t.tcv_target) as tcv_target,
  SUM(t.weighted_acv_actual) as weighted_acv_actual,
  SUM(t.acv_net_cogs_actual) as acv_net_cogs_actual,
  SUM(t.total_acv_actual) as total_acv_actual,
  SUM(t.tcv_actual) as tcv_actual,
  COUNT(DISTINCT t.cse_cam_name) FILTER (WHERE t.role_type = 'CSE') as cse_count
FROM cse_cam_targets t
WHERE t.role_type = 'CSE'
GROUP BY t.territory, t.region, t.quarter, t.fiscal_year;

-- Region Rollup View
CREATE OR REPLACE VIEW region_targets_rollup AS
SELECT
  t.region as bu_name,
  t.quarter,
  t.fiscal_year,
  SUM(t.weighted_acv_target) as weighted_acv_target,
  SUM(t.acv_net_cogs_target) as acv_net_cogs_target,
  SUM(t.total_acv_target) as total_acv_target,
  SUM(t.tcv_target) as tcv_target,
  SUM(t.weighted_acv_actual) as weighted_acv_actual,
  SUM(t.acv_net_cogs_actual) as acv_net_cogs_actual,
  SUM(t.total_acv_actual) as total_acv_actual,
  SUM(t.tcv_actual) as tcv_actual,
  COUNT(DISTINCT t.territory) as territory_count,
  COUNT(DISTINCT t.cse_cam_name) FILTER (WHERE t.role_type = 'CSE') as cse_count
FROM cse_cam_targets t
WHERE t.role_type = 'CSE'
GROUP BY t.region, t.quarter, t.fiscal_year;

-- APAC BU Total View
CREATE OR REPLACE VIEW apac_bu_targets AS
SELECT
  'APAC' as bu_name,
  t.quarter,
  t.fiscal_year,
  SUM(t.weighted_acv_target) as weighted_acv_target,
  SUM(t.acv_net_cogs_target) as acv_net_cogs_target,
  SUM(t.total_acv_target) as total_acv_target,
  SUM(t.tcv_target) as tcv_target,
  SUM(t.weighted_acv_actual) as weighted_acv_actual,
  SUM(t.acv_net_cogs_actual) as acv_net_cogs_actual,
  SUM(t.total_acv_actual) as total_acv_actual,
  SUM(t.tcv_actual) as tcv_actual,
  COUNT(DISTINCT t.region) as region_count,
  COUNT(DISTINCT t.territory) as territory_count,
  COUNT(DISTINCT t.cse_cam_name) FILTER (WHERE t.role_type = 'CSE') as cse_count
FROM cse_cam_targets t
WHERE t.role_type = 'CSE'
GROUP BY t.quarter, t.fiscal_year;
      `
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Views creation error: ${response.status} - ${error}`)
  }

  return await response.json()
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing Supabase credentials in .env.local')
    process.exit(1)
  }

  console.log(`Project: ${projectRef}`)
  console.log('')

  // Try SQL API first
  if (SUPABASE_ACCESS_TOKEN) {
    console.log('1. Creating sales_pipeline_opportunities table via SQL API...')
    try {
      const result = await createTableViaSql()
      console.log('✅ Table created successfully!')
      console.log('')

      console.log('2. Creating rollup views...')
      const viewsResult = await createViews()
      console.log('✅ Views created successfully!')
      console.log('')

    } catch (error) {
      console.log('⚠️  SQL API error:', error.message)
      console.log('')

      // Check if table already exists
      const tableExists = await createTableViaRest()
      if (!tableExists) {
        console.log('')
        console.log('📋 Manual SQL Required:')
        console.log('   Copy the migration file content and run in Supabase SQL Editor')
        console.log(`   supabase/migrations/20260110_sales_budget_pipeline.sql`)
        process.exit(1)
      }
    }
  } else {
    console.log('⚠️  No SUPABASE_ACCESS_TOKEN - checking if table exists...')
    const tableExists = await createTableViaRest()
    if (!tableExists) {
      console.log('')
      console.log('📋 Please run the migration manually:')
      console.log(`   supabase/migrations/20260110_sales_budget_pipeline.sql`)
      process.exit(1)
    }
  }

  // Verify table
  console.log('3. Verifying table structure...')
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  const { data, error } = await supabase
    .from('sales_pipeline_opportunities')
    .select('id')
    .limit(1)

  if (error) {
    console.log('❌ Table verification failed:', error.message)
    process.exit(1)
  }

  console.log('✅ Table verified and ready!')
  console.log('')
  console.log('Next step: Run sync-sales-budget-pipeline.mjs to import data')
}

main().catch(console.error)
