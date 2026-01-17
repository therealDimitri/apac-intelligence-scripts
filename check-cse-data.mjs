import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkData() {
  // Get CSE profiles
  const { data: profiles } = await supabase
    .from('cse_profiles')
    .select('full_name, role')
    .eq('active', true)
    .order('full_name');

  console.log('=== CSE PROFILES ===');
  profiles?.forEach(p => console.log(`  ${p.full_name} (${p.role})`));

  // Get distinct cse_name values from clients
  const { data: clients } = await supabase
    .from('clients')
    .select('cse_name, canonical_name')
    .eq('is_active', true)
    .not('cse_name', 'is', null)
    .order('cse_name');

  console.log('\n=== CLIENTS BY CSE_NAME ===');
  const cseMap = new Map();
  clients?.forEach(c => {
    if (!cseMap.has(c.cse_name)) cseMap.set(c.cse_name, []);
    cseMap.get(c.cse_name).push(c.canonical_name);
  });
  for (const [cse, clientList] of cseMap) {
    console.log(`  ${cse}: ${clientList.length} clients`);
  }

  // Check if CSE profile names match cse_name values
  console.log('\n=== NAME MISMATCHES ===');
  const profileNames = new Set(profiles?.map(p => p.full_name) || []);
  const cseNames = new Set(clients?.map(c => c.cse_name) || []);

  console.log('CSE names in clients table not in profiles:');
  for (const name of cseNames) {
    if (!profileNames.has(name)) {
      console.log(`  - ${name}`);
    }
  }

  console.log('\nProfile names not in clients table:');
  for (const name of profileNames) {
    if (!cseNames.has(name)) {
      console.log(`  - ${name}`);
    }
  }

  // Check pipeline opportunities by CSE
  const { data: pipeline } = await supabase
    .from('sales_pipeline_opportunities')
    .select('cse_name, account_name')
    .eq('in_or_out', 'In')
    .neq('forecast_category', 'Omitted')
    .order('cse_name');

  console.log('\n=== PIPELINE BY CSE_NAME ===');
  const pipelineMap = new Map();
  pipeline?.forEach(p => {
    if (!pipelineMap.has(p.cse_name)) pipelineMap.set(p.cse_name, []);
    pipelineMap.get(p.cse_name).push(p.account_name);
  });
  for (const [cse, oppList] of pipelineMap) {
    console.log(`  ${cse}: ${oppList.length} opportunities`);
  }

  // Check if client display_name vs canonical_name
  const { data: clientNames } = await supabase
    .from('clients')
    .select('canonical_name, display_name, cse_name')
    .eq('is_active', true)
    .not('cse_name', 'is', null)
    .order('canonical_name');

  console.log('\n=== CLIENT NAME SAMPLES ===');
  clientNames?.slice(0, 10).forEach(c => {
    console.log(`  Canonical: ${c.canonical_name}`);
    console.log(`  Display:   ${c.display_name || '(none)'}`);
    console.log(`  CSE:       ${c.cse_name}`);
    console.log('');
  });

  // Check Singapore/APAC clients that should belong to Kenny Gan
  console.log('\n=== SINGAPORE/GUAM CLIENTS (potential Kenny Gan assignments) ===');
  const { data: sgClients } = await supabase
    .from('clients')
    .select('id, canonical_name, display_name, cse_name, region')
    .eq('is_active', true)
    .order('canonical_name');

  sgClients?.filter(c => {
    const name = (c.canonical_name || '').toLowerCase();
    return name.includes('singapore') ||
           name.includes('singhealth') ||
           name.includes('ncs') ||
           name.includes('mindef') ||
           name.includes('mount alvernia') ||
           name.includes('changi') ||
           name.includes('kk women') ||
           name.includes('guam') ||
           c.region === 'Singapore' ||
           c.region === 'Guam';
  }).forEach(c => {
    console.log(`  ${c.canonical_name} (CSE: ${c.cse_name || 'UNASSIGNED'})`);
  });
}

checkData().catch(console.error);
