import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data: arr } = await supabase
  .from('burc_arr_tracking')
  .select('*')
  .order('client_name');

console.log('=== ALL ARR ENTRIES ===');
console.log('Total entries:', arr?.length);
console.log('');

// Group by client name to find duplicates
const byClient = {};
arr?.forEach(entry => {
  const name = entry.client_name;
  if (!byClient[name]) byClient[name] = [];
  byClient[name].push(entry);
});

// Show all entries with their values
let totalARR = 0;
Object.entries(byClient).sort().forEach(([name, entries]) => {
  const isDuplicate = entries.length > 1;
  entries.forEach((e, i) => {
    const prefix = isDuplicate ? (i === 0 ? '⚠️ DUP: ' : '   DUP: ') : '';
    console.log(prefix + name + ' - USD $' + (e.arr_usd || 0).toLocaleString());
    totalARR += (e.arr_usd || 0);
  });
});

console.log('');
console.log('=== DUPLICATES SUMMARY ===');
const duplicates = Object.entries(byClient).filter(([, entries]) => entries.length > 1);
if (duplicates.length === 0) {
  console.log('No duplicates found');
} else {
  duplicates.forEach(([name, entries]) => {
    console.log(name + ': ' + entries.length + ' entries');
    entries.forEach(e => {
      console.log('  - ID: ' + e.id + ', ARR: USD $' + (e.arr_usd || 0).toLocaleString());
    });
  });
}

console.log('');
console.log('Total ARR (sum of all entries): USD $' + totalARR.toLocaleString());
