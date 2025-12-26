import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verify() {
  console.log('=== Verifying Health Score Fixes ===\n');

  // Check Te Whatu Ora Waikato specifically
  const { data: waikato } = await supabase
    .from('client_health_summary')
    .select('*')
    .eq('client_name', 'Te Whatu Ora Waikato')
    .single();

  console.log('=== Te Whatu Ora Waikato ===');
  console.log('Health Score:', waikato?.health_score);
  console.log('NPS Score:', waikato?.nps_score);
  console.log('Compliance %:', waikato?.compliance_percentage);
  console.log('Working Capital %:', waikato?.working_capital_percentage);
  console.log('Last Refreshed:', waikato?.last_refreshed);

  // Calculate breakdown
  const nps = waikato?.nps_score ?? 0;
  const compliance = waikato?.compliance_percentage ?? 50;
  const wc = waikato?.working_capital_percentage ?? 100;

  console.log('\nHealth Score Breakdown:');
  console.log(`  NPS: (${nps} + 100) / 200 * 40 = ${((nps + 100) / 200 * 40).toFixed(1)} points`);
  console.log(`  Compliance: ${Math.min(100, compliance).toFixed(1)}% / 100 * 50 = ${(Math.min(100, compliance) / 100 * 50).toFixed(1)} points`);
  console.log(`  Working Capital: ${Math.min(100, wc).toFixed(1)}% / 100 * 10 = ${(Math.min(100, wc) / 100 * 10).toFixed(1)} points`);
  console.log(`  TOTAL: ${waikato?.health_score}`);

  // Check raw compliance data via alias
  const { data: rawCompliance } = await supabase
    .from('segmentation_event_compliance')
    .select('client_name, compliance_percentage')
    .eq('year', 2025)
    .in('client_name', ['Te Whatu Ora Waikato', 'Waikato', 'Te Whatu Ora']);

  console.log('\n=== Raw Compliance Data (2025) ===');
  if (rawCompliance && rawCompliance.length > 0) {
    const avg = rawCompliance.reduce((sum, r) => sum + (r.compliance_percentage || 0), 0) / rawCompliance.length;
    console.log(`Found ${rawCompliance.length} entries averaging ${avg.toFixed(1)}%`);
    console.log('Client names:', [...new Set(rawCompliance.map(r => r.client_name))].join(', '));
  } else {
    console.log('No compliance data found');
  }

  // Check aliases for clients still at 50% default
  console.log('\n=== Clients with 50% Default Compliance ===');
  const { data: defaultClients } = await supabase
    .from('client_health_summary')
    .select('client_name, compliance_percentage')
    .eq('compliance_percentage', 50);

  for (const dc of defaultClients || []) {
    console.log(`\n${dc.client_name}:`);

    // Check aliases for this client
    const { data: aliases } = await supabase
      .from('client_name_aliases')
      .select('display_name, canonical_name')
      .eq('canonical_name', dc.client_name)
      .eq('is_active', true);

    console.log('  Aliases:', aliases?.map(a => a.display_name).join(', ') || 'none');

    // Check if compliance data exists under any alias
    const aliasNames = [dc.client_name, ...(aliases?.map(a => a.display_name) || [])];
    const { data: compData } = await supabase
      .from('segmentation_event_compliance')
      .select('client_name')
      .eq('year', 2025)
      .in('client_name', aliasNames);

    console.log('  Compliance data found under:', compData?.map(c => c.client_name).join(', ') || 'none');
  }
}

verify().catch(console.error);
