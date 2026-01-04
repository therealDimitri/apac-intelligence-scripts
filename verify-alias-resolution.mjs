import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyAliasResolution() {
  console.log('=== Verifying Alias Resolution for Actions ===\n');

  // Get all aliases
  const { data: aliases, error: aliasError } = await supabase
    .from('client_name_aliases')
    .select('display_name, canonical_name')
    .eq('is_active', true);

  if (aliasError) {
    console.log('Error fetching aliases:', aliasError);
    return;
  }

  const aliasMap = new Map();
  aliases.forEach(a => aliasMap.set(a.display_name, a.canonical_name));
  console.log(`Loaded ${aliasMap.size} active aliases\n`);

  function resolveClientName(displayName) {
    const cleaned = displayName?.trim().replace(/[,;.]+$/, '') || '';
    return aliasMap.get(cleaned) || cleaned;
  }

  // Get all clients from materialized view
  const { data: clients } = await supabase
    .from('client_health_summary')
    .select('client_name, total_actions_count, completed_actions_count');

  // Get all actions
  const { data: allActions } = await supabase
    .from('actions')
    .select('client, Status');

  console.log('--- Clients with Actions After Alias Resolution ---\n');

  for (const client of clients) {
    // Use alias resolution to match actions
    const clientActions = allActions.filter(a => {
      const resolvedName = resolveClientName(a.client);
      return resolvedName.toLowerCase() === client.client_name.toLowerCase();
    });

    if (clientActions.length === 0 && client.total_actions_count === 0) {
      continue; // Skip clients with no actions
    }

    const liveCompleted = clientActions.filter(a => a.Status === 'Completed').length;
    const liveTotal = clientActions.length;
    const dbCompleted = client.completed_actions_count || 0;
    const dbTotal = client.total_actions_count || 0;

    const match = liveTotal === dbTotal && liveCompleted === dbCompleted;
    const status = match ? '✓' : '✗';

    console.log(`${status} ${client.client_name}`);
    console.log(`    DB (cached):  ${dbCompleted}/${dbTotal}`);
    console.log(`    Live (alias): ${liveCompleted}/${liveTotal}`);
    if (!match) {
      console.log(`    DIFF: ${liveTotal - dbTotal} total, ${liveCompleted - dbCompleted} completed`);
    }
    console.log('');
  }

  // Check for unmatched action client names
  console.log('\n--- Unmatched Action Client Names (need aliases) ---\n');
  const clientNamesLower = new Set(clients.map(c => c.client_name?.toLowerCase()));
  const unmatchedActions = new Map();

  allActions.forEach(a => {
    const resolvedName = resolveClientName(a.client);
    if (!clientNamesLower.has(resolvedName.toLowerCase())) {
      const key = a.client;
      if (!unmatchedActions.has(key)) {
        unmatchedActions.set(key, { original: a.client, resolved: resolvedName, count: 0 });
      }
      unmatchedActions.get(key).count++;
    }
  });

  if (unmatchedActions.size === 0) {
    console.log('All action client names match after alias resolution!');
  } else {
    console.log(`Found ${unmatchedActions.size} unmatched action client names:`);
    for (const [key, info] of unmatchedActions) {
      console.log(`  - "${info.original}" → "${info.resolved}" (${info.count} actions)`);
    }
  }
}

verifyAliasResolution();
