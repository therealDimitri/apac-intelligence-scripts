import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('=== PIPELINE DATA (Correct Columns) ===');
const { data: pipeline, error: pe } = await supabase
  .from('burc_business_cases')
  .select('opportunity_name, client_name, forecast_category, probability, estimated_sw_value, estimated_ps_value, estimated_maint_value, estimated_hw_value');

if (pe) {
  console.log('Error:', pe.message);
} else {
  let totalValue = 0;
  let weightedValue = 0;
  const byCategory = {};

  pipeline.forEach(p => {
    const netBooking = (p.estimated_sw_value || 0) + (p.estimated_ps_value || 0) +
                       (p.estimated_maint_value || 0) + (p.estimated_hw_value || 0);
    const weighted = netBooking * (p.probability || 0);
    totalValue += netBooking;
    weightedValue += weighted;

    const cat = p.forecast_category || 'Unknown';
    if (!byCategory[cat]) byCategory[cat] = { count: 0, value: 0, weighted: 0 };
    byCategory[cat].count++;
    byCategory[cat].value += netBooking;
    byCategory[cat].weighted += weighted;
  });

  console.log('Total Pipeline Value: $' + (totalValue / 1000000).toFixed(2) + 'M');
  console.log('Weighted Pipeline Value: $' + (weightedValue / 1000000).toFixed(2) + 'M');
  console.log('Deal Count:', pipeline.length);
  console.log('\nBy Forecast Category:');
  Object.entries(byCategory).forEach(([cat, data]) => {
    console.log('  ' + cat + ': ' + data.count + ' deals, $' + (data.value / 1000000).toFixed(2) + 'M total, $' + (data.weighted / 1000000).toFixed(2) + 'M weighted');
  });
}

console.log('\n=== ATTRITION RISK ANALYSIS ===');
const { data: attrition } = await supabase.from('burc_attrition_risk').select('*');

// Calculate annual churn for each year
const annual = { 2025: 0, 2026: 0, 2027: 0, 2028: 0 };
let totalAtRisk = 0;
attrition.forEach(a => {
  annual[2025] += a.revenue_2025 || 0;
  annual[2026] += a.revenue_2026 || 0;
  annual[2027] += a.revenue_2027 || 0;
  annual[2028] += a.revenue_2028 || 0;
  totalAtRisk += a.total_at_risk || 0;
});

console.log('Annual Churn Risk by Year:');
console.log('  2025: $' + (annual[2025] / 1000).toFixed(1) + 'K');
console.log('  2026: $' + (annual[2026] / 1000).toFixed(1) + 'K');
console.log('  2027: $' + (annual[2027] / 1000).toFixed(1) + 'K');
console.log('  2028: $' + (annual[2028] / 1000).toFixed(1) + 'K');
console.log('Total Multi-Year Risk: $' + (totalAtRisk / 1000000).toFixed(2) + 'M');
console.log('Account Count:', attrition.length);

// Check Net Revenue Impact calculation
console.log('\n=== NET REVENUE IMPACT CALCULATION ===');
console.log('Pipeline (Total): $' + (totalValue / 1000000).toFixed(2) + 'M');
console.log('Attrition (2026): -$' + (annual[2026] / 1000).toFixed(1) + 'K');
console.log('Net Impact: $' + ((totalValue - annual[2026]) / 1000000).toFixed(2) + 'M');
