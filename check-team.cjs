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
  // Check team_members table
  const team = await supabase.from('team_members').select('*');
  console.log('=== Team Members ===');
  team.data?.forEach(m => {
    console.log(`${m.name} | Role: ${m.role} | Active: ${m.is_active}`);
  });
}

main();
