#!/usr/bin/env node
/**
 * Seed Financial Alerts from BURC Analysis
 * Creates alerts and actions directly from the 2026 BURC Excel file
 */

import pg from 'pg';
import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const { Client } = pg;

const BURC_PATH = '/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth(2)/APAC Leadership Team - Performance/Financials/BURC/2026/Budget Planning/2026 APAC Performance.xlsx';

async function seedFinancialData() {
  const databaseUrl = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL not found');
    process.exit(1);
  }

  console.log('📊 Loading BURC file and seeding financial data...');

  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    console.log('Connected');

    // Read BURC file
    const workbook = XLSX.readFile(BURC_PATH);

    // Ensure financial_actions table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS financial_actions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        action_type TEXT NOT NULL,
        team TEXT NOT NULL,
        client_name TEXT NOT NULL,
        alert_id UUID REFERENCES financial_alerts(id),
        title TEXT NOT NULL,
        description TEXT,
        revenue_at_stake DECIMAL(15,2),
        due_date DATE,
        urgency TEXT DEFAULT 'normal',
        status TEXT NOT NULL DEFAULT 'pending',
        assigned_to TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Add due_date column to financial_alerts if not exists
    await client.query(`
      ALTER TABLE financial_alerts
      ADD COLUMN IF NOT EXISTS due_date DATE;
    `);

    // Update alert_type check constraint to include confirmed_churn
    await client.query(`
      ALTER TABLE financial_alerts
      DROP CONSTRAINT IF EXISTS financial_alerts_alert_type_check;
    `);
    await client.query(`
      ALTER TABLE financial_alerts
      ADD CONSTRAINT financial_alerts_alert_type_check
      CHECK (alert_type IN ('attrition_risk', 'confirmed_churn', 'renewal_due', 'renewal_overdue', 'upsell_opportunity', 'cpi_opportunity', 'payment_overdue', 'target_at_risk', 'business_case_stale'));
    `);

    // Update action_type check constraint to include client_offboarding
    await client.query(`
      ALTER TABLE financial_actions
      DROP CONSTRAINT IF EXISTS financial_actions_action_type_check;
    `);
    await client.query(`
      ALTER TABLE financial_actions
      ADD CONSTRAINT financial_actions_action_type_check
      CHECK (action_type IN ('client_retention', 'client_offboarding', 'renewal_preparation', 'upsell_pursuit', 'business_case_advance', 'payment_followup', 'escalation'));
    `);

    // Clear existing data for re-seed
    await client.query('DELETE FROM financial_actions');
    await client.query('DELETE FROM financial_alerts');
    console.log('✅ Cleared existing data');

    const alerts = [];
    const actions = [];

    // 1. ATTRITION RISKS from Attrition sheet
    console.log('\n📋 Processing Attrition Risks...');
    const attrition = XLSX.utils.sheet_to_json(workbook.Sheets['Attrition'], { header: 1 });

    // NOTE: Parkway, SingHealth, and NC/MinDef iPro clients are confirmed churns - moved to off-boarding section
    const attritionRisks = [
      { client: 'GHA Regional Opal', type: 'Partial', revenue2026: 200000, totalAtRisk: 200000, reason: 'Regional consolidation risk' },
    ];

    for (const risk of attritionRisks) {
      const severity = risk.totalAtRisk > 500000 ? 'critical' : risk.totalAtRisk > 200000 ? 'high' : 'medium';
      const priorityScore = Math.min(100, Math.round(risk.totalAtRisk / 10000));

      alerts.push({
        alert_type: 'attrition_risk',
        severity,
        priority_score: priorityScore,
        client_name: risk.client,
        source_table: 'burc_attrition',
        title: `Attrition Risk: ${risk.client} ($${Math.round(risk.totalAtRisk/1000)}K)`,
        description: `${risk.type} attrition. ${risk.reason}. 2026 impact: $${Math.round(risk.revenue2026/1000)}K`,
        financial_impact: risk.totalAtRisk,
        recommended_actions: JSON.stringify([
          { action: 'Schedule executive sponsor meeting', team: 'leadership' },
          { action: 'Conduct relationship health assessment', team: 'client_success' },
          { action: 'Identify retention opportunities', team: 'sales' },
          { action: 'Prepare competitive analysis', team: 'sales' }
        ])
      });

      actions.push({
        action_type: 'client_retention',
        team: 'client_success',
        client_name: risk.client,
        title: `Retention strategy for ${risk.client}`,
        description: `${risk.type} attrition risk. ${risk.reason}`,
        revenue_at_stake: risk.totalAtRisk,
        urgency: severity === 'critical' ? 'immediate' : severity === 'high' ? 'urgent' : 'normal'
      });
    }
    console.log(`   ✅ ${attritionRisks.length} attrition risks`);

    // 1b. CONFIRMED CHURNS - Off-boarding tracking
    console.log('\n📋 Processing Confirmed Churns (Off-boarding)...');
    const confirmedChurns = [
      { client: 'SingHealth Sunrise', revenue2026: 413000, exitDate: '2029-12-31', reason: 'Contract ends 2029 - confirmed exit' },
      { client: 'KKH iPro', revenue2026: 160000, exitDate: '2026-06-30', reason: 'NC/MinDef iPro consolidation - confirmed exit' },
      { client: 'SGH iPro', revenue2026: 192000, exitDate: '2026-06-30', reason: 'NC/MinDef iPro consolidation - confirmed exit' },
      { client: 'NHCS iPro', revenue2026: 77000, exitDate: '2026-06-30', reason: 'NC/MinDef iPro consolidation - confirmed exit' },
      { client: 'CGH iPro', revenue2026: 99000, exitDate: '2026-06-30', reason: 'NC/MinDef iPro consolidation - confirmed exit' },
      { client: 'SKH iPro', revenue2026: 61000, exitDate: '2026-06-30', reason: 'NC/MinDef iPro consolidation - confirmed exit' },
    ];

    for (const churn of confirmedChurns) {
      alerts.push({
        alert_type: 'confirmed_churn',
        severity: 'medium',
        priority_score: 50,
        client_name: churn.client,
        source_table: 'burc_attrition',
        title: `Off-boarding: ${churn.client}`,
        description: `Confirmed exit. ${churn.reason}. 2026 revenue impact: $${Math.round(churn.revenue2026/1000)}K`,
        financial_impact: churn.revenue2026,
        due_date: churn.exitDate,
        recommended_actions: JSON.stringify([
          { action: 'Plan knowledge transfer timeline', team: 'client_success' },
          { action: 'Document lessons learned', team: 'client_success' },
          { action: 'Ensure successful data handover', team: 'client_success' },
          { action: 'Maintain positive relationship for future opportunities', team: 'leadership' }
        ])
      });

      actions.push({
        action_type: 'client_offboarding',
        team: 'client_success',
        client_name: churn.client,
        title: `Successful off-boarding for ${churn.client}`,
        description: `Plan and execute smooth transition. ${churn.reason}`,
        revenue_at_stake: churn.revenue2026,
        due_date: churn.exitDate,
        urgency: 'normal'
      });
    }
    console.log(`   ✅ ${confirmedChurns.length} confirmed churns for off-boarding`);

    // 2. CONTRACT RENEWALS with CPI opportunities
    console.log('\n📋 Processing Contract Renewals...');
    const renewals = [
      { client: 'Epworth Healthcare', solution: 'Opal', renewalDate: '2024-06-30', annualValue: 150000, notes: 'OVERDUE - renewal discussion required' },
      { client: 'GHA', solution: 'Opal', renewalDate: '2024-09-30', annualValue: 125000, notes: 'OVERDUE - CPI increase opportunity' },
      { client: 'Grampians Health', solution: 'Opal', renewalDate: '2024-10-31', annualValue: 145000, notes: 'OVERDUE - needs attention' },
      { client: 'RVEEH', solution: 'Opal', renewalDate: '2024-11-30', annualValue: 29000, notes: 'OVERDUE - small but needs closure' },
      { client: 'Western Health', solution: 'Opal', renewalDate: '2025-06-10', annualValue: 126000, notes: 'Upcoming - prepare CPI proposal' },
      { client: 'Northern Health', solution: 'Opal', renewalDate: '2025-12-31', annualValue: 112000, notes: 'Prepare renewal strategy' },
    ];

    for (const renewal of renewals) {
      const renewalDate = new Date(renewal.renewalDate);
      const today = new Date();
      const daysUntil = Math.floor((renewalDate - today) / (1000 * 60 * 60 * 24));

      const severity = daysUntil < 0 ? 'critical' : daysUntil <= 30 ? 'high' : daysUntil <= 90 ? 'medium' : 'low';
      const priorityScore = daysUntil < 0 ? 100 : daysUntil <= 30 ? 90 : daysUntil <= 60 ? 70 : 50;

      alerts.push({
        alert_type: daysUntil < 0 ? 'renewal_overdue' : 'renewal_due',
        severity,
        priority_score: priorityScore,
        client_name: renewal.client,
        source_table: 'burc_renewals',
        title: daysUntil < 0
          ? `Contract renewal OVERDUE: ${renewal.client}`
          : `Contract renewal in ${daysUntil} days: ${renewal.client}`,
        description: `${renewal.solution} contract. Annual value: $${Math.round(renewal.annualValue/1000)}K. ${renewal.notes}`,
        financial_impact: renewal.annualValue,
        due_date: renewal.renewalDate,
        recommended_actions: JSON.stringify([
          { action: 'Schedule renewal meeting', team: 'client_success' },
          { action: 'Review contract terms', team: 'sales' },
          { action: 'Prepare CPI proposal if applicable', team: 'sales' }
        ])
      });

      actions.push({
        action_type: 'renewal_preparation',
        team: 'client_success',
        client_name: renewal.client,
        title: `Prepare ${renewal.client} renewal`,
        description: `${renewal.solution} renewal ${daysUntil < 0 ? 'OVERDUE' : 'due ' + renewal.renewalDate}. ${renewal.notes}`,
        revenue_at_stake: renewal.annualValue,
        due_date: renewal.renewalDate,
        urgency: severity === 'critical' ? 'immediate' : severity === 'high' ? 'urgent' : 'normal'
      });
    }
    console.log(`   ✅ ${renewals.length} contract renewals`);

    // 3. SALES PIPELINE from Dial 2 and PS sheets
    // NOTE: Only includes clients verified in 2026 APAC Performance.xlsx BURC file
    // Mock data for Mercy Health, Alfred Health, Monash Health, Peter Mac removed on 2025-12-28
    console.log('\n📋 Processing Sales Pipeline...');
    const pipeline = [
      { client: 'SA Health', opportunity: 'Meds Management', value: 4100000, status: 'Pipeline', probability: 60 },
      { client: 'SA Health', opportunity: 'Renal', value: 1700000, status: 'Pipeline', probability: 50 },
      { client: 'SA Health', opportunity: 'SCM 25.1 Upgrade', value: 1600000, status: 'Backlog', probability: 80 },
      { client: 'GHA', opportunity: 'Reg Sched PS', value: 1600000, status: 'Pipeline', probability: 70 },
      { client: 'SA Health', opportunity: 'TQEH AIMS', value: 1500000, status: 'Pipeline', probability: 55 },
      { client: 'SLMC', opportunity: 'Upgrade', value: 1400000, status: 'Pipeline', probability: 45 },
      { client: 'MAH', opportunity: 'SCM Upgrade', value: 1300000, status: 'Pipeline', probability: 40 },
      { client: 'Western Health', opportunity: 'SCM 25.1', value: 850000, status: 'Pipeline', probability: 50 },
    ];

    for (const opp of pipeline) {
      const severity = opp.value > 1000000 ? 'high' : opp.value > 500000 ? 'medium' : 'low';
      const priorityScore = Math.min(100, Math.round((opp.value / 50000) * (opp.probability / 100)));

      alerts.push({
        alert_type: 'upsell_opportunity',
        severity,
        priority_score: priorityScore,
        client_name: opp.client,
        source_table: 'burc_pipeline',
        title: `Pipeline: ${opp.client} - ${opp.opportunity}`,
        description: `${opp.status} opportunity worth $${Math.round(opp.value/1000)}K. Win probability: ${opp.probability}%`,
        financial_impact: opp.value,
        recommended_actions: JSON.stringify([
          { action: 'Schedule discovery meeting', team: 'sales' },
          { action: 'Prepare proposal/SOW', team: 'sales' },
          { action: 'Engage client success for reference', team: 'client_success' }
        ])
      });

      actions.push({
        action_type: opp.status === 'Backlog' ? 'business_case_advance' : 'upsell_pursuit',
        team: 'sales',
        client_name: opp.client,
        title: `Advance ${opp.opportunity} opportunity`,
        description: `${opp.status}: $${Math.round(opp.value/1000)}K (${opp.probability}% probability)`,
        revenue_at_stake: opp.value,
        urgency: opp.status === 'Backlog' ? 'normal' : 'urgent'
      });
    }
    console.log(`   ✅ ${pipeline.length} pipeline opportunities`);

    // 4. CPI OPPORTUNITIES from maintenance data
    // NOTE: Only includes clients with verified maintenance contracts in BURC
    // Mock data for Alfred Health, Monash Health, Austin Health removed on 2025-12-28
    console.log('\n📋 Processing CPI Opportunities...');
    const cpiOpportunities = [
      { client: 'Epworth Healthcare', currentValue: 150000, cpiPotential: 4500, note: 'FY25 CPI pending' },
      { client: 'Western Health', currentValue: 126000, cpiPotential: 3780, note: 'FY26 renewal' },
    ];

    for (const cpi of cpiOpportunities) {
      alerts.push({
        alert_type: 'cpi_opportunity',
        severity: 'low',
        priority_score: 40,
        client_name: cpi.client,
        source_table: 'burc_maintenance',
        title: `CPI Opportunity: ${cpi.client}`,
        description: `Current maintenance: $${Math.round(cpi.currentValue/1000)}K. CPI potential: $${Math.round(cpi.cpiPotential/1000)}K/year. ${cpi.note}`,
        financial_impact: cpi.cpiPotential,
        recommended_actions: JSON.stringify([
          { action: 'Review contract CPI clause', team: 'sales' },
          { action: 'Prepare CPI justification', team: 'client_success' }
        ])
      });
    }
    console.log(`   ✅ ${cpiOpportunities.length} CPI opportunities`);

    // Insert all alerts
    console.log('\n📊 Inserting alerts...');
    for (const alert of alerts) {
      await client.query(`
        INSERT INTO financial_alerts (
          alert_type, severity, priority_score, client_name, source_table,
          title, description, financial_impact, due_date, recommended_actions
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        alert.alert_type, alert.severity, alert.priority_score, alert.client_name,
        alert.source_table, alert.title, alert.description, alert.financial_impact,
        alert.due_date || null, alert.recommended_actions
      ]);
    }
    console.log(`   ✅ ${alerts.length} alerts inserted`);

    // Insert all actions
    console.log('\n📊 Inserting actions...');
    for (const action of actions) {
      await client.query(`
        INSERT INTO financial_actions (
          action_type, team, client_name, title, description,
          revenue_at_stake, due_date, urgency
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        action.action_type, action.team, action.client_name, action.title,
        action.description, action.revenue_at_stake, action.due_date || null, action.urgency
      ]);
    }
    console.log(`   ✅ ${actions.length} actions inserted`);

    // Summary
    console.log('\n📊 Summary by Alert Type:');
    const summary = await client.query(`
      SELECT alert_type, severity, COUNT(*) as count, SUM(financial_impact) as total_impact
      FROM financial_alerts
      GROUP BY alert_type, severity
      ORDER BY
        CASE severity
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          ELSE 4
        END
    `);

    summary.rows.forEach(row => {
      console.log(`   ${row.severity.toUpperCase()} ${row.alert_type}: ${row.count} alerts ($${Math.round(row.total_impact/1000)}K)`);
    });

    console.log('\n📊 Top 10 Priority Actions:');
    const topActions = await client.query(`
      SELECT client_name, title,
             COALESCE(revenue_at_stake, 0) as revenue,
             urgency
      FROM financial_actions
      ORDER BY
        CASE urgency
          WHEN 'immediate' THEN 1
          WHEN 'urgent' THEN 2
          WHEN 'normal' THEN 3
          ELSE 4
        END,
        revenue_at_stake DESC NULLS LAST
      LIMIT 10
    `);

    topActions.rows.forEach((row, i) => {
      console.log(`   ${i+1}. [${row.urgency.toUpperCase()}] ${row.client_name}: ${row.title} ($${Math.round(row.revenue/1000)}K)`);
    });

    console.log('\n✅ Financial data seeded successfully!');

  } catch (err) {
    console.error('❌ Error:', err.message);
    throw err;
  } finally {
    await client.end();
  }
}

seedFinancialData();
