import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://usoyxsunetvxdjdglkmn.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'sb_secret_tg9qhHtwhKS0rPe_FUgzKA_nOyqLAas'
);

async function debug() {
  // Check clients table
  const { data: clients, error: clientsError } = await supabase
    .from('clients')
    .select('id, canonical_name, display_name')
    .limit(10);

  console.log('=== Clients Table ===');
  if (clientsError) {
    console.log('Error:', clientsError.message);
  } else {
    console.log('Count:', clients?.length || 0);
    clients?.slice(0, 5).forEach(c => console.log(`  ${c.canonical_name} -> ${c.display_name}`));
  }

  // Check CSE profiles for CAM info
  const { data: cses, error: cseError } = await supabase
    .from('cse_profiles')
    .select('name, email, territory, role, title')
    .limit(20);

  console.log('\n=== CSE Profiles ===');
  if (cseError) {
    console.log('Error:', cseError.message);
  } else {
    console.log('Count:', cses?.length || 0);
    cses?.forEach(c => console.log(`  ${c.name} | ${c.role || c.title || 'N/A'} | ${c.territory || 'N/A'}`));
  }

  // Check cse_sales_targets for reference
  const { data: targets, error: targetError } = await supabase
    .from('cse_sales_targets')
    .select('cse_name, territory')
    .eq('fiscal_year', 2026);

  console.log('\n=== CSE Sales Targets ===');
  if (targetError) {
    console.log('Error:', targetError.message);
  } else {
    targets?.forEach(t => console.log(`  ${t.cse_name}: ${t.territory}`));
  }

  // Check territory_strategies table
  const { data: territories, error: terError } = await supabase
    .from('territory_strategies')
    .select('id, cse_name, territory, status')
    .eq('fiscal_year', 2026);

  console.log('\n=== Territory Strategies ===');
  if (terError) {
    console.log('Error:', terError.message);
  } else {
    console.log('Count:', territories?.length || 0);
    territories?.forEach(t => console.log(`  ${t.id}: ${t.cse_name} - ${t.territory} (${t.status})`));
  }

  // Check account_plans table
  const { data: accounts, error: accError } = await supabase
    .from('account_plans')
    .select('id, cam_name, client_name, status')
    .eq('fiscal_year', 2026);

  console.log('\n=== Account Plans ===');
  if (accError) {
    console.log('Error:', accError.message);
  } else {
    console.log('Count:', accounts?.length || 0);
    accounts?.forEach(a => console.log(`  ${a.id}: ${a.cam_name} - ${a.client_name} (${a.status})`));
  }

  // Test delete capability with anon key
  console.log('\n=== Testing Delete (with anon key) ===');
  const anonSupabase = createClient(
    'https://usoyxsunetvxdjdglkmn.supabase.co',
    'sb_publishable_VupUR1u4RXEaXaHIWDb2HQ_w27zpA0x'
  );

  // Try a test delete on a non-existent ID to check permissions
  const { error: deleteTestError } = await anonSupabase
    .from('territory_strategies')
    .delete()
    .eq('id', '00000000-0000-0000-0000-000000000000');

  if (deleteTestError) {
    console.log('Delete test error:', deleteTestError.message);
    console.log('RLS may be blocking deletes with anon key');
  } else {
    console.log('Delete permissions OK (anon key can delete)');
  }
}

debug().catch(console.error);
