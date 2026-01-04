import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const missingAliases = [
  // St Luke's variations
  { display_name: "St Luke's Medical Center Global City Inc", canonical_name: "Saint Luke's Medical Centre (SLMC)", description: "Philippines branch variant" },

  // SingHealth variations
  { display_name: "SingHealth Sunrise", canonical_name: "SingHealth", description: "SingHealth Sunrise system variant" },
  { display_name: "Singapore Health Services Pte Ltd", canonical_name: "SingHealth", description: "Corporate entity name" },
  { display_name: "National Cancer Centre Of Singapore", canonical_name: "SingHealth", description: "SingHealth member hospital (no Pte Ltd)" },
  { display_name: "CGH iPro", canonical_name: "SingHealth", description: "Changi General Hospital iPro system" },
  { display_name: "KKH iPro", canonical_name: "SingHealth", description: "KK Hospital iPro system" },
  { display_name: "NHCS iPro", canonical_name: "SingHealth", description: "National Heart Centre iPro system" },
  { display_name: "SGH iPro", canonical_name: "SingHealth", description: "Singapore General Hospital iPro system" },
  { display_name: "SKH iPro", canonical_name: "SingHealth", description: "Sengkang Hospital iPro system" },

  // GHA variations
  { display_name: "GHA Regional Opal", canonical_name: "Gippsland Health Alliance (GHA)", description: "GHA Regional Opal system" },

  // RVEEH variations
  { display_name: "The Royal Victorian Eye and Ear Hospital", canonical_name: "Royal Victorian Eye and Ear Hospital", description: "With 'The' prefix" },

  // Ministry of Defence
  { display_name: "Ministry of Defence, Singapore", canonical_name: "NCS/MinDef Singapore", description: "MinDef full name variant" },
];

async function addMissingAliases() {
  console.log('=== Adding Missing Action Client Aliases ===\n');

  for (const alias of missingAliases) {
    // Check if alias already exists
    const { data: existing } = await supabase
      .from('client_name_aliases')
      .select('id')
      .eq('display_name', alias.display_name)
      .single();

    if (existing) {
      console.log(`✓ Already exists: "${alias.display_name}"`);
      continue;
    }

    // Insert new alias
    const { error } = await supabase
      .from('client_name_aliases')
      .insert({
        display_name: alias.display_name,
        canonical_name: alias.canonical_name,
        description: alias.description,
        is_active: true
      });

    if (error) {
      console.log(`✗ Error adding "${alias.display_name}":`, error.message);
    } else {
      console.log(`✓ Added: "${alias.display_name}" → "${alias.canonical_name}"`);
    }
  }

  console.log('\n=== Done ===');
}

addMissingAliases();
