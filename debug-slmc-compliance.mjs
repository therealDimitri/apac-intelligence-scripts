import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function debugSLMC() {
  console.log('=== Debugging SLMC Compliance Mismatch ===\n');

  // 1. Check client_health_summary for SLMC
  console.log('=== 1. client_health_summary Data ===');
  const { data: healthSummary } = await supabase
    .from('client_health_summary')
    .select('client_name, health_score, nps_score, compliance_percentage, compliance_status, working_capital_percentage')
    .ilike('client_name', '%Luke%');

  console.log('Health Summary:');
  healthSummary?.forEach(h => {
    console.log(`  ${h.client_name}:`);
    console.log(`    Health Score: ${h.health_score}`);
    console.log(`    NPS: ${h.nps_score}`);
    console.log(`    Compliance: ${h.compliance_percentage}%`);
    console.log(`    Compliance Status: ${h.compliance_status}`);
    console.log(`    Working Capital: ${h.working_capital_percentage}%`);
  });

  // 2. Check nps_clients for SLMC
  console.log('\n=== 2. nps_clients Entry ===');
  const { data: npsClients } = await supabase
    .from('nps_clients')
    .select('client_name')
    .ilike('client_name', '%Luke%');

  console.log('NPS Clients matching "Luke":');
  npsClients?.forEach(c => console.log(`  "${c.client_name}"`));

  // 3. Check aliases for SLMC
  console.log('\n=== 3. client_name_aliases for SLMC ===');
  const { data: aliases } = await supabase
    .from('client_name_aliases')
    .select('display_name, canonical_name, is_active')
    .or('display_name.ilike.%Luke%,canonical_name.ilike.%Luke%');

  console.log('Aliases:');
  aliases?.forEach(a => {
    console.log(`  "${a.display_name}" → "${a.canonical_name}" (active: ${a.is_active})`);
  });

  // 4. Check raw compliance data - ALL client names containing Luke or SLMC
  console.log('\n=== 4. segmentation_event_compliance (2025) ===');
  const { data: compliance2025 } = await supabase
    .from('segmentation_event_compliance')
    .select('client_name, event_name, attended, compliance_percentage')
    .eq('year', 2025)
    .or('client_name.ilike.%Luke%,client_name.ilike.%SLMC%');

  console.log('Compliance entries matching "Luke" or "SLMC":');
  if (compliance2025 && compliance2025.length > 0) {
    const byClient = {};
    compliance2025.forEach(c => {
      if (!byClient[c.client_name]) byClient[c.client_name] = [];
      byClient[c.client_name].push(c);
    });

    for (const [client, events] of Object.entries(byClient)) {
      console.log(`\n  "${client}" (${events.length} events):`);
      events.forEach(e => {
        console.log(`    - ${e.event_name}: attended=${e.attended}, compliance=${e.compliance_percentage}%`);
      });
      const avgCompliance = events.reduce((sum, e) => sum + (e.compliance_percentage || 0), 0) / events.length;
      console.log(`    → Average compliance: ${avgCompliance.toFixed(1)}%`);
    }
  } else {
    console.log('  No compliance data found');
  }

  // 5. Check ALL unique client names in compliance table
  console.log('\n=== 5. All Unique Client Names in Compliance Table (2025) ===');
  const { data: allCompliance } = await supabase
    .from('segmentation_event_compliance')
    .select('client_name')
    .eq('year', 2025);

  const uniqueClients = [...new Set(allCompliance?.map(c => c.client_name) || [])].sort();
  console.log('All clients with compliance data:');
  uniqueClients.forEach(c => console.log(`  "${c}"`));

  // 6. Check what the UI's compliance calculation uses
  console.log('\n=== 6. Understanding the Mismatch ===');
  console.log('The Health Score modal shows 100% compliance.');
  console.log('The Segmentation Actions card shows 50% compliance.');
  console.log('');
  console.log('Possible causes:');
  console.log('1. Health Score uses client_health_summary (materialized view)');
  console.log('2. Segmentation Actions card queries segmentation_event_compliance directly');
  console.log('3. The alias lookup might NOT be finding the compliance data');
  console.log('4. OR the compliance data exists under a different name');

  // 7. Check exact client name in nps_clients
  const slmcName = npsClients?.[0]?.client_name;
  if (slmcName) {
    console.log(`\n=== 7. Testing Alias Lookup for "${slmcName}" ===`);

    // Check canonical lookup
    const { data: canonicalAliases } = await supabase
      .from('client_name_aliases')
      .select('display_name')
      .eq('canonical_name', slmcName)
      .eq('is_active', true);

    console.log('Canonical lookup (display names):');
    canonicalAliases?.forEach(a => console.log(`  "${a.display_name}"`));

    // Check peer lookup (if slmcName is a display_name)
    const { data: peerLookup } = await supabase
      .from('client_name_aliases')
      .select('canonical_name')
      .eq('display_name', slmcName)
      .eq('is_active', true)
      .single();

    if (peerLookup) {
      console.log(`\nPeer lookup: "${slmcName}" maps to canonical "${peerLookup.canonical_name}"`);

      // Get all display names for that canonical
      const { data: peerAliases } = await supabase
        .from('client_name_aliases')
        .select('display_name')
        .eq('canonical_name', peerLookup.canonical_name)
        .eq('is_active', true);

      console.log('All display names for that canonical:');
      peerAliases?.forEach(a => console.log(`  "${a.display_name}"`));
    }
  }
}

debugSLMC().catch(console.error);
