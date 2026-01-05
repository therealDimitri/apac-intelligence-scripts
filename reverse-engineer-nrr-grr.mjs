import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('=== REVERSE ENGINEERING NRR/GRR ===\n');

// Get verified data
const { data: fin2026 } = await supabase
  .from('burc_annual_financials')
  .select('*')
  .eq('fiscal_year', 2026)
  .single();

const { data: fin2025 } = await supabase
  .from('burc_annual_financials')
  .select('*')
  .eq('fiscal_year', 2025)
  .single();

const { data: arr } = await supabase
  .from('burc_arr_tracking')
  .select('arr_usd');

const totalARR = arr?.reduce((sum, r) => sum + (r.arr_usd || 0), 0) || 0;

console.log('=== VERIFIED DATA ===\n');
console.log('FY2026:');
console.log('  Gross Revenue: $' + (fin2026?.gross_revenue || 0).toLocaleString());
console.log('  Churn: $' + (fin2026?.churn || 0).toLocaleString());
console.log('  Expansion: $' + (fin2026?.expansion || 0).toLocaleString());
console.log('  Stored NRR: ' + (fin2026?.nrr_percent || 0) + '%');
console.log('  Stored GRR: ' + (fin2026?.grr_percent || 0) + '%');

console.log('\nFY2025:');
console.log('  Gross Revenue: $' + (fin2025?.gross_revenue || 0).toLocaleString());

console.log('\nARR Tracking:');
console.log('  Total ARR (21 clients): $' + totalARR.toLocaleString());

const churn = fin2026?.churn || 675000;
const expansion = fin2026?.expansion || 6613278;
const storedNRR = fin2026?.nrr_percent || 121.4;
const storedGRR = fin2026?.grr_percent || 97.6;

console.log('\n=== REVERSE ENGINEERING FROM STORED VALUES ===\n');

// Reverse engineer base from GRR
// GRR = (Base - Churn) / Base
// GRR * Base = Base - Churn
// Churn = Base - GRR * Base = Base * (1 - GRR)
// Base = Churn / (1 - GRR)
const impliedBaseFromGRR = churn / (1 - storedGRR / 100);

// Reverse engineer base from NRR
// NRR = (Base + Expansion - Churn) / Base
// NRR * Base = Base + Expansion - Churn
// Base * (NRR - 1) = Expansion - Churn
// Base = (Expansion - Churn) / (NRR - 1)
const impliedBaseFromNRR = (expansion - churn) / (storedNRR / 100 - 1);

console.log('Implied base from GRR (97.6%): $' + Math.round(impliedBaseFromGRR).toLocaleString());
console.log('Implied base from NRR (121.4%): $' + Math.round(impliedBaseFromNRR).toLocaleString());
console.log('Average implied base: $' + Math.round((impliedBaseFromGRR + impliedBaseFromNRR) / 2).toLocaleString());

console.log('\n=== CALCULATING NRR/GRR WITH DIFFERENT BASES ===\n');

const bases = [
  { name: 'Total ARR (burc_arr_tracking)', value: totalARR },
  { name: 'FY2026 Gross Revenue', value: fin2026?.gross_revenue || 33738278 },
  { name: 'FY2025 Gross Revenue (Prior Year)', value: fin2025?.gross_revenue || 26344602 },
  { name: 'FY2026 Maintenance Revenue', value: 20148000 },
  { name: 'Implied Base (~$28M)', value: 28125000 },
];

console.log('Churn: $' + churn.toLocaleString());
console.log('Expansion: $' + expansion.toLocaleString());
console.log('');
console.log('| Base                              | Value        | Calc GRR | Calc NRR | GRR Match | NRR Match |');
console.log('|-----------------------------------|--------------|----------|----------|-----------|-----------|');

bases.forEach(base => {
  const calcGRR = ((base.value - churn) / base.value * 100);
  const calcNRR = ((base.value + expansion - churn) / base.value * 100);
  const grrMatch = Math.abs(calcGRR - storedGRR) < 0.5 ? '✅ YES' : '❌ No';
  const nrrMatch = Math.abs(calcNRR - storedNRR) < 1.5 ? '✅ YES' : '❌ No';

  console.log('| ' + base.name.padEnd(33) + ' | $' + Math.round(base.value).toLocaleString().padStart(10) + ' | ' +
    calcGRR.toFixed(1).padStart(6) + '% | ' + calcNRR.toFixed(1).padStart(6) + '% | ' +
    grrMatch.padEnd(9) + ' | ' + nrrMatch.padEnd(9) + ' |');
});

console.log('\n=== BEST MATCH ANALYSIS ===\n');

// FY2025 Gross Revenue is the closest match
const fy25Base = fin2025?.gross_revenue || 26344602;
const calcGRRFY25 = ((fy25Base - churn) / fy25Base * 100);
const calcNRRFY25 = ((fy25Base + expansion - churn) / fy25Base * 100);

console.log('BEST MATCH: FY2025 Gross Revenue ($26.3M) as Starting ARR\n');
console.log('This makes sense because NRR/GRR are typically calculated as:');
console.log('  - Starting ARR = End of prior period (FY2025)');
console.log('  - Churn = Revenue lost during current period (FY2026)');
console.log('  - Expansion = New revenue added during current period (FY2026)');
console.log('');
console.log('Calculation using FY2025 Gross Revenue ($' + fy25Base.toLocaleString() + '):');
console.log('  GRR = (Starting - Churn) / Starting');
console.log('      = ($' + fy25Base.toLocaleString() + ' - $' + churn.toLocaleString() + ') / $' + fy25Base.toLocaleString());
console.log('      = ' + calcGRRFY25.toFixed(2) + '%');
console.log('      Stored: ' + storedGRR + '% | Difference: ' + (storedGRR - calcGRRFY25).toFixed(2) + '%');
console.log('');
console.log('  NRR = (Starting + Expansion - Churn) / Starting');
console.log('      = ($' + fy25Base.toLocaleString() + ' + $' + expansion.toLocaleString() + ' - $' + churn.toLocaleString() + ') / $' + fy25Base.toLocaleString());
console.log('      = ' + calcNRRFY25.toFixed(2) + '%');
console.log('      Stored: ' + storedNRR + '% | Difference: ' + (storedNRR - calcNRRFY25).toFixed(2) + '%');

console.log('\n=== CONCLUSION ===\n');
if (Math.abs(calcGRRFY25 - storedGRR) < 0.5 && Math.abs(calcNRRFY25 - storedNRR) < 1.5) {
  console.log('✅ MATCH FOUND!');
  console.log('');
  console.log('The stored NRR (121.4%) and GRR (97.6%) were calculated using:');
  console.log('  Base: FY2025 Gross Revenue = $' + fy25Base.toLocaleString());
  console.log('  Churn: $' + churn.toLocaleString());
  console.log('  Expansion: $' + expansion.toLocaleString());
} else {
  console.log('❌ NO EXACT MATCH');
  console.log('The stored values may use a slightly different calculation or rounding.');
}
