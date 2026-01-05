import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Get all annual financials
const { data: all } = await supabase
  .from('burc_annual_financials')
  .select('*')
  .order('fiscal_year');

console.log('=== ALL burc_annual_financials ENTRIES ===\n');
all?.forEach(row => {
  console.log('FY' + row.fiscal_year + ':');
  console.log('  ID: ' + row.id);
  console.log('  Gross Revenue: $' + (row.gross_revenue || 0).toLocaleString());
  console.log('  EBITA: $' + (row.ebita || 0).toLocaleString());
  console.log('  NRR: ' + (row.nrr_percent || 0) + '%');
  console.log('  GRR: ' + (row.grr_percent || 0) + '%');
  console.log('  Churn: $' + (row.churn || 0).toLocaleString());
  console.log('  Expansion: $' + (row.expansion || 0).toLocaleString());
  console.log('  Source File: ' + (row.source_file || 'unknown'));
  console.log('  Updated At: ' + row.updated_at);
  console.log('');
});

// Check for duplicate fiscal years
const byYear = {};
all?.forEach(row => {
  if (!byYear[row.fiscal_year]) byYear[row.fiscal_year] = [];
  byYear[row.fiscal_year].push(row);
});

console.log('=== DUPLICATE CHECK ===');
Object.entries(byYear).forEach(([year, rows]) => {
  if (rows.length > 1) {
    console.log('⚠️ DUPLICATE FY' + year + ': ' + rows.length + ' entries');
    rows.forEach(r => console.log('  - ID ' + r.id + ': $' + r.gross_revenue?.toLocaleString()));
  }
});

console.log('\n=== EXCEL vs DATABASE COMPARISON ===');
console.log('');
console.log('FY2026 (Calendar 2025):');
console.log('  Excel Gross Revenue Total: $26,311,282');
console.log('  Database Gross Revenue:    $' + (all?.find(r => r.fiscal_year === 2026)?.gross_revenue || 0).toLocaleString());
console.log('  Difference:                $' + (33738278 - 26311282).toLocaleString());
console.log('');
console.log('The database value appears to be ~$7.4M higher than Excel.');
console.log('This suggests either:');
console.log('  1. Old/stale data in database');
console.log('  2. Different calculation methodology');
console.log('  3. Pipeline/forecast items incorrectly included');
