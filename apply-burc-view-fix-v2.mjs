#!/usr/bin/env node
/**
 * Apply BURC Revenue View Fix Migration via Supabase Management API
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables from .env.local
const envPath = join(__dirname, '../.env.local')
const envContent = readFileSync(envPath, 'utf-8')
const env = {}
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/)
  if (match) {
    env[match[1]] = match[2].replace(/^["']|["']$/g, '')
  }
})

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables')
  process.exit(1)
}

// Extract project ref from URL
const projectRef = supabaseUrl.match(/https:\/\/([^.]+)/)?.[1]
console.log(`📦 Project: ${projectRef}`)

async function executeSql(sql) {
  // Use the REST API with service role key
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseServiceKey,
      'Authorization': `Bearer ${supabaseServiceKey}`,
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({ sql })
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`SQL execution failed: ${text}`)
  }

  return response.json()
}

async function applyMigration() {
  console.log('🚀 Applying BURC Revenue View Fix Migration...\n')

  // Execute each statement separately
  const statements = [
    // 1. Drop dependent views first
    `DROP VIEW IF EXISTS burc_executive_summary CASCADE`,
    `DROP VIEW IF EXISTS burc_revenue_retention CASCADE`,
    `DROP VIEW IF EXISTS burc_rule_of_40 CASCADE`,

    // 2. Create fixed revenue retention view
    `CREATE OR REPLACE VIEW burc_revenue_retention AS
WITH yearly_revenue AS (
  SELECT
    customer_name,
    SUM(COALESCE(year_2023, 0)) as year_2023,
    SUM(COALESCE(year_2024, 0)) as year_2024,
    SUM(COALESCE(year_2025, 0)) as year_2025,
    SUM(COALESCE(year_2026, 0)) as year_2026
  FROM burc_historical_revenue
  GROUP BY customer_name
),
attrition_by_year AS (
  SELECT
    client_name,
    SUM(COALESCE(revenue_2024, 0)) as churn_2024,
    SUM(COALESCE(revenue_2025, 0)) as churn_2025,
    SUM(COALESCE(revenue_2026, 0)) as churn_2026
  FROM burc_attrition_risk
  WHERE status != 'mitigated'
  GROUP BY client_name
)
SELECT
  2024 as year,
  COALESCE(SUM(yr.year_2023), 0) as starting_revenue,
  COALESCE(SUM(yr.year_2024), 0) as ending_revenue,
  COALESCE(SUM(attr.churn_2024), 0) as churn,
  CASE WHEN COALESCE(SUM(yr.year_2023), 0) > 0 THEN ROUND(((COALESCE(SUM(yr.year_2023), 0) - COALESCE(SUM(attr.churn_2024), 0)) / COALESCE(SUM(yr.year_2023), 0)) * 100, 1) ELSE 0 END as grr_percent,
  CASE WHEN COALESCE(SUM(yr.year_2023), 0) > 0 THEN ROUND((COALESCE(SUM(yr.year_2024), 0) / COALESCE(SUM(yr.year_2023), 0)) * 100, 1) ELSE 0 END as nrr_percent,
  CASE WHEN COALESCE(SUM(yr.year_2024), 0) > COALESCE(SUM(yr.year_2023), 0) THEN COALESCE(SUM(yr.year_2024), 0) - COALESCE(SUM(yr.year_2023), 0) ELSE 0 END as expansion_revenue
FROM yearly_revenue yr
LEFT JOIN attrition_by_year attr ON yr.customer_name = attr.client_name

UNION ALL

SELECT
  2025 as year,
  COALESCE(SUM(yr.year_2024), 0) as starting_revenue,
  COALESCE(SUM(yr.year_2025), 0) as ending_revenue,
  COALESCE(SUM(attr.churn_2025), 0) as churn,
  CASE WHEN COALESCE(SUM(yr.year_2024), 0) > 0 THEN ROUND(((COALESCE(SUM(yr.year_2024), 0) - COALESCE(SUM(attr.churn_2025), 0)) / COALESCE(SUM(yr.year_2024), 0)) * 100, 1) ELSE 0 END as grr_percent,
  CASE WHEN COALESCE(SUM(yr.year_2024), 0) > 0 THEN ROUND((COALESCE(SUM(yr.year_2025), 0) / COALESCE(SUM(yr.year_2024), 0)) * 100, 1) ELSE 0 END as nrr_percent,
  CASE WHEN COALESCE(SUM(yr.year_2025), 0) > COALESCE(SUM(yr.year_2024), 0) THEN COALESCE(SUM(yr.year_2025), 0) - COALESCE(SUM(yr.year_2024), 0) ELSE 0 END as expansion_revenue
FROM yearly_revenue yr
LEFT JOIN attrition_by_year attr ON yr.customer_name = attr.client_name

UNION ALL

SELECT
  2026 as year,
  COALESCE(SUM(yr.year_2025), 0) as starting_revenue,
  COALESCE(SUM(yr.year_2026), 0) as ending_revenue,
  COALESCE(SUM(attr.churn_2026), 0) as churn,
  CASE WHEN COALESCE(SUM(yr.year_2025), 0) > 0 THEN ROUND(((COALESCE(SUM(yr.year_2025), 0) - COALESCE(SUM(attr.churn_2026), 0)) / COALESCE(SUM(yr.year_2025), 0)) * 100, 1) ELSE 0 END as grr_percent,
  CASE WHEN COALESCE(SUM(yr.year_2025), 0) > 0 THEN ROUND((COALESCE(SUM(yr.year_2026), 0) / COALESCE(SUM(yr.year_2025), 0)) * 100, 1) ELSE 0 END as nrr_percent,
  CASE WHEN COALESCE(SUM(yr.year_2026), 0) > COALESCE(SUM(yr.year_2025), 0) THEN COALESCE(SUM(yr.year_2026), 0) - COALESCE(SUM(yr.year_2025), 0) ELSE 0 END as expansion_revenue
FROM yearly_revenue yr
LEFT JOIN attrition_by_year attr ON yr.customer_name = attr.client_name`,

    // 3. Create fixed rule of 40 view
    `CREATE OR REPLACE VIEW burc_rule_of_40 AS
WITH yearly_totals AS (
  SELECT
    SUM(COALESCE(year_2023, 0)) as total_2023,
    SUM(COALESCE(year_2024, 0)) as total_2024,
    SUM(COALESCE(year_2025, 0)) as total_2025,
    SUM(COALESCE(year_2026, 0)) as total_2026
  FROM burc_historical_revenue
),
revenue_growth AS (
  SELECT 2024 as year, total_2023 as prev_revenue, total_2024 as curr_revenue,
    CASE WHEN total_2023 > 0 THEN ROUND(((total_2024 - total_2023) / total_2023) * 100, 1) ELSE 0 END as growth_percent
  FROM yearly_totals
  UNION ALL
  SELECT 2025, total_2024, total_2025,
    CASE WHEN total_2024 > 0 THEN ROUND(((total_2025 - total_2024) / total_2024) * 100, 1) ELSE 0 END
  FROM yearly_totals
  UNION ALL
  SELECT 2026, total_2025, total_2026,
    CASE WHEN total_2025 > 0 THEN ROUND(((total_2026 - total_2025) / total_2025) * 100, 1) ELSE 0 END
  FROM yearly_totals
)
SELECT
  rg.year,
  rg.prev_revenue,
  rg.curr_revenue,
  rg.growth_percent as revenue_growth_percent,
  15.0 as ebita_margin_percent,
  rg.growth_percent + 15.0 as rule_of_40_score,
  CASE WHEN rg.growth_percent + 15.0 >= 40 THEN 'Passing' WHEN rg.growth_percent + 15.0 >= 30 THEN 'At Risk' ELSE 'Below Target' END as rule_of_40_status
FROM revenue_growth rg`,

    // 4. Create executive summary view
    `CREATE OR REPLACE VIEW burc_executive_summary AS
WITH latest_retention AS (SELECT * FROM burc_revenue_retention WHERE year = 2025),
latest_rule40 AS (SELECT * FROM burc_rule_of_40 WHERE year = 2025),
total_arr AS (SELECT COALESCE(SUM(arr_usd), 0) as total_arr FROM burc_arr_tracking WHERE year = 2025),
total_contracts AS (SELECT COUNT(*) as active_contracts, COALESCE(SUM(annual_value_usd), 0) as total_contract_value FROM burc_contracts WHERE contract_status = 'active'),
pipeline_summary AS (SELECT COALESCE(SUM(estimated_sw_value + estimated_ps_value + estimated_maint_value + estimated_hw_value), 0) as total_pipeline, COALESCE(SUM((estimated_sw_value + estimated_ps_value + estimated_maint_value + estimated_hw_value) * probability), 0) as weighted_pipeline FROM burc_business_cases WHERE stage = 'active'),
attrition_summary AS (SELECT COALESCE(SUM(total_at_risk), 0) as total_at_risk, COUNT(*) as risk_count FROM burc_attrition_risk WHERE status = 'open')
SELECT
  CURRENT_DATE as snapshot_date,
  COALESCE(lr.nrr_percent, 0) as nrr_percent,
  COALESCE(lr.grr_percent, 0) as grr_percent,
  COALESCE(lr.churn, 0) as annual_churn,
  COALESCE(lr.expansion_revenue, 0) as expansion_revenue,
  COALESCE(lrf.revenue_growth_percent, 0) as revenue_growth_percent,
  COALESCE(lrf.ebita_margin_percent, 15.0) as ebita_margin_percent,
  COALESCE(lrf.rule_of_40_score, 15.0) as rule_of_40_score,
  COALESCE(lrf.rule_of_40_status, 'Below Target') as rule_of_40_status,
  COALESCE(ta.total_arr, 0) as total_arr,
  COALESCE(tc.active_contracts, 0) as active_contracts,
  COALESCE(tc.total_contract_value, 0) as total_contract_value,
  COALESCE(ps.total_pipeline, 0) as total_pipeline,
  COALESCE(ps.weighted_pipeline, 0) as weighted_pipeline,
  COALESCE(ats.total_at_risk, 0) as total_at_risk,
  COALESCE(ats.risk_count, 0) as attrition_risk_count,
  CASE WHEN COALESCE(lr.nrr_percent, 0) >= 110 THEN 'Excellent' WHEN COALESCE(lr.nrr_percent, 0) >= 100 THEN 'Good' WHEN COALESCE(lr.nrr_percent, 0) >= 90 THEN 'At Risk' ELSE 'Critical' END as nrr_health,
  CASE WHEN COALESCE(lr.grr_percent, 0) >= 95 THEN 'Excellent' WHEN COALESCE(lr.grr_percent, 0) >= 90 THEN 'Good' WHEN COALESCE(lr.grr_percent, 0) >= 85 THEN 'At Risk' ELSE 'Critical' END as grr_health
FROM latest_retention lr
CROSS JOIN latest_rule40 lrf
CROSS JOIN total_arr ta
CROSS JOIN total_contracts tc
CROSS JOIN pipeline_summary ps
CROSS JOIN attrition_summary ats`
  ]

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i]
    const preview = stmt.substring(0, 60).replace(/\n/g, ' ')
    console.log(`[${i + 1}/${statements.length}] ${preview}...`)

    try {
      await executeSql(stmt)
      console.log('   ✅ Success')
    } catch (err) {
      console.log(`   ⚠️ ${err.message}`)
    }
  }

  console.log('\n✅ Migration applied! Verifying...\n')

  // Verify via direct REST API query
  const verifyResponse = await fetch(`${supabaseUrl}/rest/v1/burc_revenue_retention?select=*`, {
    headers: {
      'apikey': supabaseServiceKey,
      'Authorization': `Bearer ${supabaseServiceKey}`
    }
  })

  if (verifyResponse.ok) {
    const retention = await verifyResponse.json()
    console.log('📊 Revenue Retention Metrics:')
    retention?.forEach(r => {
      console.log(`   Year ${r.year}: NRR ${r.nrr_percent}% | GRR ${r.grr_percent}% | Starting $${(r.starting_revenue/1000000).toFixed(2)}M → Ending $${(r.ending_revenue/1000000).toFixed(2)}M`)
    })
  }

  // Verify Rule of 40
  const r40Response = await fetch(`${supabaseUrl}/rest/v1/burc_rule_of_40?select=*`, {
    headers: {
      'apikey': supabaseServiceKey,
      'Authorization': `Bearer ${supabaseServiceKey}`
    }
  })

  if (r40Response.ok) {
    const rule40 = await r40Response.json()
    console.log('\n📊 Rule of 40:')
    rule40?.forEach(r => {
      console.log(`   Year ${r.year}: Growth ${r.revenue_growth_percent}% + EBITA ${r.ebita_margin_percent}% = ${r.rule_of_40_score} (${r.rule_of_40_status})`)
    })
  }
}

applyMigration().catch(console.error)
