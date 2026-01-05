import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('=== FIXING FY2026 GROSS REVENUE ===\n');

// Current incorrect value
const incorrectValue = 33738278.35;
// Correct value from Excel
const correctValue = 26311282;

console.log('Current database value: $' + incorrectValue.toLocaleString());
console.log('Correct Excel value:    $' + correctValue.toLocaleString());
console.log('Difference:             $' + (incorrectValue - correctValue).toLocaleString());

// Get current FY2026 entry
const { data: current } = await supabase
  .from('burc_annual_financials')
  .select('*')
  .eq('fiscal_year', 2026)
  .single();

console.log('\n--- Before Update ---');
console.log('Gross Revenue: $' + (current?.gross_revenue || 0).toLocaleString());
console.log('NRR: ' + (current?.nrr_percent || 0) + '%');
console.log('GRR: ' + (current?.grr_percent || 0) + '%');

// Update to correct value
const { error } = await supabase
  .from('burc_annual_financials')
  .update({
    gross_revenue: correctValue,
    updated_at: new Date().toISOString()
  })
  .eq('fiscal_year', 2026);

if (error) {
  console.log('\nError updating: ' + error.message);
} else {
  console.log('\n✅ Gross Revenue updated to $' + correctValue.toLocaleString());
}

// Verify update
const { data: updated } = await supabase
  .from('burc_annual_financials')
  .select('*')
  .eq('fiscal_year', 2026)
  .single();

console.log('\n--- After Update ---');
console.log('Gross Revenue: $' + (updated?.gross_revenue || 0).toLocaleString());

// Now check if NRR/GRR need recalculation
console.log('\n=== NRR/GRR RECALCULATION CHECK ===\n');

const churn = updated?.churn || 675000;
const expansion = updated?.expansion || 6613278;
const storedNRR = updated?.nrr_percent || 121.4;
const storedGRR = updated?.grr_percent || 97.6;

// The NRR/GRR were stored at 121.4% and 97.6%
// These implied a base ARR of ~$28M
// If we use the corrected gross revenue of $26.3M:

const calcGRR = ((correctValue - churn) / correctValue * 100).toFixed(1);
const calcNRR = ((correctValue + expansion - churn) / correctValue * 100).toFixed(1);

console.log('If NRR/GRR calculated on Gross Revenue ($26.3M):');
console.log('  GRR = (Revenue - Churn) / Revenue');
console.log('      = ($' + correctValue.toLocaleString() + ' - $' + churn.toLocaleString() + ') / $' + correctValue.toLocaleString());
console.log('      = ' + calcGRR + '%');
console.log('');
console.log('  NRR = (Revenue + Expansion - Churn) / Revenue');
console.log('      = ($' + correctValue.toLocaleString() + ' + $' + expansion.toLocaleString() + ' - $' + churn.toLocaleString() + ') / $' + correctValue.toLocaleString());
console.log('      = ' + calcNRR + '%');

console.log('\nStored NRR: ' + storedNRR + '% (calculated: ' + calcNRR + '%)');
console.log('Stored GRR: ' + storedGRR + '% (calculated: ' + calcGRR + '%)');

// Check executive summary view
console.log('\n=== EXECUTIVE SUMMARY VIEW (after update) ===\n');
const { data: summary } = await supabase
  .from('burc_executive_summary')
  .select('*')
  .single();

if (summary) {
  console.log('Total ARR: $' + (summary.total_arr || 0).toLocaleString());
  console.log('NRR: ' + Math.round(summary.nrr_percent || 0) + '%');
  console.log('GRR: ' + Math.round(summary.grr_percent || 0) + '%');
}
