import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkActionNameMismatches() {
  // Get all clients from materialized view
  const { data: clients, error: clientsError } = await supabase
    .from('client_health_summary')
    .select('client_name, total_actions_count, completed_actions_count');

  if (clientsError) {
    console.log('Error fetching clients:', clientsError);
    return;
  }

  // Get all actions
  const { data: allActions, error: actionsError } = await supabase
    .from('actions')
    .select('client, Status');

  if (actionsError) {
    console.log('Error fetching actions:', actionsError);
    return;
  }

  console.log('=== Checking for Action Name Mismatches ===\n');
  console.log('Total clients:', clients.length);
  console.log('Total actions:', allActions.length);
  console.log('\n--- Clients with Mismatched Action Counts ---\n');

  const mismatches = [];

  clients.forEach(client => {
    // Get actions matching exact client name (what the front-end does)
    const exactMatch = allActions.filter(a =>
      a.client?.toLowerCase() === client.client_name?.toLowerCase()
    );

    const dbTotal = client.total_actions_count || 0;
    const liveTotal = exactMatch.length;
    const liveCompleted = exactMatch.filter(a => a.Status === 'Completed').length;

    // Check if there's a mismatch
    if (dbTotal !== liveTotal) {
      mismatches.push({
        name: client.client_name,
        dbTotal,
        dbCompleted: client.completed_actions_count,
        liveTotal,
        liveCompleted,
        diff: liveTotal - dbTotal
      });
    }
  });

  // Sort by difference
  mismatches.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  if (mismatches.length === 0) {
    console.log('No mismatches found!');
  } else {
    console.log(`Found ${mismatches.length} clients with mismatched action counts:\n`);
    mismatches.forEach(m => {
      console.log(`${m.name}`);
      console.log(`  DB:   ${m.dbCompleted}/${m.dbTotal} (cached in materialized view)`);
      console.log(`  Live: ${m.liveCompleted}/${m.liveTotal} (exact name match)`);
      console.log(`  Diff: ${m.diff > 0 ? '+' : ''}${m.diff} actions`);
      console.log('');
    });
  }

  // Now find all unique client names in actions that are NOT in the clients list
  console.log('\n--- Action Client Names Not in Client List ---\n');
  const clientNamesLower = new Set(clients.map(c => c.client_name?.toLowerCase()));
  const unmatchedActionClients = new Set();

  allActions.forEach(a => {
    const actionClientLower = a.client?.toLowerCase();
    if (actionClientLower && !clientNamesLower.has(actionClientLower)) {
      unmatchedActionClients.add(a.client);
    }
  });

  if (unmatchedActionClients.size === 0) {
    console.log('All action client names match client list!');
  } else {
    console.log(`Found ${unmatchedActionClients.size} action client names not in client list:`);
    [...unmatchedActionClients].sort().forEach(name => {
      const count = allActions.filter(a => a.client === name).length;
      console.log(`  - "${name}" (${count} actions)`);
    });
  }

  // Now specifically check the problem clients
  console.log('\n\n=== Detailed Check for Problem Clients ===\n');

  const problemClients = ['luke', 'singhealth', 'wa health', 'sa health'];

  for (const searchTerm of problemClients) {
    console.log(`\n--- Searching for "${searchTerm}" ---`);

    // Find matching client in DB
    const matchingClient = clients.find(c =>
      c.client_name?.toLowerCase().includes(searchTerm)
    );

    if (matchingClient) {
      console.log(`DB Client: "${matchingClient.client_name}"`);
      console.log(`  Actions: ${matchingClient.completed_actions_count}/${matchingClient.total_actions_count}`);
    } else {
      console.log('No matching client in DB');
    }

    // Find all action variations
    const matchingActions = allActions.filter(a =>
      a.client?.toLowerCase().includes(searchTerm)
    );

    if (matchingActions.length > 0) {
      console.log(`\nAction name variations:`);
      const byName = {};
      matchingActions.forEach(a => {
        if (!byName[a.client]) byName[a.client] = { total: 0, completed: 0 };
        byName[a.client].total++;
        if (a.Status === 'Completed') byName[a.client].completed++;
      });

      Object.entries(byName).forEach(([name, counts]) => {
        console.log(`  - "${name}": ${counts.completed}/${counts.total}`);
      });
    }
  }
}

checkActionNameMismatches();
