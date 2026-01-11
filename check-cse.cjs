const { createClient } = require('@supabase/supabase-js');
const { readFileSync } = require('fs');

// Load env from .env.local
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
  // Get all clients grouped by CSE
  const all = await supabase.from('client_segmentation').select('client_name, cse_name');

  const byCSE = {};
  all.data?.forEach(c => {
    const cse = c.cse_name || 'Unassigned';
    if (!byCSE[cse]) byCSE[cse] = [];
    byCSE[cse].push(c.client_name);
  });

  console.log('=== Clients by CSE ===');
  for (const [cse, clients] of Object.entries(byCSE).sort()) {
    console.log(`\n${cse} (${clients.length} clients):`);
    clients.forEach(c => console.log('  -', c));
  }
}

main();
