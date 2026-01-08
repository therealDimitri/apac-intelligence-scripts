import { createClient } from '@supabase/supabase-js';

// Test with ANON key (same as frontend)
const anonSupabase = createClient(
  'https://usoyxsunetvxdjdglkmn.supabase.co',
  'sb_publishable_VupUR1u4RXEaXaHIWDb2HQ_w27zpA0x'
);

// Test with SERVICE ROLE key
const adminSupabase = createClient(
  'https://usoyxsunetvxdjdglkmn.supabase.co',
  'sb_secret_tg9qhHtwhKS0rPe_FUgzKA_nOyqLAas'
);

async function testDelete() {
  // Get current territory strategies
  console.log('=== Current Territory Strategies ===');
  const { data: before, error: beforeErr } = await adminSupabase
    .from('territory_strategies')
    .select('id, cse_name, territory')
    .eq('fiscal_year', 2026);

  if (beforeErr) {
    console.log('Error fetching:', beforeErr.message);
    return;
  }

  console.log('Before:', before?.length, 'records');
  before?.forEach(t => console.log(`  ${t.id.slice(0, 8)}... ${t.cse_name || 'N/A'} - ${t.territory || 'N/A'}`));

  if (!before || before.length === 0) {
    console.log('No records to test delete');
    return;
  }

  // Pick one with empty cse_name to delete
  const toDelete = before.find(t => !t.cse_name) || before[before.length - 1];
  console.log(`\n=== Testing DELETE on: ${toDelete.id} ===`);

  // Test with ANON key
  console.log('\n--- Using ANON key (like frontend) ---');
  const { data: anonData, error: anonError, count: anonCount } = await anonSupabase
    .from('territory_strategies')
    .delete()
    .eq('id', toDelete.id)
    .select();

  console.log('Response data:', anonData);
  console.log('Error:', anonError);
  console.log('Count:', anonCount);

  // Check if it was actually deleted
  const { data: after, error: afterErr } = await adminSupabase
    .from('territory_strategies')
    .select('id, cse_name, territory')
    .eq('fiscal_year', 2026);

  console.log('\n=== After Delete ===');
  console.log('After:', after?.length, 'records');

  if (before.length === after?.length) {
    console.log('\n⚠️ DELETE DID NOT WORK - Same number of records');
    console.log('The ANON key may not have delete permissions');
  } else {
    console.log('\n✅ DELETE WORKED - Record was removed');
  }
}

testDelete().catch(console.error);
