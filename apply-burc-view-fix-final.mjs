#!/usr/bin/env node
/**
 * Apply BURC Revenue View Fix Migration
 * Uses exec_sql_query function if available, otherwise creates it
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

console.log(`📦 Project: ${supabaseUrl.match(/https:\/\/([^.]+)/)?.[1]}`)

async function executeSql(sql) {
  // Try with sql_query parameter first
  let response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql_query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseServiceKey,
      'Authorization': `Bearer ${supabaseServiceKey}`,
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({ sql_query: sql })
  })

  if (response.ok) {
    return response.json()
  }

  // Try with sql parameter
  response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseServiceKey,
      'Authorization': `Bearer ${supabaseServiceKey}`,
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({ sql_query: sql })
  })

  if (response.ok) {
    return response.json()
  }

  const text = await response.text()
  throw new Error(`SQL execution failed: ${text}`)
}

async function applyMigration() {
  console.log('🚀 Applying BURC Revenue View Fix Migration...\n')

  // First, let's create the exec_sql_query function if it doesn't exist
  // We can only do this via direct Supabase connection, so let's try another approach

  // Alternative: Use pg-promise or pg directly
  // But first let's see if we can use edge functions or any other method

  // Check what functions are available
  const functionsResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/`, {
    method: 'GET',
    headers: {
      'apikey': supabaseServiceKey,
      'Authorization': `Bearer ${supabaseServiceKey}`
    }
  })

  console.log('Available functions endpoint status:', functionsResponse.status)

  // Let's try using a different approach - import the pg package and connect directly
  const { default: pg } = await import('pg')

  // Use the direct database URL from env
  const directUrl = env.DATABASE_URL_DIRECT

  if (!directUrl) {
    console.error('❌ DATABASE_URL_DIRECT not found in .env.local')
    process.exit(1)
  }

  console.log('Attempting direct database connection...')

  const client = new pg.Client({
    connectionString: directUrl,
    ssl: { rejectUnauthorized: false }
  })

  try {
    await client.connect()
    console.log('✅ Connected to database\n')

    // Execute migration statements
    const statements = [
      'DROP VIEW IF EXISTS burc_executive_summary CASCADE',
      'DROP VIEW IF EXISTS burc_revenue_retention CASCADE',
      'DROP VIEW IF EXISTS burc_rule_of_40 CASCADE',
    ]

    for (const stmt of statements) {
      console.log(`Executing: ${stmt.substring(0, 50)}...`)
      try {
        await client.query(stmt)
        console.log('   ✅ Done')
      } catch (err) {
        console.log(`   ⚠️ ${err.message}`)
      }
    }

    // Create revenue retention view
    console.log('\nCreating burc_revenue_retention view...')
    await client.query(`
      CREATE OR REPLACE VIEW burc_revenue_retention AS
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
        COALESCE(SUM(yr.year_2024), 0),
        COALESCE(SUM(yr.year_2025), 0),
        COALESCE(SUM(attr.churn_2025), 0),
        CASE WHEN COALESCE(SUM(yr.year_2024), 0) > 0 THEN ROUND(((COALESCE(SUM(yr.year_2024), 0) - COALESCE(SUM(attr.churn_2025), 0)) / COALESCE(SUM(yr.year_2024), 0)) * 100, 1) ELSE 0 END,
        CASE WHEN COALESCE(SUM(yr.year_2024), 0) > 0 THEN ROUND((COALESCE(SUM(yr.year_2025), 0) / COALESCE(SUM(yr.year_2024), 0)) * 100, 1) ELSE 0 END,
        CASE WHEN COALESCE(SUM(yr.year_2025), 0) > COALESCE(SUM(yr.year_2024), 0) THEN COALESCE(SUM(yr.year_2025), 0) - COALESCE(SUM(yr.year_2024), 0) ELSE 0 END
      FROM yearly_revenue yr
      LEFT JOIN attrition_by_year attr ON yr.customer_name = attr.client_name
      UNION ALL
      SELECT
        2026 as year,
        COALESCE(SUM(yr.year_2025), 0),
        COALESCE(SUM(yr.year_2026), 0),
        COALESCE(SUM(attr.churn_2026), 0),
        CASE WHEN COALESCE(SUM(yr.year_2025), 0) > 0 THEN ROUND(((COALESCE(SUM(yr.year_2025), 0) - COALESCE(SUM(attr.churn_2026), 0)) / COALESCE(SUM(yr.year_2025), 0)) * 100, 1) ELSE 0 END,
        CASE WHEN COALESCE(SUM(yr.year_2025), 0) > 0 THEN ROUND((COALESCE(SUM(yr.year_2026), 0) / COALESCE(SUM(yr.year_2025), 0)) * 100, 1) ELSE 0 END,
        CASE WHEN COALESCE(SUM(yr.year_2026), 0) > COALESCE(SUM(yr.year_2025), 0) THEN COALESCE(SUM(yr.year_2026), 0) - COALESCE(SUM(yr.year_2025), 0) ELSE 0 END
      FROM yearly_revenue yr
      LEFT JOIN attrition_by_year attr ON yr.customer_name = attr.client_name
    `)
    console.log('✅ burc_revenue_retention created')

    // Create rule of 40 view
    console.log('Creating burc_rule_of_40 view...')
    await client.query(`
      CREATE OR REPLACE VIEW burc_rule_of_40 AS
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
      FROM revenue_growth rg
    `)
    console.log('✅ burc_rule_of_40 created')

    // Create executive summary view
    console.log('Creating burc_executive_summary view...')
    await client.query(`
      CREATE OR REPLACE VIEW burc_executive_summary AS
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
      CROSS JOIN attrition_summary ats
    `)
    console.log('✅ burc_executive_summary created')

    // Grant permissions
    console.log('\nGranting permissions...')
    await client.query('GRANT SELECT ON burc_revenue_retention TO authenticated')
    await client.query('GRANT SELECT ON burc_rule_of_40 TO authenticated')
    await client.query('GRANT SELECT ON burc_executive_summary TO authenticated')
    console.log('✅ Permissions granted')

    // Verify the results
    console.log('\n📊 Verifying results...\n')

    const retention = await client.query('SELECT * FROM burc_revenue_retention ORDER BY year')
    console.log('Revenue Retention:')
    retention.rows.forEach(r => {
      console.log(`   Year ${r.year}: NRR ${r.nrr_percent}% | GRR ${r.grr_percent}% | $${(r.starting_revenue/1000000).toFixed(2)}M → $${(r.ending_revenue/1000000).toFixed(2)}M`)
    })

    const rule40 = await client.query('SELECT * FROM burc_rule_of_40 ORDER BY year')
    console.log('\nRule of 40:')
    rule40.rows.forEach(r => {
      console.log(`   Year ${r.year}: Growth ${r.revenue_growth_percent}% + EBITA ${r.ebita_margin_percent}% = ${r.rule_of_40_score} (${r.rule_of_40_status})`)
    })

    await client.end()
    console.log('\n✅ Migration complete!')

  } catch (err) {
    console.error('❌ Database error:', err.message)
    try { await client.end() } catch (e) {}
    process.exit(1)
  }
}

applyMigration().catch(console.error)
