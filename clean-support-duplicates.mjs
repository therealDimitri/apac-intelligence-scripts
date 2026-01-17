#!/usr/bin/env node

/**
 * Clean duplicate support_sla_metrics records
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://usoyxsunetvxdjdglkmn.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'sb_secret_tg9qhHtwhKS0rPe_FUgzKA_nOyqLAas'
);

async function cleanDuplicates() {
  console.log('Checking for duplicate support_sla_metrics records...\n');

  const { data, error } = await supabase
    .from('support_sla_metrics')
    .select('id, client_name, period_end, created_at')
    .order('client_name')
    .order('period_end')
    .order('created_at', { ascending: false });

  if (error) {
    console.log('Error:', error.message);
    return;
  }

  // Group by client + month of period_end (to catch off-by-one dates)
  const grouped = {};
  for (const m of data) {
    const endMonth = m.period_end.substring(0, 7); // YYYY-MM
    const key = `${m.client_name}|${endMonth}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(m);
  }

  // Find duplicates
  const toDelete = [];
  for (const [key, records] of Object.entries(grouped)) {
    if (records.length > 1) {
      console.log(`Duplicate: ${key} - ${records.length} records`);
      // Keep newest, delete older
      toDelete.push(...records.slice(1).map(r => r.id));
    }
  }

  if (toDelete.length > 0) {
    console.log(`\nDeleting ${toDelete.length} duplicates...`);
    const { error: delError } = await supabase
      .from('support_sla_metrics')
      .delete()
      .in('id', toDelete);

    if (delError) {
      console.log('Delete error:', delError.message);
    } else {
      console.log('✅ Duplicates removed');
    }
  } else {
    console.log('No duplicates found');
  }

  // Verify final count
  const { count } = await supabase
    .from('support_sla_metrics')
    .select('*', { count: 'exact', head: true });

  console.log(`\nFinal record count: ${count}`);
}

cleanDuplicates();
