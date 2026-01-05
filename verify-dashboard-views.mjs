import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('=== EXECUTIVE SUMMARY VIEW ===');
const { data: summary, error: se } = await supabase
  .from('burc_executive_summary')
  .select('*')
  .single();

if (se) {
  console.log('Error:', se.message);
} else {
  console.log('Snapshot Date:', summary.snapshot_date);
  console.log('NRR:', summary.nrr_percent + '%');
  console.log('GRR:', summary.grr_percent + '%');
  console.log('Rule of 40:', summary.rule_of_40_score);
  console.log('Total ARR: $' + (summary.total_arr / 1000000).toFixed(1) + 'M');
  console.log('Active Contracts:', summary.active_contracts);
  console.log('Total Pipeline: $' + (summary.total_pipeline / 1000000).toFixed(1) + 'M');
  console.log('Weighted Pipeline: $' + (summary.weighted_pipeline / 1000000).toFixed(1) + 'M');
  console.log('Total At Risk: $' + (summary.total_at_risk / 1000).toFixed(1) + 'K');
  console.log('Attrition Risk Count:', summary.attrition_risk_count);
  console.log('\nRaw summary data:');
  console.log(JSON.stringify(summary, null, 2));
}

console.log('\n=== ATTRITION SUMMARY VIEW ===');
const { data: attrSum, error: ae } = await supabase
  .from('burc_attrition_summary')
  .select('*');

if (ae) {
  console.log('Error:', ae.message);
} else {
  console.log('Attrition Summary Rows:', attrSum.length);
  attrSum.forEach(row => {
    console.log('\nStatus:', row.status);
    console.log('  Risk Count:', row.risk_count);
    console.log('  Total At Risk (2026): $' + ((row.total_at_risk_2026 || 0) / 1000).toFixed(1) + 'K');
    console.log('  Total At Risk (All Years): $' + ((row.total_at_risk_all_years || 0) / 1000000).toFixed(2) + 'M');
    console.log('  Affected Clients:', row.affected_clients);
  });
}

console.log('\n=== PIPELINE BY STAGE VIEW ===');
const { data: pipeline, error: pe } = await supabase
  .from('burc_pipeline_by_stage')
  .select('*');

if (pe) {
  console.log('Error:', pe.message);
} else {
  let totalValue = 0;
  let weightedValue = 0;
  pipeline.forEach(row => {
    totalValue += row.total_value || 0;
    weightedValue += row.weighted_value || 0;
    console.log('\n' + row.forecast_category + ' / ' + row.stage);
    console.log('  Opportunities:', row.opportunity_count);
    console.log('  Total: $' + (row.total_value / 1000000).toFixed(2) + 'M');
    console.log('  Weighted: $' + (row.weighted_value / 1000000).toFixed(2) + 'M');
  });
  console.log('\nPipeline View Totals:');
  console.log('  Total: $' + (totalValue / 1000000).toFixed(2) + 'M');
  console.log('  Weighted: $' + (weightedValue / 1000000).toFixed(2) + 'M');
}

console.log('\n=== RENEWAL CALENDAR VIEW ===');
const { data: renewals, error: re } = await supabase
  .from('burc_renewal_calendar')
  .select('*')
  .limit(12);

if (re) {
  console.log('Error:', re.message);
} else {
  renewals.forEach(row => {
    console.log(row.renewal_period + ': ' + row.contract_count + ' contracts, $' +
                (row.total_value_aud / 1000).toFixed(1) + 'K - ' + row.clients);
  });
}
