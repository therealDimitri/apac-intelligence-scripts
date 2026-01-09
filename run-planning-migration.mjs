#!/usr/bin/env node
/**
 * Run Planning Hub Migration
 * Executes the planning hub enhancements migration directly via Supabase
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load .env.local explicitly
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://usoyxsunetvxdjdglkmn.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'sb_secret_tg9qhHtwhKS0rPe_FUgzKA_nOyqLAas'

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false }
})

// SQL statements to execute (split by major sections)
const sqlStatements = [
  // PART 1: AI & Insights Tables
  `CREATE TABLE IF NOT EXISTS account_plan_ai_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID,
    client_name TEXT NOT NULL,
    insight_type TEXT NOT NULL,
    insight_category TEXT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    confidence_score DECIMAL(3,2),
    priority TEXT,
    impact_score INTEGER,
    data_sources JSONB,
    recommended_actions JSONB,
    is_dismissed BOOLEAN DEFAULT FALSE,
    dismissed_by TEXT,
    dismissed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS next_best_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID,
    client_name TEXT NOT NULL,
    cse_name TEXT,
    cam_name TEXT,
    action_type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    priority_score DECIMAL(5,2),
    impact_category TEXT,
    estimated_impact INTEGER,
    urgency_level TEXT,
    trigger_reason TEXT,
    trigger_data JSONB,
    status TEXT DEFAULT 'pending',
    accepted_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    dismissed_at TIMESTAMPTZ,
    dismissed_reason TEXT,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // PART 2: Stakeholder Tables
  `CREATE TABLE IF NOT EXISTS stakeholder_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID,
    client_id UUID,
    client_name TEXT NOT NULL,
    stakeholder_name TEXT NOT NULL,
    stakeholder_email TEXT,
    stakeholder_title TEXT,
    stakeholder_role TEXT,
    meddpicc_role TEXT,
    department TEXT,
    reports_to UUID,
    influence_level INTEGER,
    engagement_score INTEGER,
    sentiment TEXT,
    last_interaction_date DATE,
    interaction_count INTEGER DEFAULT 0,
    relationship_strength TEXT,
    notes TEXT,
    is_primary_contact BOOLEAN DEFAULT FALSE,
    is_decision_maker BOOLEAN DEFAULT FALSE,
    auto_detected BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS stakeholder_influences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_stakeholder_id UUID REFERENCES stakeholder_relationships(id) ON DELETE CASCADE,
    to_stakeholder_id UUID REFERENCES stakeholder_relationships(id) ON DELETE CASCADE,
    influence_type TEXT,
    influence_strength INTEGER,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // PART 3: Predictive & Analytics Tables
  `CREATE TABLE IF NOT EXISTS predictive_health_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID,
    client_name TEXT NOT NULL,
    calculation_date DATE NOT NULL,
    current_health_score INTEGER,
    predicted_health_30d INTEGER,
    predicted_health_90d INTEGER,
    churn_risk_score DECIMAL(5,2),
    expansion_probability DECIMAL(5,2),
    engagement_velocity DECIMAL(5,2),
    risk_factors JSONB,
    opportunity_signals JSONB,
    model_version TEXT,
    confidence_score DECIMAL(3,2),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS meddpicc_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID,
    plan_type TEXT,
    client_id UUID,
    client_name TEXT,
    opportunity_name TEXT,
    metrics_score INTEGER,
    metrics_evidence TEXT,
    metrics_ai_detected JSONB,
    economic_buyer_score INTEGER,
    economic_buyer_evidence TEXT,
    economic_buyer_ai_detected JSONB,
    decision_criteria_score INTEGER,
    decision_criteria_evidence TEXT,
    decision_criteria_ai_detected JSONB,
    decision_process_score INTEGER,
    decision_process_evidence TEXT,
    decision_process_ai_detected JSONB,
    paper_process_score INTEGER,
    paper_process_evidence TEXT,
    paper_process_ai_detected JSONB,
    identify_pain_score INTEGER,
    identify_pain_evidence TEXT,
    identify_pain_ai_detected JSONB,
    champion_score INTEGER,
    champion_evidence TEXT,
    champion_ai_detected JSONB,
    competition_score INTEGER,
    competition_evidence TEXT,
    competition_ai_detected JSONB,
    overall_score INTEGER,
    gap_analysis JSONB,
    recommended_actions JSONB,
    last_ai_analysis TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS engagement_timeline (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID,
    client_name TEXT NOT NULL,
    event_type TEXT NOT NULL,
    event_date TIMESTAMPTZ NOT NULL,
    event_title TEXT,
    event_summary TEXT,
    sentiment TEXT,
    participants JSONB,
    key_topics JSONB,
    outcomes JSONB,
    source_id UUID,
    source_table TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // PART 4: Segmentation Integration Tables
  `CREATE TABLE IF NOT EXISTS account_plan_event_requirements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID,
    client_id UUID,
    client_name TEXT NOT NULL,
    segment TEXT NOT NULL,
    fiscal_year INTEGER NOT NULL,
    event_type_id UUID,
    event_type_name TEXT NOT NULL,
    required_count INTEGER NOT NULL,
    completed_count INTEGER DEFAULT 0,
    scheduled_count INTEGER DEFAULT 0,
    compliance_percentage DECIMAL(5,2),
    status TEXT,
    next_due_date DATE,
    ai_recommended_dates JSONB,
    linked_event_ids JSONB,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS territory_compliance_summary (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    territory_strategy_id UUID,
    territory TEXT NOT NULL,
    cse_name TEXT NOT NULL,
    fiscal_year INTEGER NOT NULL,
    total_clients INTEGER,
    total_required_events INTEGER,
    total_completed_events INTEGER,
    overall_compliance_percentage DECIMAL(5,2),
    clients_at_risk INTEGER,
    clients_critical INTEGER,
    segment_breakdown JSONB,
    monthly_capacity JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // PART 5: BURC Integration Tables
  `CREATE TABLE IF NOT EXISTS account_plan_financials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID,
    client_id UUID,
    client_name TEXT NOT NULL,
    fiscal_year INTEGER NOT NULL,
    current_arr DECIMAL(15,2),
    current_mrr DECIMAL(15,2),
    revenue_software DECIMAL(15,2),
    revenue_ps DECIMAL(15,2),
    revenue_maintenance DECIMAL(15,2),
    revenue_hardware DECIMAL(15,2),
    target_arr DECIMAL(15,2),
    target_growth_percentage DECIMAL(5,2),
    expansion_pipeline DECIMAL(15,2),
    expansion_pipeline_weighted DECIMAL(15,2),
    nrr_3year DECIMAL(5,2),
    grr_3year DECIMAL(5,2),
    lifetime_value DECIMAL(15,2),
    tenure_years DECIMAL(5,2),
    ar_balance DECIMAL(15,2),
    ar_overdue DECIMAL(15,2),
    dso_days INTEGER,
    collection_risk TEXT,
    renewal_date DATE,
    renewal_value DECIMAL(15,2),
    renewal_risk TEXT,
    territory_percentage DECIMAL(5,2),
    bu_percentage DECIMAL(5,2),
    apac_percentage DECIMAL(5,2),
    burc_sync_date TIMESTAMPTZ,
    data_source TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS territory_strategy_financials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    territory_strategy_id UUID,
    territory TEXT NOT NULL,
    cse_name TEXT NOT NULL,
    fiscal_year INTEGER NOT NULL,
    total_arr DECIMAL(15,2),
    target_arr DECIMAL(15,2),
    gap_to_target DECIMAL(15,2),
    yoy_growth_percentage DECIMAL(5,2),
    revenue_runrate DECIMAL(15,2),
    revenue_business_cases DECIMAL(15,2),
    revenue_pipeline_weighted DECIMAL(15,2),
    portfolio_nrr DECIMAL(5,2),
    portfolio_grr DECIMAL(5,2),
    q1_target DECIMAL(15,2),
    q1_actual DECIMAL(15,2),
    q2_target DECIMAL(15,2),
    q2_actual DECIMAL(15,2),
    q3_target DECIMAL(15,2),
    q3_actual DECIMAL(15,2),
    q4_target DECIMAL(15,2),
    q4_actual DECIMAL(15,2),
    client_count INTEGER,
    top_10_arr DECIMAL(15,2),
    top_10_percentage DECIMAL(5,2),
    concentration_risk TEXT,
    bu_name TEXT,
    bu_contribution_percentage DECIMAL(5,2),
    renewal_q1_value DECIMAL(15,2),
    renewal_q1_secured DECIMAL(15,2),
    renewal_q2_value DECIMAL(15,2),
    renewal_q2_secured DECIMAL(15,2),
    renewal_q3_value DECIMAL(15,2),
    renewal_q3_secured DECIMAL(15,2),
    renewal_q4_value DECIMAL(15,2),
    renewal_q4_secured DECIMAL(15,2),
    burc_sync_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // PART 6: Business Unit & APAC Tables
  `CREATE TABLE IF NOT EXISTS business_unit_planning (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bu_name TEXT NOT NULL,
    fiscal_year INTEGER NOT NULL,
    target_arr DECIMAL(15,2),
    current_arr DECIMAL(15,2),
    gap_to_target DECIMAL(15,2),
    apac_contribution_percentage DECIMAL(5,2),
    territory_count INTEGER,
    territory_data JSONB,
    nrr DECIMAL(5,2),
    grr DECIMAL(5,2),
    ebita_margin DECIMAL(5,2),
    rule_of_40 DECIMAL(5,2),
    segment_distribution JSONB,
    total_plans_required INTEGER,
    total_plans_approved INTEGER,
    planning_coverage_percentage DECIMAL(5,2),
    overall_compliance_percentage DECIMAL(5,2),
    clients_below_compliance INTEGER,
    avg_health_score INTEGER,
    accounts_at_risk INTEGER,
    at_risk_arr DECIMAL(15,2),
    expansion_pipeline DECIMAL(15,2),
    expansion_weighted DECIMAL(15,2),
    new_logo_pipeline DECIMAL(15,2),
    churn_at_risk DECIMAL(15,2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(bu_name, fiscal_year)
  )`,

  `CREATE TABLE IF NOT EXISTS apac_planning_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fiscal_year INTEGER NOT NULL UNIQUE,
    target_revenue DECIMAL(15,2),
    current_revenue DECIMAL(15,2),
    gap DECIMAL(15,2),
    growth_target_percentage DECIMAL(5,2),
    growth_actual_percentage DECIMAL(5,2),
    bu_contributions JSONB,
    target_nrr DECIMAL(5,2),
    actual_nrr DECIMAL(5,2),
    target_grr DECIMAL(5,2),
    actual_grr DECIMAL(5,2),
    target_ebita_margin DECIMAL(5,2),
    actual_ebita_margin DECIMAL(5,2),
    target_rule_of_40 DECIMAL(5,2),
    actual_rule_of_40 DECIMAL(5,2),
    target_health_score INTEGER,
    actual_health_score INTEGER,
    target_compliance DECIMAL(5,2),
    actual_compliance DECIMAL(5,2),
    expansion_pipeline DECIMAL(15,2),
    expansion_weighted DECIMAL(15,2),
    new_logo_pipeline DECIMAL(15,2),
    new_logo_weighted DECIMAL(15,2),
    churn_prevention_target DECIMAL(15,2),
    total_coverage_percentage DECIMAL(5,2),
    high_churn_risk_accounts INTEGER,
    high_churn_risk_arr DECIMAL(15,2),
    declining_health_accounts INTEGER,
    declining_health_arr DECIMAL(15,2),
    below_compliance_accounts INTEGER,
    below_compliance_arr DECIMAL(15,2),
    total_account_plans_required INTEGER,
    total_account_plans_approved INTEGER,
    total_territory_strategies_required INTEGER,
    total_territory_strategies_approved INTEGER,
    planning_deadline DATE,
    days_to_deadline INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`
]

// Index statements
const indexStatements = [
  `CREATE INDEX IF NOT EXISTS idx_insights_client ON account_plan_ai_insights(client_id, insight_type)`,
  `CREATE INDEX IF NOT EXISTS idx_nba_cse ON next_best_actions(cse_name, status)`,
  `CREATE INDEX IF NOT EXISTS idx_nba_client ON next_best_actions(client_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_stakeholders_client ON stakeholder_relationships(client_id)`,
  `CREATE INDEX IF NOT EXISTS idx_predictive_client ON predictive_health_scores(client_id, calculation_date DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_meddpicc_client ON meddpicc_scores(client_id)`,
  `CREATE INDEX IF NOT EXISTS idx_timeline_client ON engagement_timeline(client_id, event_date DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_plan_events_client ON account_plan_event_requirements(client_id, fiscal_year)`,
  `CREATE INDEX IF NOT EXISTS idx_territory_compliance ON territory_compliance_summary(territory, fiscal_year)`,
  `CREATE INDEX IF NOT EXISTS idx_plan_financials_client ON account_plan_financials(client_id, fiscal_year)`,
  `CREATE INDEX IF NOT EXISTS idx_territory_financials_territory ON territory_strategy_financials(territory, fiscal_year)`,
  `CREATE INDEX IF NOT EXISTS idx_bu_planning_year ON business_unit_planning(fiscal_year)`,
  `CREATE INDEX IF NOT EXISTS idx_apac_goals_year ON apac_planning_goals(fiscal_year)`
]

// RLS and policy statements
const rlsStatements = [
  `ALTER TABLE account_plan_ai_insights ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE next_best_actions ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE stakeholder_relationships ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE stakeholder_influences ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE predictive_health_scores ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE meddpicc_scores ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE engagement_timeline ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE account_plan_event_requirements ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE territory_compliance_summary ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE account_plan_financials ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE territory_strategy_financials ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE business_unit_planning ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE apac_planning_goals ENABLE ROW LEVEL SECURITY`
]

// Seed data
const seedStatements = [
  `INSERT INTO apac_planning_goals (
    fiscal_year, target_revenue, current_revenue, gap,
    growth_target_percentage, target_nrr, target_grr,
    target_ebita_margin, target_rule_of_40,
    target_health_score, target_compliance, planning_deadline
  ) VALUES (
    2026, 52000000, 48200000, 3800000, 7.9,
    105, 95, 18, 26, 75, 90, '2026-01-17'
  ) ON CONFLICT (fiscal_year) DO NOTHING`,

  `INSERT INTO business_unit_planning (bu_name, fiscal_year, target_arr, current_arr, gap_to_target, apac_contribution_percentage)
   VALUES ('ANZ', 2026, 31000000, 28400000, 2600000, 59.6)
   ON CONFLICT (bu_name, fiscal_year) DO NOTHING`,

  `INSERT INTO business_unit_planning (bu_name, fiscal_year, target_arr, current_arr, gap_to_target, apac_contribution_percentage)
   VALUES ('SEA', 2026, 13000000, 12100000, 900000, 25.0)
   ON CONFLICT (bu_name, fiscal_year) DO NOTHING`,

  `INSERT INTO business_unit_planning (bu_name, fiscal_year, target_arr, current_arr, gap_to_target, apac_contribution_percentage)
   VALUES ('Greater China', 2026, 8000000, 7700000, 300000, 15.4)
   ON CONFLICT (bu_name, fiscal_year) DO NOTHING`
]

async function runMigration() {
  console.log('🚀 Starting Planning Hub Migration...\n')

  // Execute table creation
  console.log('📦 Creating tables...')
  for (let i = 0; i < sqlStatements.length; i++) {
    const sql = sqlStatements[i]
    const tableName = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/)?.[1] || `statement_${i}`

    try {
      const { error } = await supabase.rpc('exec_sql', { sql_query: sql })
      if (error) {
        // Try direct query if RPC doesn't exist
        const { error: directError } = await supabase.from('_migrations').select('*').limit(0)
        if (directError?.message?.includes('does not exist')) {
          // Fall back to REST API
          console.log(`  ⚠️  ${tableName}: Using alternative method...`)
        }
        throw error
      }
      console.log(`  ✅ ${tableName}`)
    } catch (err) {
      // Table might already exist
      if (err.message?.includes('already exists')) {
        console.log(`  ⏭️  ${tableName}: Already exists`)
      } else {
        console.log(`  ❌ ${tableName}: ${err.message}`)
      }
    }
  }

  // Execute index creation
  console.log('\n📇 Creating indexes...')
  for (const sql of indexStatements) {
    const indexName = sql.match(/CREATE INDEX IF NOT EXISTS (\w+)/)?.[1] || 'index'
    try {
      await supabase.rpc('exec_sql', { sql_query: sql })
      console.log(`  ✅ ${indexName}`)
    } catch (err) {
      console.log(`  ⏭️  ${indexName}: ${err.message?.substring(0, 50)}...`)
    }
  }

  // Execute RLS statements
  console.log('\n🔐 Enabling RLS...')
  for (const sql of rlsStatements) {
    const tableName = sql.match(/ALTER TABLE (\w+)/)?.[1] || 'table'
    try {
      await supabase.rpc('exec_sql', { sql_query: sql })
      console.log(`  ✅ ${tableName}`)
    } catch (err) {
      console.log(`  ⏭️  ${tableName}: Already enabled`)
    }
  }

  // Execute seed data
  console.log('\n🌱 Seeding initial data...')
  for (const sql of seedStatements) {
    try {
      await supabase.rpc('exec_sql', { sql_query: sql })
      console.log(`  ✅ Seed data inserted`)
    } catch (err) {
      console.log(`  ⏭️  Seed: ${err.message?.substring(0, 50)}...`)
    }
  }

  console.log('\n✨ Migration complete!')
}

// Alternative: Direct table operations
async function runMigrationDirect() {
  console.log('🚀 Starting Planning Hub Migration (Direct Mode)...\n')

  const tables = [
    'account_plan_ai_insights',
    'next_best_actions',
    'stakeholder_relationships',
    'stakeholder_influences',
    'predictive_health_scores',
    'meddpicc_scores',
    'engagement_timeline',
    'account_plan_event_requirements',
    'territory_compliance_summary',
    'account_plan_financials',
    'territory_strategy_financials',
    'business_unit_planning',
    'apac_planning_goals'
  ]

  // Check which tables exist
  console.log('📋 Checking existing tables...')
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('id').limit(1)
    if (error?.message?.includes('does not exist')) {
      console.log(`  ❌ ${table}: Does not exist (needs SQL migration)`)
    } else {
      console.log(`  ✅ ${table}: Exists`)
    }
  }

  // Insert seed data directly
  console.log('\n🌱 Inserting seed data...')

  // APAC Goals
  const { error: apacError } = await supabase
    .from('apac_planning_goals')
    .upsert({
      fiscal_year: 2026,
      target_revenue: 52000000,
      current_revenue: 48200000,
      gap: 3800000,
      growth_target_percentage: 7.9,
      target_nrr: 105,
      target_grr: 95,
      target_ebita_margin: 18,
      target_rule_of_40: 26,
      target_health_score: 75,
      target_compliance: 90,
      planning_deadline: '2026-01-17'
    }, { onConflict: 'fiscal_year' })

  if (apacError) {
    console.log(`  ❌ APAC Goals: ${apacError.message}`)
  } else {
    console.log('  ✅ APAC Goals FY26 seeded')
  }

  // BU Planning
  const buData = [
    { bu_name: 'ANZ', fiscal_year: 2026, target_arr: 31000000, current_arr: 28400000, gap_to_target: 2600000, apac_contribution_percentage: 59.6 },
    { bu_name: 'SEA', fiscal_year: 2026, target_arr: 13000000, current_arr: 12100000, gap_to_target: 900000, apac_contribution_percentage: 25.0 },
    { bu_name: 'Greater China', fiscal_year: 2026, target_arr: 8000000, current_arr: 7700000, gap_to_target: 300000, apac_contribution_percentage: 15.4 }
  ]

  for (const bu of buData) {
    const { error } = await supabase
      .from('business_unit_planning')
      .upsert(bu, { onConflict: 'bu_name,fiscal_year' })

    if (error) {
      console.log(`  ❌ ${bu.bu_name}: ${error.message}`)
    } else {
      console.log(`  ✅ ${bu.bu_name} FY26 seeded`)
    }
  }

  console.log('\n✨ Direct migration complete!')
}

// Run the migration
runMigrationDirect().catch(console.error)
