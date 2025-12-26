import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function debugHealthScores() {
  console.log('=== Health Score Debug Report ===\n');

  // Get all clients from client_health_summary
  const { data: clients, error } = await supabase
    .from('client_health_summary')
    .select('client_name, health_score, nps_score, compliance_percentage, working_capital_percentage')
    .order('client_name');

  if (error) {
    console.error('Error fetching clients:', error);
    return;
  }

  console.log('Checking formula: NPS (40pts) + Compliance (50pts) + Working Capital (10pts)\n');
  console.log('Client Name | DB Score | Calculated | NPS | Compliance | WC | Match?');
  console.log('-'.repeat(90));

  let mismatchCount = 0;

  for (const client of clients) {
    const nps = client.nps_score ?? 0;
    const compliance = Math.min(100, client.compliance_percentage ?? 50);
    const workingCapital = Math.min(100, client.working_capital_percentage ?? 100);

    // Calculate what it SHOULD be using v3.0 formula
    const npsPoints = ((nps + 100) / 200) * 40;
    const compliancePoints = (compliance / 100) * 50;
    const wcPoints = (workingCapital / 100) * 10;
    const calculatedScore = Math.round(npsPoints + compliancePoints + wcPoints);

    const dbScore = client.health_score ?? 0;
    const match = dbScore === calculatedScore ? '✓' : '✗ MISMATCH';

    if (dbScore !== calculatedScore) {
      mismatchCount++;
      console.log(
        `${client.client_name.padEnd(30)} | ${String(dbScore).padStart(8)} | ${String(calculatedScore).padStart(10)} | ${String(nps).padStart(3)} | ${String(compliance).padStart(10)} | ${String(workingCapital ?? 'null').padStart(5)} | ${match}`
      );
    }
  }

  console.log('\n' + '='.repeat(90));
  console.log(`Total clients: ${clients.length}`);
  console.log(`Mismatches: ${mismatchCount}`);

  if (mismatchCount > 0) {
    console.log('\n⚠️  Health scores are out of sync! The materialized view may need to be refreshed or the formula is different.');
  } else {
    console.log('\n✓ All health scores match the expected formula.');
  }

  // Also check what the actual view formula is
  console.log('\n=== Checking if materialized view exists ===');
  const { data: viewDef, error: viewError } = await supabase.rpc('get_view_definition', {
    view_name: 'client_health_summary'
  }).single();

  if (viewError) {
    console.log('Could not get view definition (RPC may not exist). Let me check using raw SQL approach...');
  } else {
    console.log('View definition:', viewDef);
  }
}

debugHealthScores().catch(console.error);
