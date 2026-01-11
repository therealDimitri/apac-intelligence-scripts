const { createClient } = require('@supabase/supabase-js');
const { readFileSync } = require('fs');

// Load env
const envContent = readFileSync('.env.local', 'utf8');
const envLines = envContent.split('\n');
for (const line of envLines) {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  // Check cse_profiles table
  const profiles = await supabase.from('cse_profiles').select('full_name, name_aliases, role, region');
  console.log('=== CSE Profiles ===');
  profiles.data?.forEach(p => {
    const aliases = p.name_aliases ? p.name_aliases.join(', ') : 'none';
    console.log(p.full_name + ' | Role: ' + p.role + ' | Region: ' + p.region + ' | Aliases: ' + aliases);
  });

  // List all unique CSE names in client_segmentation
  const seg = await supabase.from('client_segmentation').select('cse_name');
  const uniqueCSE = [...new Set(seg.data?.map(s => s.cse_name).filter(Boolean))];
  console.log('\n=== CSE Names in client_segmentation ===');
  uniqueCSE.forEach(name => console.log('-', name));

  // Find mismatches
  const profileNames = new Set(profiles.data?.map(p => p.full_name.toLowerCase()));
  const profileAliases = new Set();
  profiles.data?.forEach(p => {
    if (p.name_aliases) {
      p.name_aliases.forEach(a => profileAliases.add(a.toLowerCase()));
    }
  });

  console.log('\n=== CSE in segmentation but NOT in profiles ===');
  uniqueCSE.forEach(name => {
    const lowerName = name.toLowerCase();
    if (!profileNames.has(lowerName) && !profileAliases.has(lowerName)) {
      console.log('-', name);
    }
  });
}

main();
