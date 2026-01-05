import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('=== BURC DATA CLEANUP ===\n');

// 1. Remove "Total" rows from burc_arr_tracking
console.log('1. Cleaning burc_arr_tracking...');
const { data: arrTotals, error: arrErr } = await supabase
  .from('burc_arr_tracking')
  .delete()
  .eq('client_name', 'Total')
  .select();

if (arrErr) {
  console.log('   Error:', arrErr.message);
} else {
  console.log('   Deleted ' + (arrTotals?.length || 0) + ' "Total" rows');
  arrTotals?.forEach(r => console.log('   - ID ' + r.id + ': $' + r.arr_usd?.toLocaleString()));
}

// 2. Check burc_contracts for summary rows
console.log('\n2. Checking burc_contracts...');
const { data: contractTotals } = await supabase
  .from('burc_contracts')
  .select('*')
  .or('client_name.ilike.%total%,client_name.ilike.%subtotal%,client_name.ilike.%grand%');

if (contractTotals?.length > 0) {
  console.log('   Found ' + contractTotals.length + ' potential summary rows:');
  contractTotals.forEach(r => console.log('   - ' + r.client_name));

  // Delete them
  const { data: deleted } = await supabase
    .from('burc_contracts')
    .delete()
    .or('client_name.ilike.%total%,client_name.ilike.%subtotal%,client_name.ilike.%grand%')
    .select();
  console.log('   Deleted ' + (deleted?.length || 0) + ' rows');
} else {
  console.log('   No summary rows found');
}

// 3. Check burc_business_cases for summary rows
console.log('\n3. Checking burc_business_cases...');
const { data: bcTotals } = await supabase
  .from('burc_business_cases')
  .select('*')
  .or('client_name.ilike.%total%,client_name.ilike.%subtotal%,client_name.ilike.%grand%');

if (bcTotals?.length > 0) {
  console.log('   Found ' + bcTotals.length + ' potential summary rows:');
  bcTotals.forEach(r => console.log('   - ' + r.client_name + ': $' + r.total_value?.toLocaleString()));

  // Delete them
  const { data: deleted } = await supabase
    .from('burc_business_cases')
    .delete()
    .or('client_name.ilike.%total%,client_name.ilike.%subtotal%,client_name.ilike.%grand%')
    .select();
  console.log('   Deleted ' + (deleted?.length || 0) + ' rows');
} else {
  console.log('   No summary rows found');
}

// 4. Check burc_attrition_risk for summary rows
console.log('\n4. Checking burc_attrition_risk...');
const { data: attrTotals } = await supabase
  .from('burc_attrition_risk')
  .select('*')
  .or('client_name.ilike.%total%,client_name.ilike.%subtotal%,client_name.ilike.%grand%');

if (attrTotals?.length > 0) {
  console.log('   Found ' + attrTotals.length + ' potential summary rows:');
  attrTotals.forEach(r => console.log('   - ' + r.client_name));

  // Delete them
  const { data: deleted } = await supabase
    .from('burc_attrition_risk')
    .delete()
    .or('client_name.ilike.%total%,client_name.ilike.%subtotal%,client_name.ilike.%grand%')
    .select();
  console.log('   Deleted ' + (deleted?.length || 0) + ' rows');
} else {
  console.log('   No summary rows found');
}

// 5. Check burc_attrition for summary rows
console.log('\n5. Checking burc_attrition...');
const { data: attritionTotals } = await supabase
  .from('burc_attrition')
  .select('*')
  .or('client_name.ilike.%total%,client_name.ilike.%subtotal%,client_name.ilike.%grand%');

if (attritionTotals?.length > 0) {
  console.log('   Found ' + attritionTotals.length + ' potential summary rows:');
  attritionTotals.forEach(r => console.log('   - ' + r.client_name));

  // Delete them
  const { data: deleted } = await supabase
    .from('burc_attrition')
    .delete()
    .or('client_name.ilike.%total%,client_name.ilike.%subtotal%,client_name.ilike.%grand%')
    .select();
  console.log('   Deleted ' + (deleted?.length || 0) + ' rows');
} else {
  console.log('   No summary rows found');
}

// 6. Verify new ARR total
console.log('\n=== VERIFICATION ===\n');

const { data: newArr } = await supabase
  .from('burc_arr_tracking')
  .select('client_name, arr_usd');

const newTotal = newArr?.reduce((sum, r) => sum + (r.arr_usd || 0), 0) || 0;
console.log('New ARR entry count: ' + newArr?.length);
console.log('New Total ARR: $' + newTotal.toLocaleString());

// 7. Check executive summary view
console.log('\n--- Executive Summary View ---');
const { data: summary } = await supabase
  .from('burc_executive_summary')
  .select('total_arr, active_contracts, total_pipeline, weighted_pipeline, annual_churn, attrition_risk_count')
  .single();

if (summary) {
  console.log('Total ARR: $' + (summary.total_arr || 0).toLocaleString());
  console.log('Active Contracts: ' + summary.active_contracts);
  console.log('Total Pipeline: $' + (summary.total_pipeline || 0).toLocaleString());
  console.log('Weighted Pipeline: $' + (summary.weighted_pipeline || 0).toLocaleString());
  console.log('Annual Churn: $' + (summary.annual_churn || 0).toLocaleString());
  console.log('Attrition Risk Count: ' + summary.attrition_risk_count);
}

console.log('\n=== CLEANUP COMPLETE ===');
