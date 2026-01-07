import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env vars
dotenv.config({ path: resolve(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkDuplicates() {
  // Get all active pipeline items
  const { data, error } = await supabase
    .from('burc_pipeline_detail')
    .select('*')
    .eq('fiscal_year', 2026)
    .eq('pipeline_status', 'active')
    .order('client_name', { ascending: true });

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Total active items:', data.length);
  console.log('');

  // Find duplicates by client_name + deal_name
  const duplicateMap = {};
  for (const item of data) {
    const key = `${item.client_name}|${item.deal_name}`;
    if (!duplicateMap[key]) {
      duplicateMap[key] = [];
    }
    duplicateMap[key].push(item);
  }

  // Filter to show only duplicates
  const duplicates = Object.entries(duplicateMap)
    .filter(([key, items]) => items.length > 1);

  console.log('Exact duplicate groups found:', duplicates.length);
  console.log('');

  // Check for similar deals by client
  console.log('=== Deals by Client (showing clients with multiple deals) ===');
  console.log('');

  const byClient = {};
  for (const item of data) {
    if (!byClient[item.client_name]) {
      byClient[item.client_name] = [];
    }
    byClient[item.client_name].push(item);
  }

  const sortedClients = Object.entries(byClient).sort((a, b) => b[1].length - a[1].length);

  for (const [client, deals] of sortedClients) {
    if (deals.length > 1) {
      const totalValue = deals.reduce((sum, d) => sum + (d.net_booking || 0), 0);
      console.log(`${client} (${deals.length} deals, $${totalValue.toLocaleString()})`);
      for (const deal of deals) {
        console.log(`  - ${deal.deal_name} | ${deal.section_color} | $${(deal.net_booking || 0).toLocaleString()}`);
      }
      console.log('');
    }
  }

  // Section summary
  console.log('=== Items by Section ===');
  const bySection = {};
  for (const item of data) {
    const sec = item.section_color || 'unknown';
    if (!bySection[sec]) {
      bySection[sec] = { count: 0, value: 0 };
    }
    bySection[sec].count++;
    bySection[sec].value += item.net_booking || 0;
  }

  for (const [section, stats] of Object.entries(bySection)) {
    console.log(`${section}: ${stats.count} deals, $${stats.value.toLocaleString()}`);
  }

  console.log('');
  const totalValue = data.reduce((sum, d) => sum + (d.net_booking || 0), 0);
  console.log('Total items:', data.length);
  console.log('Total pipeline value: $' + totalValue.toLocaleString());

  // Check for any items with same net_booking value (potential duplicates)
  console.log('');
  console.log('=== Items with Same Value (potential duplicates) ===');
  const byValue = {};
  for (const item of data) {
    const val = item.net_booking || 0;
    if (val > 10000) { // Only check significant values
      if (!byValue[val]) {
        byValue[val] = [];
      }
      byValue[val].push(item);
    }
  }

  const valueDuplicates = Object.entries(byValue)
    .filter(([val, items]) => items.length > 1)
    .sort((a, b) => parseFloat(b[0]) - parseFloat(a[0]));

  if (valueDuplicates.length > 0) {
    for (const [value, items] of valueDuplicates.slice(0, 10)) {
      console.log(`$${parseFloat(value).toLocaleString()}:`);
      for (const item of items) {
        console.log(`  - ${item.client_name} | ${item.deal_name} | ${item.section_color}`);
      }
    }
  } else {
    console.log('No items with matching values found.');
  }
}

checkDuplicates();
