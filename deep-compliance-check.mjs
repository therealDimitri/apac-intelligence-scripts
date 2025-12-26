import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function deepCheck() {
  console.log('=== Deep Compliance Analysis ===\n');

  // Get ALL compliance data
  const { data: allCompliance } = await supabase
    .from('segmentation_event_compliance')
    .select('client_name, year, compliance_percentage')
    .order('client_name')
    .order('year', { ascending: false });

  console.log('=== All compliance data in table ===');
  const byClient = {};
  for (const row of allCompliance || []) {
    if (!byClient[row.client_name]) byClient[row.client_name] = [];
    byClient[row.client_name].push({ year: row.year, pct: row.compliance_percentage });
  }

  for (const [client, years] of Object.entries(byClient)) {
    console.log(`${client}: ${years.map(y => `${y.year}=${y.pct}%`).join(', ')}`);
  }

  // Check the actual current year value being used
  const currentYear = new Date().getFullYear();
  console.log(`\n=== Current year filter: ${currentYear} ===`);

  // Get compliance data specifically for 2025
  const { data: compliance2025 } = await supabase
    .from('segmentation_event_compliance')
    .select('client_name, compliance_percentage')
    .eq('year', 2025);

  console.log('Clients with 2025 compliance data:');
  for (const row of compliance2025 || []) {
    console.log(`  ${row.client_name}: ${row.compliance_percentage}%`);
  }

  // Now check what the view definition shows vs the raw SQL calculation
  console.log('\n=== Direct SQL calculation vs View ===');
  const { data: viewClients } = await supabase
    .from('client_health_summary')
    .select('client_name, compliance_percentage')
    .order('client_name');

  for (const vc of viewClients || []) {
    const has2025 = compliance2025?.find(c => c.client_name === vc.client_name);
    const expected = has2025 ? Math.min(100, has2025.compliance_percentage) : null;
    const matches = vc.compliance_percentage === expected;

    if (!matches) {
      console.log(`${vc.client_name}: View=${vc.compliance_percentage}, Expected=${expected}`);
    }
  }

  // Calculate health score manually using the exact same formula as the migration
  console.log('\n=== Manual health score calculation using migration formula ===');

  const { data: waikato } = await supabase
    .from('client_health_summary')
    .select('*')
    .eq('client_name', 'Te Whatu Ora Waikato')
    .single();

  // Get raw NPS
  const { data: npsResponses } = await supabase
    .from('nps_responses')
    .select('score')
    .eq('client_name', 'Te Whatu Ora Waikato');

  const promoterCount = npsResponses?.filter(r => r.score >= 9).length || 0;
  const detractorCount = npsResponses?.filter(r => r.score <= 6).length || 0;
  const responseCount = npsResponses?.length || 0;

  const npsScore = responseCount > 0
    ? Math.round((promoterCount / responseCount * 100) - (detractorCount / responseCount * 100))
    : 0;

  // Get compliance
  const waikato2025 = compliance2025?.find(c => c.client_name === 'Te Whatu Ora Waikato');
  const compliancePct = waikato2025 ? Math.min(100, waikato2025.compliance_percentage) : null;

  // Get working capital
  const wcPct = waikato?.working_capital_percentage;

  console.log('Raw data:');
  console.log(`  NPS responses: ${responseCount} (P=${promoterCount}, D=${detractorCount})`);
  console.log(`  Calculated NPS: ${npsScore}`);
  console.log(`  Compliance (2025 raw): ${waikato2025?.compliance_percentage ?? 'NO DATA'}`);
  console.log(`  Working Capital: ${wcPct ?? 'null'}`);

  // Calculate using SQL formula
  const npsComponent = ((npsScore + 100) / 200.0 * 40);
  const complianceComponent = (Math.min(100, compliancePct ?? 50) / 100.0 * 50);
  const wcComponent = (Math.min(100, wcPct ?? 100) / 100.0 * 10);
  const totalScore = Math.round(npsComponent + complianceComponent + wcComponent);

  console.log('\nCalculation using SQL formula defaults:');
  console.log(`  NPS: (${npsScore} + 100) / 200 * 40 = ${npsComponent.toFixed(2)}`);
  console.log(`  Compliance: ${compliancePct ?? 50}% (${compliancePct === null ? 'default 50' : 'actual'}) / 100 * 50 = ${complianceComponent.toFixed(2)}`);
  console.log(`  WC: ${wcPct ?? 100}% (${wcPct === null ? 'default 100' : 'actual'}) / 100 * 10 = ${wcComponent.toFixed(2)}`);
  console.log(`  TOTAL: ${totalScore}`);
  console.log(`  View shows: ${waikato?.health_score}`);
}

deepCheck().catch(console.error);
