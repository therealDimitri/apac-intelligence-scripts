import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkStLukesActions() {
  // Get ALL actions and filter for St Luke's variations
  const { data: allActions, error } = await supabase
    .from('actions')
    .select('client, Status');

  if (error) {
    console.log('Error:', error);
    return;
  }

  console.log('Total actions in DB:', allActions?.length);

  // Find all distinct client names that match St Luke's
  const clientNames = new Set();
  allActions?.forEach(a => clientNames.add(a.client));
  console.log('\nClient names containing luke/slmc:');
  [...clientNames].sort().forEach(name => {
    if (name?.toLowerCase().includes('luke') || name?.toLowerCase().includes('slmc')) {
      console.log('  MATCH:', name);
    }
  });

  // Filter for St Luke's variations
  const stLukesActions = allActions?.filter(a =>
    a.client?.toLowerCase().includes('luke') ||
    a.client?.toLowerCase().includes('slmc') ||
    a.client?.toLowerCase().includes('saint luke')
  );

  console.log('\nSt Lukes actions found:', stLukesActions?.length);

  // Group by exact client name
  const byClient = {};
  stLukesActions?.forEach(a => {
    if (!byClient[a.client]) byClient[a.client] = { total: 0, completed: 0 };
    byClient[a.client].total++;
    if (a.Status === 'Completed') byClient[a.client].completed++;
  });
  console.log('\nGrouped by client name:', JSON.stringify(byClient, null, 2));

  // Now check exact match for the materialized view name
  const exactName = "Saint Luke's Medical Centre (SLMC)";
  const exactActions = allActions?.filter(a => a.client === exactName);
  console.log('\nExact match for "' + exactName + '":', exactActions?.length);

  // Also check case-insensitive
  const caseInsensitive = allActions?.filter(a =>
    a.client?.toLowerCase() === exactName.toLowerCase()
  );
  console.log('Case-insensitive match:', caseInsensitive?.length);

  if (caseInsensitive?.length > 0) {
    const completed = caseInsensitive.filter(a => a.Status === 'Completed').length;
    console.log('Completed actions:', completed);
    console.log('Completion %:', Math.round((completed / caseInsensitive.length) * 100) + '%');
  }
}

checkStLukesActions();
