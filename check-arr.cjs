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
  // Get all client ARR data
  const arr = await supabase.from('client_arr').select('client_name, arr_usd').order('arr_usd', { ascending: false });
  
  console.log('=== All Client ARR (sorted by value) ===');
  let total = 0;
  arr.data?.forEach(c => {
    console.log(`${c.client_name}: $${(c.arr_usd || 0).toLocaleString()}`);
    total += c.arr_usd || 0;
  });
  console.log(`\nTotal: $${total.toLocaleString()}`);
  
  // Check for Asian clients specifically
  console.log('\n=== Looking for Asian/Guam clients in ARR ===');
  const asianKeywords = ['singapore', 'sing', 'ncs', 'philippines', 'luke', 'guam', 'mount alvernia', 'boon'];
  arr.data?.forEach(c => {
    const name = c.client_name?.toLowerCase() || '';
    if (asianKeywords.some(k => name.includes(k))) {
      console.log(`${c.client_name}: $${(c.arr_usd || 0).toLocaleString()}`);
    }
  });
}

main();
