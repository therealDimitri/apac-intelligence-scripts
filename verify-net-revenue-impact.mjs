import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('=== NET REVENUE IMPACT VERIFICATION ===\n');

// Get executive summary
const { data: summary } = await supabase
  .from('burc_executive_summary')
  .select('*')
  .single();

console.log('From burc_executive_summary:');
console.log('  Total Pipeline: $' + (summary.total_pipeline / 1000000).toFixed(2) + 'M');
console.log('  Weighted Pipeline: $' + (summary.weighted_pipeline / 1000000).toFixed(2) + 'M');
console.log('  Annual Churn (At Risk): $' + (summary.annual_churn / 1000).toFixed(1) + 'K');

// Net Revenue Impact = Weighted Pipeline - Annual Churn
const netImpact = summary.weighted_pipeline - summary.annual_churn;
console.log('\nNet Revenue Impact Calculation:');
console.log('  Weighted Pipeline: $' + (summary.weighted_pipeline / 1000000).toFixed(2) + 'M');
console.log('  - Annual Churn: $' + (summary.annual_churn / 1000).toFixed(1) + 'K');
console.log('  = Net Impact: $' + (netImpact / 1000000).toFixed(1) + 'M');

// Coverage Ratio = Weighted Pipeline / Annual Churn
const coverageRatio = summary.weighted_pipeline / summary.annual_churn;
console.log('\nCoverage Ratio:');
console.log('  Weighted Pipeline / Annual Churn = ' + (coverageRatio * 100).toFixed(0) + '%');

// Check contracts table for renewal amounts (USD vs AUD)
console.log('\n=== RENEWAL VALUES COMPARISON ===\n');
const { data: contracts } = await supabase
  .from('burc_contracts')
  .select('client_name, renewal_date, annual_value_usd, contract_value_aud')
  .gte('renewal_date', new Date().toISOString())
  .order('renewal_date');

contracts.forEach(c => {
  console.log(c.client_name + ':');
  console.log('  Renewal Date: ' + c.renewal_date);
  console.log('  Annual Value USD: $' + ((c.annual_value_usd || 0) / 1000).toFixed(1) + 'K');
  console.log('  Contract Value AUD: $' + ((c.contract_value_aud || 0) / 1000).toFixed(1) + 'K');
  console.log('');
});

// Check renewal_calendar view structure
console.log('=== RENEWAL CALENDAR VIEW ===');
const { data: calendar } = await supabase
  .from('burc_renewal_calendar')
  .select('*')
  .limit(5);

if (calendar && calendar.length > 0) {
  console.log('Column keys:', Object.keys(calendar[0]).join(', '));
  calendar.forEach(row => {
    console.log(row.renewal_period + ':');
    console.log('  Count:', row.contract_count);
    console.log('  Total USD: $' + ((row.total_value_usd || 0) / 1000).toFixed(1) + 'K');
    console.log('  Total AUD: $' + ((row.total_value_aud || 0) / 1000).toFixed(1) + 'K');
  });
}
