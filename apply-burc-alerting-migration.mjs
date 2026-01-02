#!/usr/bin/env node
/**
 * Apply BURC Alerting System Migration
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

const supabase = createClient(supabaseUrl, supabaseKey)

const migrations = [
  {
    name: 'burc_alert_config table',
    sql: `
CREATE TABLE IF NOT EXISTS burc_alert_config (
  id SERIAL PRIMARY KEY,
  metric_name TEXT NOT NULL UNIQUE,
  metric_category TEXT NOT NULL,
  description TEXT,
  warning_threshold DECIMAL(10,2),
  critical_threshold DECIMAL(10,2),
  threshold_direction TEXT DEFAULT 'below' CHECK (threshold_direction IN ('above', 'below')),
  is_enabled BOOLEAN DEFAULT true,
  notification_email TEXT[],
  notification_slack_channel TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)`
  },
  {
    name: 'burc_alerts table',
    sql: `
CREATE TABLE IF NOT EXISTS burc_alerts (
  id SERIAL PRIMARY KEY,
  alert_config_id INTEGER,
  metric_name TEXT NOT NULL,
  metric_category TEXT NOT NULL,
  current_value DECIMAL(14,2),
  threshold_value DECIMAL(14,2),
  severity TEXT NOT NULL CHECK (severity IN ('warning', 'critical')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'resolved')),
  message TEXT,
  details JSONB,
  triggered_at TIMESTAMPTZ DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT
)`
  },
  {
    name: 'burc_alert_history table',
    sql: `
CREATE TABLE IF NOT EXISTS burc_alert_history (
  id SERIAL PRIMARY KEY,
  alert_id INTEGER,
  metric_name TEXT NOT NULL,
  metric_category TEXT NOT NULL,
  current_value DECIMAL(14,2),
  threshold_value DECIMAL(14,2),
  severity TEXT NOT NULL,
  action TEXT NOT NULL,
  actor TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
)`
  }
]

const defaultConfigs = [
  { metric_name: 'nrr_percent', metric_category: 'retention', description: 'Net Revenue Retention percentage', warning_threshold: 100, critical_threshold: 90, threshold_direction: 'below' },
  { metric_name: 'grr_percent', metric_category: 'retention', description: 'Gross Revenue Retention percentage', warning_threshold: 92, critical_threshold: 85, threshold_direction: 'below' },
  { metric_name: 'rule_of_40_score', metric_category: 'growth', description: 'Rule of 40 (Growth + Margin)', warning_threshold: 35, critical_threshold: 25, threshold_direction: 'below' },
  { metric_name: 'revenue_growth_percent', metric_category: 'growth', description: 'Year-over-year revenue growth', warning_threshold: 5, critical_threshold: 0, threshold_direction: 'below' },
  { metric_name: 'total_at_risk', metric_category: 'attrition', description: 'Total revenue at risk of churn', warning_threshold: 1000000, critical_threshold: 2500000, threshold_direction: 'above' },
  { metric_name: 'attrition_risk_count', metric_category: 'attrition', description: 'Number of at-risk accounts', warning_threshold: 5, critical_threshold: 10, threshold_direction: 'above' },
  { metric_name: 'contracts_expiring_30_days', metric_category: 'contracts', description: 'Contracts expiring in 30 days', warning_threshold: 2, critical_threshold: 5, threshold_direction: 'above' },
  { metric_name: 'contracts_expiring_90_days', metric_category: 'contracts', description: 'Contracts expiring in 90 days', warning_threshold: 5, critical_threshold: 10, threshold_direction: 'above' },
  { metric_name: 'weighted_pipeline_coverage', metric_category: 'pipeline', description: 'Weighted pipeline vs quota coverage', warning_threshold: 2.5, critical_threshold: 1.5, threshold_direction: 'below' },
  { metric_name: 'arr_achievement_percent', metric_category: 'arr', description: 'ARR target achievement percentage', warning_threshold: 80, critical_threshold: 60, threshold_direction: 'below' }
]

const views = [
  {
    name: 'burc_alert_evaluation view',
    sql: `
CREATE OR REPLACE VIEW burc_alert_evaluation AS
WITH current_metrics AS (
  SELECT 'nrr_percent' as metric_name, 'retention' as metric_category, COALESCE(nrr_percent, 0) as current_value FROM burc_executive_summary
  UNION ALL SELECT 'grr_percent', 'retention', COALESCE(grr_percent, 0) FROM burc_executive_summary
  UNION ALL SELECT 'rule_of_40_score', 'growth', COALESCE(rule_of_40_score, 0) FROM burc_executive_summary
  UNION ALL SELECT 'total_at_risk', 'attrition', COALESCE(total_at_risk, 0) FROM burc_executive_summary
  UNION ALL SELECT 'attrition_risk_count', 'attrition', COALESCE(attrition_risk_count, 0) FROM burc_executive_summary
  UNION ALL SELECT 'contracts_expiring_30_days', 'contracts', (SELECT COUNT(*) FROM burc_contracts WHERE renewal_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days')
  UNION ALL SELECT 'contracts_expiring_90_days', 'contracts', (SELECT COUNT(*) FROM burc_contracts WHERE renewal_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days')
)
SELECT cm.metric_name, cm.metric_category, cm.current_value, ac.warning_threshold, ac.critical_threshold, ac.threshold_direction, ac.is_enabled, ac.description,
  CASE
    WHEN ac.threshold_direction = 'below' AND cm.current_value <= ac.critical_threshold THEN 'critical'
    WHEN ac.threshold_direction = 'below' AND cm.current_value <= ac.warning_threshold THEN 'warning'
    WHEN ac.threshold_direction = 'above' AND cm.current_value >= ac.critical_threshold THEN 'critical'
    WHEN ac.threshold_direction = 'above' AND cm.current_value >= ac.warning_threshold THEN 'warning'
    ELSE 'ok'
  END as severity,
  CASE
    WHEN ac.threshold_direction = 'below' AND cm.current_value <= ac.critical_threshold THEN ac.description || ' is critically low at ' || cm.current_value
    WHEN ac.threshold_direction = 'below' AND cm.current_value <= ac.warning_threshold THEN ac.description || ' is below target at ' || cm.current_value
    WHEN ac.threshold_direction = 'above' AND cm.current_value >= ac.critical_threshold THEN ac.description || ' is critically high at ' || cm.current_value
    WHEN ac.threshold_direction = 'above' AND cm.current_value >= ac.warning_threshold THEN ac.description || ' is above target at ' || cm.current_value
    ELSE ac.description || ' is within acceptable range at ' || cm.current_value
  END as message
FROM current_metrics cm
JOIN burc_alert_config ac ON cm.metric_name = ac.metric_name
WHERE ac.is_enabled = true`
  },
  {
    name: 'burc_active_alerts view',
    sql: `
CREATE OR REPLACE VIEW burc_active_alerts AS
SELECT metric_name, metric_category, current_value, warning_threshold, critical_threshold, severity, message,
  CASE WHEN severity = 'critical' THEN 1 WHEN severity = 'warning' THEN 2 ELSE 3 END as priority_order
FROM burc_alert_evaluation
WHERE severity IN ('warning', 'critical')
ORDER BY priority_order, metric_category`
  }
]

async function applyMigration() {
  console.log('🚀 Applying BURC Alerting System Migration...\n')

  // Create tables
  for (const m of migrations) {
    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        },
        body: JSON.stringify({ sql_query: m.sql })
      })
      console.log(response.ok ? `✅ ${m.name}` : `⚠️ ${m.name}: ${(await response.text()).substring(0, 50)}`)
    } catch (err) {
      console.log(`⚠️ ${m.name}: ${err.message}`)
    }
  }

  // Insert default configs
  console.log('\n📋 Inserting default alert configurations...')
  for (const config of defaultConfigs) {
    const { error } = await supabase.from('burc_alert_config').upsert(config, { onConflict: 'metric_name' })
    if (error) {
      console.log(`   ⚠️ ${config.metric_name}: ${error.message.substring(0, 40)}`)
    } else {
      console.log(`   ✅ ${config.metric_name}`)
    }
  }

  // Create views
  console.log('\n📊 Creating alert views...')
  for (const v of views) {
    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        },
        body: JSON.stringify({ sql_query: v.sql })
      })
      console.log(response.ok ? `   ✅ ${v.name}` : `   ⚠️ ${v.name}: ${(await response.text()).substring(0, 50)}`)
    } catch (err) {
      console.log(`   ⚠️ ${v.name}: ${err.message}`)
    }
  }

  // Verify and show active alerts
  console.log('\n🔍 Checking active alerts...')
  const { data: alerts, error } = await supabase.from('burc_active_alerts').select('*')
  if (error) {
    console.log(`   ❌ Could not retrieve alerts: ${error.message}`)
  } else if (alerts && alerts.length > 0) {
    console.log(`   Found ${alerts.length} active alerts:\n`)
    for (const a of alerts) {
      const icon = a.severity === 'critical' ? '🔴' : '🟡'
      console.log(`   ${icon} [${a.severity.toUpperCase()}] ${a.message}`)
    }
  } else {
    console.log('   ✅ No active alerts')
  }

  console.log('\n✨ Alerting system migration complete!')
}

applyMigration().catch(console.error)
