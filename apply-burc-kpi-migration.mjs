#!/usr/bin/env node
/**
 * Apply BURC KPI Calculations Migration
 * Creates views for NRR, GRR, Rule of 40, and executive summary
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// View definitions (individual CREATE OR REPLACE statements)
const views = [
  {
    name: 'burc_revenue_retention',
    sql: `
CREATE OR REPLACE VIEW burc_revenue_retention AS
WITH yearly_revenue AS (
  SELECT customer_name, revenue_type, year_2023, year_2024, year_2025, year_2026
  FROM burc_historical_revenue
  WHERE revenue_type IN ('Maintenance', 'Software', 'Total Revenue')
),
attrition_by_year AS (
  SELECT client_name,
    SUM(COALESCE(revenue_2024, 0)) as churn_2024,
    SUM(COALESCE(revenue_2025, 0)) as churn_2025,
    SUM(COALESCE(revenue_2026, 0)) as churn_2026
  FROM burc_attrition_risk WHERE status != 'mitigated' GROUP BY client_name
)
SELECT 2024 as year,
  COALESCE(SUM(yr.year_2023), 0) as starting_revenue,
  COALESCE(SUM(yr.year_2024), 0) as ending_revenue,
  COALESCE(SUM(attr.churn_2024), 0) as churn,
  CASE WHEN COALESCE(SUM(yr.year_2023), 0) > 0 THEN
    ROUND(((COALESCE(SUM(yr.year_2023), 0) - COALESCE(SUM(attr.churn_2024), 0)) / COALESCE(SUM(yr.year_2023), 0)) * 100, 1)
  ELSE 0 END as grr_percent,
  CASE WHEN COALESCE(SUM(yr.year_2023), 0) > 0 THEN
    ROUND((COALESCE(SUM(yr.year_2024), 0) / COALESCE(SUM(yr.year_2023), 0)) * 100, 1)
  ELSE 0 END as nrr_percent,
  CASE WHEN COALESCE(SUM(yr.year_2024), 0) > COALESCE(SUM(yr.year_2023), 0) THEN
    COALESCE(SUM(yr.year_2024), 0) - COALESCE(SUM(yr.year_2023), 0)
  ELSE 0 END as expansion_revenue
FROM yearly_revenue yr
LEFT JOIN attrition_by_year attr ON yr.customer_name = attr.client_name
WHERE yr.revenue_type = 'Total Revenue'
UNION ALL
SELECT 2025 as year,
  COALESCE(SUM(yr.year_2024), 0), COALESCE(SUM(yr.year_2025), 0), COALESCE(SUM(attr.churn_2025), 0),
  CASE WHEN COALESCE(SUM(yr.year_2024), 0) > 0 THEN
    ROUND(((COALESCE(SUM(yr.year_2024), 0) - COALESCE(SUM(attr.churn_2025), 0)) / COALESCE(SUM(yr.year_2024), 0)) * 100, 1)
  ELSE 0 END,
  CASE WHEN COALESCE(SUM(yr.year_2024), 0) > 0 THEN
    ROUND((COALESCE(SUM(yr.year_2025), 0) / COALESCE(SUM(yr.year_2024), 0)) * 100, 1)
  ELSE 0 END,
  CASE WHEN COALESCE(SUM(yr.year_2025), 0) > COALESCE(SUM(yr.year_2024), 0) THEN
    COALESCE(SUM(yr.year_2025), 0) - COALESCE(SUM(yr.year_2024), 0)
  ELSE 0 END
FROM yearly_revenue yr
LEFT JOIN attrition_by_year attr ON yr.customer_name = attr.client_name
WHERE yr.revenue_type = 'Total Revenue'
UNION ALL
SELECT 2026 as year,
  COALESCE(SUM(yr.year_2025), 0), COALESCE(SUM(yr.year_2026), 0), COALESCE(SUM(attr.churn_2026), 0),
  CASE WHEN COALESCE(SUM(yr.year_2025), 0) > 0 THEN
    ROUND(((COALESCE(SUM(yr.year_2025), 0) - COALESCE(SUM(attr.churn_2026), 0)) / COALESCE(SUM(yr.year_2025), 0)) * 100, 1)
  ELSE 0 END,
  CASE WHEN COALESCE(SUM(yr.year_2025), 0) > 0 THEN
    ROUND((COALESCE(SUM(yr.year_2026), 0) / COALESCE(SUM(yr.year_2025), 0)) * 100, 1)
  ELSE 0 END,
  CASE WHEN COALESCE(SUM(yr.year_2026), 0) > COALESCE(SUM(yr.year_2025), 0) THEN
    COALESCE(SUM(yr.year_2026), 0) - COALESCE(SUM(yr.year_2025), 0)
  ELSE 0 END
FROM yearly_revenue yr
LEFT JOIN attrition_by_year attr ON yr.customer_name = attr.client_name
WHERE yr.revenue_type = 'Total Revenue'
`
  },
  {
    name: 'burc_rule_of_40',
    sql: `
CREATE OR REPLACE VIEW burc_rule_of_40 AS
WITH revenue_growth AS (
  SELECT 2024 as year, SUM(year_2023) as prev_revenue, SUM(year_2024) as curr_revenue,
    CASE WHEN SUM(year_2023) > 0 THEN ROUND(((SUM(year_2024) - SUM(year_2023)) / SUM(year_2023)) * 100, 1) ELSE 0 END as growth_percent
  FROM burc_historical_revenue WHERE revenue_type = 'Total Revenue'
  UNION ALL
  SELECT 2025, SUM(year_2024), SUM(year_2025),
    CASE WHEN SUM(year_2024) > 0 THEN ROUND(((SUM(year_2025) - SUM(year_2024)) / SUM(year_2024)) * 100, 1) ELSE 0 END
  FROM burc_historical_revenue WHERE revenue_type = 'Total Revenue'
  UNION ALL
  SELECT 2026, SUM(year_2025), SUM(year_2026),
    CASE WHEN SUM(year_2025) > 0 THEN ROUND(((SUM(year_2026) - SUM(year_2025)) / SUM(year_2025)) * 100, 1) ELSE 0 END
  FROM burc_historical_revenue WHERE revenue_type = 'Total Revenue'
)
SELECT year, prev_revenue, curr_revenue, growth_percent as revenue_growth_percent,
  15.0 as ebita_margin_percent, growth_percent + 15.0 as rule_of_40_score,
  CASE WHEN growth_percent + 15.0 >= 40 THEN 'Passing'
       WHEN growth_percent + 15.0 >= 30 THEN 'At Risk'
       ELSE 'Below Target' END as rule_of_40_status
FROM revenue_growth
`
  },
  {
    name: 'burc_arr_performance',
    sql: `
CREATE OR REPLACE VIEW burc_arr_performance AS
SELECT client_name, cse_owner, arr_usd, target_pipeline_percent, target_pipeline_value,
  actual_bookings, variance, year, quarter, snapshot_date,
  CASE WHEN target_pipeline_value > 0 THEN ROUND((actual_bookings / target_pipeline_value) * 100, 1) ELSE 0 END as achievement_percent,
  CASE WHEN variance >= 0 THEN 'On Track'
       WHEN variance >= -target_pipeline_value * 0.1 THEN 'At Risk'
       ELSE 'Behind' END as status
FROM burc_arr_tracking
WHERE year = EXTRACT(YEAR FROM CURRENT_DATE)
`
  },
  {
    name: 'burc_attrition_summary',
    sql: `
CREATE OR REPLACE VIEW burc_attrition_summary AS
SELECT status, COUNT(*) as risk_count,
  SUM(revenue_2024) as total_at_risk_2024,
  SUM(revenue_2025) as total_at_risk_2025,
  SUM(revenue_2026) as total_at_risk_2026,
  SUM(total_at_risk) as total_at_risk_all_years,
  STRING_AGG(DISTINCT client_name, ', ') as affected_clients
FROM burc_attrition_risk
GROUP BY status
`
  },
  {
    name: 'burc_renewal_calendar',
    sql: `
CREATE OR REPLACE VIEW burc_renewal_calendar AS
SELECT EXTRACT(YEAR FROM renewal_date) as renewal_year,
  EXTRACT(MONTH FROM renewal_date) as renewal_month,
  TO_CHAR(renewal_date, 'Mon YYYY') as renewal_period,
  COUNT(*) as contract_count,
  SUM(annual_value_usd) as total_value_usd,
  SUM(annual_value_aud) as total_value_aud,
  STRING_AGG(client_name, ', ') as clients
FROM burc_contracts
WHERE renewal_date IS NOT NULL AND renewal_date >= CURRENT_DATE
GROUP BY EXTRACT(YEAR FROM renewal_date), EXTRACT(MONTH FROM renewal_date), TO_CHAR(renewal_date, 'Mon YYYY')
ORDER BY renewal_year, renewal_month
`
  },
  {
    name: 'burc_pipeline_by_stage',
    sql: `
CREATE OR REPLACE VIEW burc_pipeline_by_stage AS
SELECT forecast_category, stage, COUNT(*) as opportunity_count,
  SUM(estimated_sw_value + estimated_ps_value + estimated_maint_value + estimated_hw_value) as total_value,
  SUM((estimated_sw_value + estimated_ps_value + estimated_maint_value + estimated_hw_value) * probability) as weighted_value,
  AVG(probability) as avg_probability,
  STRING_AGG(DISTINCT client_name, ', ') as clients
FROM burc_business_cases
WHERE stage = 'active'
GROUP BY forecast_category, stage
ORDER BY weighted_value DESC
`
  },
  {
    name: 'burc_executive_summary',
    sql: `
CREATE OR REPLACE VIEW burc_executive_summary AS
WITH latest_retention AS (
  SELECT nrr_percent, grr_percent, churn, expansion_revenue FROM burc_revenue_retention WHERE year = 2025
),
latest_rule40 AS (
  SELECT revenue_growth_percent, ebita_margin_percent, rule_of_40_score, rule_of_40_status FROM burc_rule_of_40 WHERE year = 2025
),
total_arr AS (
  SELECT COALESCE(SUM(arr_usd), 0) as total_arr FROM burc_arr_tracking WHERE year = 2025
),
total_contracts AS (
  SELECT COUNT(*) as active_contracts, COALESCE(SUM(annual_value_usd), 0) as total_contract_value
  FROM burc_contracts WHERE contract_status = 'active'
),
pipeline_summary AS (
  SELECT COALESCE(SUM(estimated_sw_value + estimated_ps_value + estimated_maint_value + estimated_hw_value), 0) as total_pipeline,
    COALESCE(SUM((estimated_sw_value + estimated_ps_value + estimated_maint_value + estimated_hw_value) * probability), 0) as weighted_pipeline
  FROM burc_business_cases WHERE stage = 'active'
),
attrition_summary AS (
  SELECT COALESCE(SUM(total_at_risk), 0) as total_at_risk, COUNT(*) as risk_count
  FROM burc_attrition_risk WHERE status = 'open'
)
SELECT CURRENT_DATE as snapshot_date,
  COALESCE(lr.nrr_percent, 0) as nrr_percent,
  COALESCE(lr.grr_percent, 0) as grr_percent,
  COALESCE(lr.churn, 0) as annual_churn,
  COALESCE(lr.expansion_revenue, 0) as expansion_revenue,
  COALESCE(lrf.revenue_growth_percent, 0) as revenue_growth_percent,
  COALESCE(lrf.ebita_margin_percent, 15) as ebita_margin_percent,
  COALESCE(lrf.rule_of_40_score, 0) as rule_of_40_score,
  COALESCE(lrf.rule_of_40_status, 'Unknown') as rule_of_40_status,
  ta.total_arr,
  tc.active_contracts,
  tc.total_contract_value,
  ps.total_pipeline,
  ps.weighted_pipeline,
  ats.total_at_risk,
  ats.risk_count as attrition_risk_count,
  CASE WHEN COALESCE(lr.nrr_percent, 0) >= 110 THEN 'Excellent'
       WHEN COALESCE(lr.nrr_percent, 0) >= 100 THEN 'Good'
       WHEN COALESCE(lr.nrr_percent, 0) >= 90 THEN 'At Risk'
       ELSE 'Critical' END as nrr_health,
  CASE WHEN COALESCE(lr.grr_percent, 0) >= 95 THEN 'Excellent'
       WHEN COALESCE(lr.grr_percent, 0) >= 90 THEN 'Good'
       WHEN COALESCE(lr.grr_percent, 0) >= 85 THEN 'At Risk'
       ELSE 'Critical' END as grr_health
FROM (SELECT 1) as dummy
LEFT JOIN latest_retention lr ON true
LEFT JOIN latest_rule40 lrf ON true
CROSS JOIN total_arr ta
CROSS JOIN total_contracts tc
CROSS JOIN pipeline_summary ps
CROSS JOIN attrition_summary ats
`
  }
]

async function applyKPIMigration() {
  console.log('🚀 Applying BURC KPI Calculations Migration...\n')

  let successCount = 0
  let errorCount = 0

  for (const view of views) {
    try {
      // Use REST API to execute SQL
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        },
        body: JSON.stringify({ sql_query: view.sql })
      })

      if (response.ok) {
        console.log(`✅ ${view.name}`)
        successCount++
      } else {
        const text = await response.text()
        if (text.includes('already exists') || response.status === 409) {
          console.log(`✅ ${view.name} (already exists)`)
          successCount++
        } else {
          console.log(`⚠️ ${view.name}: ${text.substring(0, 60)}...`)
          errorCount++
        }
      }
    } catch (err) {
      console.log(`⚠️ ${view.name}: ${err.message}`)
      errorCount++
    }
  }

  console.log(`\n📊 Migration Summary:`)
  console.log(`   ✅ Successful: ${successCount}`)
  console.log(`   ⚠️ Errors: ${errorCount}`)

  if (errorCount > 0) {
    console.log(`\n💡 If views failed, run the SQL directly in Supabase SQL Editor:`)
    console.log(`   docs/migrations/20260102_burc_kpi_calculations.sql`)
  }

  // Verify views by querying them
  console.log('\n🔍 Verifying views...')
  for (const view of views) {
    try {
      const { data, error } = await supabase.from(view.name).select('*').limit(1)
      if (error) {
        console.log(`   ❌ ${view.name}: ${error.message.substring(0, 40)}`)
      } else {
        console.log(`   ✅ ${view.name}: Ready (${data?.length || 0} rows)`)
      }
    } catch (err) {
      console.log(`   ❌ ${view.name}: ${err.message.substring(0, 40)}`)
    }
  }

  console.log('\n✨ KPI Migration complete!')
}

applyKPIMigration().catch(console.error)
