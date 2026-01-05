import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyData() {
  console.log('=== EXECUTIVE DASHBOARD DATA VERIFICATION ===\n');

  // 1. Pipeline Totals
  console.log('--- PIPELINE DATA ---');
  const { data: pipeline, error: pipelineErr } = await supabase
    .from('burc_business_cases')
    .select('deal_name, client_name, forecast_category, net_booking, weighted_value, probability');

  if (pipelineErr) {
    console.log('Pipeline error:', pipelineErr.message);
  } else if (pipeline) {
    const totalValue = pipeline.reduce((sum, p) => sum + (p.net_booking || 0), 0);
    const weightedValue = pipeline.reduce((sum, p) => sum + (p.weighted_value || 0), 0);
    console.log('Total Pipeline Value: $' + (totalValue / 1000000).toFixed(1) + 'M');
    console.log('Weighted Pipeline Value: $' + (weightedValue / 1000000).toFixed(1) + 'M');
    console.log('Deal Count:', pipeline.length);

    // By forecast category
    const byCategory = {};
    pipeline.forEach(p => {
      const cat = p.forecast_category || 'Unknown';
      if (!byCategory[cat]) byCategory[cat] = { count: 0, value: 0, weighted: 0 };
      byCategory[cat].count++;
      byCategory[cat].value += p.net_booking || 0;
      byCategory[cat].weighted += p.weighted_value || 0;
    });
    console.log('\nBy Forecast Category:');
    Object.entries(byCategory).forEach(([cat, data]) => {
      console.log(`  ${cat}: ${data.count} deals, $${(data.value / 1000000).toFixed(2)}M total, $${(data.weighted / 1000000).toFixed(2)}M weighted`);
    });
  }

  // 2. Attrition Risk
  console.log('\n--- ATTRITION RISK DATA ---');
  const { data: attrition, error: attritionErr } = await supabase
    .from('burc_attrition_risk')
    .select('*');

  if (attritionErr) {
    console.log('Attrition error:', attritionErr.message);
  } else if (attrition) {
    const openRisks = attrition.filter(a => a.status === 'open' || !a.status);
    const totalAtRisk = attrition.reduce((sum, a) => sum + (a.total_at_risk || 0), 0);
    console.log('Total Accounts:', attrition.length);
    console.log('Open Status Count:', openRisks.length);
    console.log('Total Revenue at Risk: $' + (totalAtRisk / 1000).toFixed(1) + 'K');

    // By status
    const byStatus = {};
    attrition.forEach(a => {
      const status = a.status || 'open';
      if (!byStatus[status]) byStatus[status] = { count: 0, value: 0 };
      byStatus[status].count++;
      byStatus[status].value += a.total_at_risk || 0;
    });
    console.log('\nBy Status:');
    Object.entries(byStatus).forEach(([status, data]) => {
      console.log(`  ${status}: ${data.count} accounts, $${(data.value / 1000000).toFixed(2)}M at risk`);
    });

    console.log('\nClients at Risk:');
    attrition.forEach(a => {
      console.log(`  - ${a.client_name}: $${((a.total_at_risk || 0) / 1000).toFixed(1)}K (${a.status || 'open'})`);
    });
  }

  // 3. Contracts/ARR
  console.log('\n--- ARR / CONTRACTS DATA ---');
  const { data: contracts, error: contractsErr } = await supabase
    .from('burc_contracts')
    .select('*');

  if (contractsErr) {
    console.log('Contracts error:', contractsErr.message);
  } else if (contracts) {
    const activeContracts = contracts.filter(c => c.contract_status === 'active');
    const totalARR = activeContracts.reduce((sum, c) => sum + (c.annual_value_usd || 0), 0);
    console.log('Total Contracts:', contracts.length);
    console.log('Active Contracts:', activeContracts.length);
    console.log('Total ARR (Active): $' + (totalARR / 1000000).toFixed(1) + 'M');
  }

  // 4. Upcoming Renewals
  console.log('\n--- UPCOMING RENEWALS ---');
  const { data: renewals, error: renewalsErr } = await supabase
    .from('burc_contracts')
    .select('client_name, renewal_date, annual_value_usd')
    .gte('renewal_date', new Date().toISOString())
    .order('renewal_date');

  if (renewalsErr) {
    console.log('Renewals error:', renewalsErr.message);
  } else if (renewals && renewals.length > 0) {
    const byMonth = {};
    renewals.forEach(r => {
      const month = new Date(r.renewal_date).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
      if (!byMonth[month]) byMonth[month] = { count: 0, value: 0, clients: [] };
      byMonth[month].count++;
      byMonth[month].value += r.annual_value_usd || 0;
      byMonth[month].clients.push(r.client_name);
    });
    console.log('Renewals by Month:');
    Object.entries(byMonth).forEach(([month, data]) => {
      console.log(`  ${month}: ${data.count} ($${(data.value / 1000).toFixed(1)}K) - ${data.clients.join(', ')}`);
    });
  } else {
    console.log('No upcoming renewals found');
  }

  // 5. Executive Summary
  console.log('\n--- EXECUTIVE SUMMARY ---');
  const { data: summary, error: summaryErr } = await supabase
    .from('burc_executive_summary')
    .select('*')
    .order('snapshot_date', { ascending: false })
    .limit(1);

  if (summaryErr) {
    console.log('Summary error:', summaryErr.message);
  } else if (summary && summary[0]) {
    const s = summary[0];
    console.log('Snapshot Date:', s.snapshot_date);
    console.log('NRR:', s.nrr_percent + '%');
    console.log('GRR:', s.grr_percent + '%');
    console.log('Rule of 40:', s.rule_of_40_score);
    console.log('Total ARR: $' + ((s.total_arr || 0) / 1000000).toFixed(1) + 'M');
    console.log('Total Pipeline: $' + ((s.total_pipeline || 0) / 1000000).toFixed(1) + 'M');
    console.log('Weighted Pipeline: $' + ((s.weighted_pipeline || 0) / 1000000).toFixed(1) + 'M');
  } else {
    console.log('No executive summary data found');
  }

  // 6. Rule of 40 View
  console.log('\n--- RULE OF 40 VIEW ---');
  const { data: rule40, error: rule40Err } = await supabase
    .from('burc_rule_of_40')
    .select('*')
    .order('fiscal_year', { ascending: false })
    .limit(1);

  if (rule40Err) {
    console.log('Rule of 40 error:', rule40Err.message);
  } else if (rule40 && rule40[0]) {
    const r = rule40[0];
    console.log('Fiscal Year:', r.fiscal_year);
    console.log('Revenue Growth %:', r.revenue_growth_percent);
    console.log('EBITA Margin %:', r.ebita_margin_percent);
    console.log('Rule of 40 Score:', r.rule_of_40_score);
    console.log('Status:', r.status);
  } else {
    console.log('No Rule of 40 data found');
  }

  // 7. Revenue Retention
  console.log('\n--- REVENUE RETENTION ---');
  const { data: retention, error: retentionErr } = await supabase
    .from('burc_revenue_retention')
    .select('*')
    .order('fiscal_year', { ascending: false })
    .limit(1);

  if (retentionErr) {
    console.log('Retention error:', retentionErr.message);
  } else if (retention && retention[0]) {
    const r = retention[0];
    console.log('Fiscal Year:', r.fiscal_year);
    console.log('NRR:', r.nrr_percent + '%');
    console.log('GRR:', r.grr_percent + '%');
    console.log('Starting Revenue: $' + ((r.starting_revenue || 0) / 1000000).toFixed(2) + 'M');
    console.log('Ending Revenue: $' + ((r.ending_revenue || 0) / 1000000).toFixed(2) + 'M');
    console.log('Churn: $' + ((r.churn_amount || 0) / 1000000).toFixed(2) + 'M');
    console.log('Expansion: $' + ((r.expansion_revenue || 0) / 1000000).toFixed(2) + 'M');
  } else {
    console.log('No retention data found');
  }
}

verifyData().catch(console.error);
