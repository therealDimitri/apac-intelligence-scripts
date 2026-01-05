import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  // Check cse_client_assignments fully
  const { data: assignments, error: assignErr } = await supabase
    .from('cse_client_assignments')
    .select('*');

  if (assignErr) {
    console.log('Error fetching cse_client_assignments:', assignErr.message);
  } else if (assignments) {
    console.log('=== All CSE Client Assignments ===');
    console.log('Total:', assignments.length);

    // Group by CSE
    const groups = {};
    assignments.forEach(a => {
      const cse = a.cse_name || a.cse_id || 'Unknown';
      if (groups[cse] === undefined) groups[cse] = [];
      groups[cse].push(a.client_name);
    });

    console.log('\nDistribution:');
    Object.keys(groups).sort().forEach(cse => {
      console.log(`${cse}: ${groups[cse].length} clients`);
    });

    // Look for Anu
    const anuKey = Object.keys(groups).find(k => k.toLowerCase().includes('anu'));
    if (anuKey) {
      console.log(`\n=== Clients assigned to ${anuKey} ===`);
      groups[anuKey].forEach(c => console.log('  -', c));
    }
  }

  // Check clients table for CSE field
  const { data: clients, error: clientErr } = await supabase
    .from('clients')
    .select('*')
    .limit(5);

  if (clientErr) {
    console.log('\nError fetching clients:', clientErr.message);
  } else if (clients && clients.length > 0) {
    console.log('\n=== Clients table columns ===');
    console.log('Columns:', Object.keys(clients[0]).join(', '));
  }

  // Check if there's a client_health_summary view
  const { data: healthSummary, error: healthErr } = await supabase
    .from('client_health_summary')
    .select('client_name, cse, segment')
    .limit(30);

  if (healthErr) {
    console.log('\nError fetching client_health_summary:', healthErr.message);
  } else if (healthSummary) {
    console.log('\n=== client_health_summary CSE Distribution ===');
    const cseCounts = {};
    healthSummary.forEach(c => {
      const cse = c.cse || 'None';
      cseCounts[cse] = (cseCounts[cse] || 0) + 1;
    });
    Object.keys(cseCounts).sort().forEach(k => console.log(`${k}: ${cseCounts[k]}`));
  }

  // Check client_segmentation for latest year
  const { data: segmentation, error: segErr } = await supabase
    .from('client_segmentation')
    .select('client_name, cse, segment, year')
    .order('year', { ascending: false })
    .limit(50);

  if (segErr) {
    console.log('\nError fetching client_segmentation:', segErr.message);
  } else if (segmentation) {
    console.log('\n=== client_segmentation CSE Distribution (latest) ===');
    const cseCounts = {};
    segmentation.forEach(s => {
      const cse = s.cse || 'None';
      cseCounts[cse] = (cseCounts[cse] || 0) + 1;
    });
    Object.keys(cseCounts).sort().forEach(k => console.log(`${k}: ${cseCounts[k]}`));

    // Look for Anu
    const anuClients = segmentation.filter(s => s.cse && s.cse.toLowerCase().includes('anu'));
    if (anuClients.length > 0) {
      console.log('\n=== Clients with Anu in CSE field ===');
      anuClients.forEach(c => console.log(`  - ${c.client_name} (${c.year})`));
    }
  }
}

check().catch(console.error);
