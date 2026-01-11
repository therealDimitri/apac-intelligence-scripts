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
  // Check burc_cse_targets table
  const targets = await supabase.from('burc_cse_targets').select('*');
  console.log('=== BURC CSE Targets ===');
  targets.data?.forEach(t => {
    console.log(`${t.cse_name} | Role: ${t.role} | Target: $${(t.target_arr || 0).toLocaleString()}`);
  });
}

main();
