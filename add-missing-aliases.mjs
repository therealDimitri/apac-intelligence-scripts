import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function addMissingAliases() {
  console.log('=== Adding Missing Aliases for Compliance Matching ===\n');

  // These map compliance table names to nps_clients names
  // The canonical_name should be the nps_clients.client_name
  const newAliases = [
    // Compliance name -> nps_clients name
    { display_name: 'Singapore Health (SingHealth)', canonical_name: 'SingHealth', description: 'Compliance table name for SingHealth' },
    { display_name: 'Royal Victorian Eye and Ear Hospital (RVEEH)', canonical_name: 'Royal Victorian Eye and Ear Hospital', description: 'Compliance table name with abbreviation' },

    // Also add self-referential entries for clients that ARE in nps_clients
    { display_name: 'SingHealth', canonical_name: 'SingHealth', description: 'Self-reference for SingHealth' },
    { display_name: 'Royal Victorian Eye and Ear Hospital', canonical_name: 'Royal Victorian Eye and Ear Hospital', description: 'Self-reference for RVEEH' },
    { display_name: 'SA Health (iPro)', canonical_name: 'SA Health (iPro)', description: 'Self-reference for SA Health iPro' },
    { display_name: 'SA Health (iQemo)', canonical_name: 'SA Health (iQemo)', description: 'Self-reference for SA Health iQemo' },
    { display_name: 'SA Health (Sunrise)', canonical_name: 'SA Health (Sunrise)', description: 'Self-reference for SA Health Sunrise' },
    { display_name: 'WA Health', canonical_name: 'WA Health', description: 'Self-reference for WA Health' },
    { display_name: 'Western Health', canonical_name: 'Western Health', description: 'Self-reference for Western Health' },
    { display_name: 'Gippsland Health Alliance (GHA)', canonical_name: 'Gippsland Health Alliance (GHA)', description: 'Self-reference for GHA' },
    { display_name: 'NCS/MinDef Singapore', canonical_name: 'NCS/MinDef Singapore', description: 'Self-reference for MinDef' },
    { display_name: 'Guam Regional Medical City (GRMC)', canonical_name: 'Guam Regional Medical City (GRMC)', description: 'Self-reference for GRMC' },
    { display_name: "Saint Luke's Medical Centre (SLMC)", canonical_name: "Saint Luke's Medical Centre (SLMC)", description: 'Self-reference for SLMC' },
    { display_name: 'Grampians Health', canonical_name: 'Grampians Health', description: 'Self-reference for Grampians' },
  ];

  for (const alias of newAliases) {
    // Check if already exists
    const { data: existing } = await supabase
      .from('client_name_aliases')
      .select('id')
      .eq('display_name', alias.display_name)
      .eq('canonical_name', alias.canonical_name)
      .single();

    if (existing) {
      console.log(`✓ Already exists: "${alias.display_name}" → "${alias.canonical_name}"`);
      continue;
    }

    // Insert new alias
    const { error } = await supabase
      .from('client_name_aliases')
      .insert({
        ...alias,
        is_active: true,
      });

    if (error) {
      console.error(`✗ Error adding "${alias.display_name}":`, error.message);
    } else {
      console.log(`+ Added: "${alias.display_name}" → "${alias.canonical_name}"`);
    }
  }

  console.log('\n=== Done ===');
  console.log('Now re-run the migration to refresh the view with the new aliases.');
}

addMissingAliases().catch(console.error);
