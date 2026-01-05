import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function debugCAMSetup() {
  console.log('=== CAM Setup Debug ===\n');

  // Check for Anu in any profile tables
  console.log('--- Searching for "Anu" in profiles ---');

  const { data: cseProfiles } = await supabase
    .from('cse_profiles')
    .select('*');

  console.log('\nAll CSE Profiles:');
  if (cseProfiles) {
    cseProfiles.forEach(p => console.log(`  - ${p.name} (${p.email || 'no email'})`));
  }

  // Check if there's a separate CAM table
  const tables = ['cam_profiles', 'client_account_managers', 'account_managers'];
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('*').limit(5);
    if (!error && data) {
      console.log(`\n${table} table exists with ${data.length} records`);
    }
  }

  // Check clients table for region/country fields
  const { data: clients } = await supabase
    .from('clients')
    .select('id, canonical_name, display_name, country, region, cse_name')
    .limit(30);

  if (clients && clients.length > 0) {
    console.log('\n--- Client Regions/Countries ---');

    const regionCounts = {};
    const countryCounts = {};

    clients.forEach(c => {
      const region = c.region || 'No Region';
      const country = c.country || 'No Country';
      regionCounts[region] = (regionCounts[region] || 0) + 1;
      countryCounts[country] = (countryCounts[country] || 0) + 1;
    });

    console.log('\nBy Region:');
    Object.keys(regionCounts).sort().forEach(r => console.log(`  ${r}: ${regionCounts[r]}`));

    console.log('\nBy Country:');
    Object.keys(countryCounts).sort().forEach(c => console.log(`  ${c}: ${countryCounts[c]}`));
  }

  // Check client_health_summary for region distribution
  const { data: healthSummary } = await supabase
    .from('client_health_summary')
    .select('client_name, cse, segment, country, region')
    .limit(50);

  if (healthSummary && healthSummary.length > 0) {
    console.log('\n--- Client Health Summary Regions ---');

    const regionGroups = {};
    healthSummary.forEach(h => {
      const region = h.region || h.country || 'Unknown';
      if (!regionGroups[region]) regionGroups[region] = [];
      regionGroups[region].push(h.client_name);
    });

    Object.keys(regionGroups).sort().forEach(region => {
      console.log(`\n${region} (${regionGroups[region].length} clients):`);
      regionGroups[region].slice(0, 5).forEach(c => console.log(`  - ${c}`));
      if (regionGroups[region].length > 5) {
        console.log(`  ... and ${regionGroups[region].length - 5} more`);
      }
    });
  }

  // Check client_segmentation for similar info
  const { data: segmentation } = await supabase
    .from('client_segmentation')
    .select('client_name, cse, segment, country, region, year')
    .eq('year', 2025)
    .limit(50);

  if (segmentation && segmentation.length > 0) {
    console.log('\n--- 2025 Segmentation by Country ---');

    const countryGroups = {};
    segmentation.forEach(s => {
      const country = s.country || 'Unknown';
      if (!countryGroups[country]) countryGroups[country] = [];
      countryGroups[country].push({ name: s.client_name, cse: s.cse });
    });

    Object.keys(countryGroups).sort().forEach(country => {
      console.log(`\n${country} (${countryGroups[country].length} clients):`);
      countryGroups[country].slice(0, 3).forEach(c => console.log(`  - ${c.name} (CSE: ${c.cse || 'None'})`));
    });
  }

  console.log('\n--- Recommended Setup ---');
  console.log('To assign Anu and Nikki as CAMs by region:');
  console.log('  1. Add Anu to cse_profiles (or create cam_profiles table)');
  console.log('  2. Assign clients by country:');
  console.log('     - Anu: Australia, New Zealand');
  console.log('     - Nikki: Asia (Singapore, Malaysia, etc.), Guam');
}

debugCAMSetup().catch(console.error);
