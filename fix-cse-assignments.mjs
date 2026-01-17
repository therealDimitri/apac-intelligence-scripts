import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixAssignments() {
  console.log('=== FIXING CSE ASSIGNMENTS ===\n');

  // Singapore/Guam clients should be assigned to Kenny Gan
  const singaporeClients = [
    'Changi General Hospital',
    'Guam Regional Medical City (GRMC)',
    "KK Women's and Children's Hospital",
    'Mount Alvernia Hospital',
    'National Cancer Centre Of Singapore Pte Ltd',
    'National Heart Centre Of Singapore Pte Ltd',
    'NCS PTE Ltd',
    'NCS/MinDef Singapore',
    'Singapore General Hospital Pte Ltd',
    'SingHealth',
  ];

  console.log('Updating Singapore/Guam clients to Kenny Gan...');
  const { data: sgUpdated, error: sgError } = await supabase
    .from('clients')
    .update({ cse_name: 'Kenny Gan' })
    .in('canonical_name', singaporeClients)
    .select('canonical_name');

  if (sgError) {
    console.error('Error updating Singapore clients:', sgError);
  } else {
    console.log(`Updated ${sgUpdated?.length || 0} Singapore/Guam clients`);
    sgUpdated?.forEach(c => console.log(`  ✓ ${c.canonical_name}`));
  }

  // Verify the update
  console.log('\n=== VERIFICATION ===');
  const { data: verified } = await supabase
    .from('clients')
    .select('cse_name, canonical_name')
    .eq('is_active', true)
    .not('cse_name', 'is', null)
    .order('cse_name');

  const cseMap = new Map();
  verified?.forEach(c => {
    if (!cseMap.has(c.cse_name)) cseMap.set(c.cse_name, []);
    cseMap.get(c.cse_name).push(c.canonical_name);
  });
  for (const [cse, clientList] of cseMap) {
    console.log(`${cse}: ${clientList.length} clients`);
  }
}

fixAssignments().catch(console.error);
