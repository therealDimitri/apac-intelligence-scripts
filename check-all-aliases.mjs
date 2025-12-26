import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkAliases() {
  console.log('=== All Client Name Aliases ===\n');

  const { data: aliases } = await supabase
    .from('client_name_aliases')
    .select('*')
    .order('canonical_name');

  console.log('Current aliases:');
  for (const alias of aliases || []) {
    console.log(`  "${alias.display_name}" → "${alias.canonical_name}"`);
  }

  console.log('\n=== Compliance Name Mismatches ===\n');

  // Get all client names from nps_clients
  const { data: clients } = await supabase
    .from('nps_clients')
    .select('client_name')
    .order('client_name');

  // Get all unique client names from compliance
  const { data: complianceNames } = await supabase
    .from('segmentation_event_compliance')
    .select('client_name')
    .order('client_name');

  const uniqueComplianceNames = [...new Set(complianceNames?.map(c => c.client_name) || [])];
  const clientNames = clients?.map(c => c.client_name) || [];

  console.log('Compliance names NOT in nps_clients:');
  for (const compName of uniqueComplianceNames) {
    if (!clientNames.includes(compName)) {
      // Check if there's an alias
      const alias = aliases?.find(a => a.display_name === compName);
      if (alias) {
        console.log(`  "${compName}" → alias exists → "${alias.canonical_name}"`);
      } else {
        // Try to find a potential match
        const potentialMatch = clientNames.find(cn =>
          cn.toLowerCase().includes(compName.toLowerCase()) ||
          compName.toLowerCase().includes(cn.toLowerCase().replace(/\(.*\)/g, '').trim())
        );
        if (potentialMatch) {
          console.log(`  ❌ "${compName}" → NEEDS ALIAS → suggest: "${potentialMatch}"`);
        } else {
          console.log(`  ❌ "${compName}" → NEEDS ALIAS → no obvious match found`);
        }
      }
    }
  }

  console.log('\n=== nps_clients names NOT in compliance ===');
  for (const clientName of clientNames) {
    const hasCompliance = uniqueComplianceNames.some(cn => cn === clientName);
    if (!hasCompliance) {
      // Check for alias
      const reverseAlias = aliases?.find(a => a.canonical_name === clientName);
      const aliasMatch = reverseAlias ? uniqueComplianceNames.find(cn => cn === reverseAlias.display_name) : null;
      if (aliasMatch) {
        console.log(`  "${clientName}" → found via alias "${aliasMatch}"`);
      } else {
        console.log(`  "${clientName}" → NO COMPLIANCE DATA (may need alias)`);
      }
    }
  }
}

checkAliases().catch(console.error);
