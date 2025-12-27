import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://usoyxsunetvxdjdglkmn.supabase.co',
  'sb_secret_tg9qhHtwhKS0rPe_FUgzKA_nOyqLAas'
);

const { data: aging } = await supabase
  .from('aging_accounts')
  .select('client_name, total_outstanding, total_overdue, current_amount, days_1_to_30, days_31_to_60, days_61_to_90, days_91_to_120, days_121_to_180, days_181_to_270, days_271_to_365, days_over_365')
  .order('total_outstanding', { ascending: false });

if (!aging) process.exit(1);

let totalOutstanding = 0;
let totalCurrent = 0;
let total1to30 = 0;
let totalOverdue30Plus = 0;
let totalOver365 = 0;

console.log('=== TOP AGING ACCOUNTS ===');
aging.slice(0, 10).forEach(a => {
  console.log(`${a.client_name}: Outstanding $${(a.total_outstanding/1000).toFixed(0)}k, Overdue $${(a.total_overdue/1000).toFixed(0)}k, Current $${((a.current_amount||0)/1000).toFixed(0)}k`);
});

aging.forEach(a => {
  totalOutstanding += a.total_outstanding || 0;
  totalCurrent += a.current_amount || 0;
  total1to30 += a.days_1_to_30 || 0;
  totalOver365 += a.days_over_365 || 0;
  totalOverdue30Plus += (a.days_31_to_60 || 0) + (a.days_61_to_90 || 0) + (a.days_91_to_120 || 0) + (a.days_121_to_180 || 0) + (a.days_181_to_270 || 0) + (a.days_271_to_365 || 0) + (a.days_over_365 || 0);
});

console.log('\n=== FINANCIAL SUMMARY ===');
console.log(`Total Outstanding: $${(totalOutstanding/1000000).toFixed(2)}M`);
console.log(`Current (not yet due): $${(totalCurrent/1000).toFixed(0)}k`);
console.log(`1-30 days: $${(total1to30/1000).toFixed(0)}k`);
console.log(`TRUE Overdue (31+ days): $${(totalOverdue30Plus/1000000).toFixed(2)}M (${Math.round(totalOverdue30Plus/totalOutstanding*100)}%)`);
console.log(`Over 365 days: $${(totalOver365/1000).toFixed(0)}k`);

let dbOverdue = 0;
aging.forEach(a => { dbOverdue += a.total_overdue || 0; });
console.log(`\nDB total_overdue column sum: $${(dbOverdue/1000000).toFixed(2)}M`);
