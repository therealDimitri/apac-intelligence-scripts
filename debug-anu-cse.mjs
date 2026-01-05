import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function debugAnuAssignment() {
  console.log('=== CSE Client Assignment Debug ===\n');

  // Check cse_profiles for Anu
  const { data: profiles } = await supabase
    .from('cse_profiles')
    .select('*')
    .ilike('name', '%anu%');

  console.log('CSE Profiles matching Anu:', profiles?.length || 0);
  if (profiles) {
    profiles.forEach(p => console.log('  -', p.name, '| Email:', p.email));
  }

  // Check all CSE profiles
  const { data: allProfiles } = await supabase
    .from('cse_profiles')
    .select('id, name, email')
    .order('name');

  console.log('\n=== All CSE Profiles ===');
  if (allProfiles) {
    allProfiles.forEach(p => console.log('  -', p.name));
  }

  // Check event_compliance_summary for CSE distribution
  const { data: compliance } = await supabase
    .from('event_compliance_summary')
    .select('cse, client_name')
    .eq('year', 2025);

  if (compliance) {
    // Group by CSE
    const cseGroups = {};
    compliance.forEach(c => {
      const cse = c.cse || 'Unassigned';
      if (!cseGroups[cse]) cseGroups[cse] = [];
      cseGroups[cse].push(c.client_name);
    });

    console.log('\n=== CSE Client Distribution (2025 Compliance View) ===');
    Object.keys(cseGroups).sort().forEach(cse => {
      console.log(`${cse}: ${cseGroups[cse].length} clients`);
    });

    // Check if Anu has all
    const anuKey = Object.keys(cseGroups).find(k => k.toLowerCase().includes('anu'));
    if (anuKey) {
      console.log(`\n=== Clients assigned to ${anuKey} (first 20) ===`);
      cseGroups[anuKey].slice(0, 20).forEach(c => console.log('  -', c));
      if (cseGroups[anuKey].length > 20) {
        console.log(`  ... and ${cseGroups[anuKey].length - 20} more`);
      }
    }
  }

  // Check client_segmentation table for CSE assignments
  const { data: segmentation } = await supabase
    .from('client_segmentation')
    .select('client_name, cse, segment, year')
    .eq('year', 2025)
    .limit(50);

  if (segmentation) {
    const segCseGroups = {};
    segmentation.forEach(s => {
      const cse = s.cse || 'Unassigned';
      if (!segCseGroups[cse]) segCseGroups[cse] = [];
      segCseGroups[cse].push(s.client_name);
    });

    console.log('\n=== CSE Distribution in client_segmentation (2025, first 50) ===');
    Object.keys(segCseGroups).sort().forEach(cse => {
      console.log(`${cse}: ${segCseGroups[cse].length} clients`);
    });
  }

  // Check if there's a cse_client_assignments table
  const { data: assignments, error: assignErr } = await supabase
    .from('cse_client_assignments')
    .select('*')
    .limit(20);

  if (assignErr) {
    console.log('\n=== cse_client_assignments table ===');
    console.log('Error or table does not exist:', assignErr.message);
  } else if (assignments) {
    console.log('\n=== cse_client_assignments table ===');
    console.log('Records found:', assignments.length);
  }
}

debugAnuAssignment().catch(console.error);
