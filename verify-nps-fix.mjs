import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verify() {
  console.log('=== Verifying NPS Fix for All Clients (with Alias Support) ===\n');

  // Get all clients with their NPS data
  const { data: clients } = await supabase
    .from('client_health_summary')
    .select('client_name, nps_score, response_count, health_score')
    .order('client_name');

  // Get all responses
  const { data: allResponses } = await supabase
    .from('nps_responses')
    .select('client_name, score, period, response_date')
    .order('client_name');

  // Get all aliases for bidirectional lookup
  const { data: aliases } = await supabase
    .from('client_name_aliases')
    .select('canonical_name, display_name')
    .eq('is_active', true);

  // Build alias maps
  const displayToCanonical = {};
  const canonicalToDisplays = {};

  aliases?.forEach(a => {
    displayToCanonical[a.display_name] = a.canonical_name;
    if (!canonicalToDisplays[a.canonical_name]) {
      canonicalToDisplays[a.canonical_name] = [];
    }
    canonicalToDisplays[a.canonical_name].push(a.display_name);
  });

  // Function to get all possible names for a client
  function getAllNamesForClient(clientName) {
    const names = new Set([clientName]);

    // If this is a display_name, add canonical and all peer display_names
    if (displayToCanonical[clientName]) {
      const canonical = displayToCanonical[clientName];
      names.add(canonical);
      canonicalToDisplays[canonical]?.forEach(d => names.add(d));
    }

    // If this is a canonical_name, add all display_names
    if (canonicalToDisplays[clientName]) {
      canonicalToDisplays[clientName].forEach(d => names.add(d));
    }

    return names;
  }

  // Group responses by client (using all possible names)
  function getResponsesForClient(clientName) {
    // SA Health special case
    if (clientName.startsWith('SA Health')) {
      return allResponses?.filter(r => r.client_name.startsWith('SA Health')) || [];
    }

    const allNames = getAllNamesForClient(clientName);
    return allResponses?.filter(r => allNames.has(r.client_name)) || [];
  }

  console.log('%-40s | DB NPS | Expected | Match | Period | Responses', 'Client');
  console.log('-'.repeat(95));

  let matches = 0;
  let mismatches = 0;

  for (const client of clients || []) {
    const responses = getResponsesForClient(client.client_name);

    // Find the most recent period for this client
    const periods = [...new Set(responses.filter(r => r.period && /^Q[1-4]\s+\d{2}$/.test(r.period)).map(r => r.period))];

    // Sort periods by year desc, quarter desc
    periods.sort((a, b) => {
      const [qA, yA] = a.split(' ');
      const [qB, yB] = b.split(' ');
      const yearDiff = parseInt(yB) - parseInt(yA);
      if (yearDiff !== 0) return yearDiff;
      return parseInt(qB.replace('Q', '')) - parseInt(qA.replace('Q', ''));
    });

    const latestPeriod = periods[0] || 'N/A';

    // Calculate expected NPS for latest period
    const latestResponses = responses.filter(r => r.period === latestPeriod);
    let expectedNPS = 0;
    if (latestResponses.length > 0) {
      const promoters = latestResponses.filter(r => r.score >= 9).length;
      const detractors = latestResponses.filter(r => r.score <= 6).length;
      expectedNPS = Math.round(((promoters - detractors) / latestResponses.length) * 100);
    }

    const dbNPS = client.nps_score || 0;
    const isMatch = dbNPS === expectedNPS;

    if (isMatch) matches++;
    else mismatches++;

    const matchStr = isMatch ? '✓' : '✗';
    console.log(`${client.client_name.padEnd(40)} | ${String(dbNPS).padStart(6)} | ${String(expectedNPS).padStart(8)} | ${matchStr.padStart(5)} | ${latestPeriod.padStart(6)} | ${latestResponses.length}`);
  }

  console.log('\n=== Summary ===');
  console.log('Matches:', matches);
  console.log('Mismatches:', mismatches);

  if (mismatches === 0) {
    console.log('\n✓ All clients are using the correct NPS from their latest period!');
  }
}

verify().catch(console.error);
