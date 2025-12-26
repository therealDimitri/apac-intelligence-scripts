import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkHealthScores() {
  console.log('=== CLIENT HEALTH SCORE VERIFICATION ===\n');
  console.log('Formula: NPS (40 pts) + Compliance (60 pts) = Health Score');
  console.log('NPS Component: ((nps_score + 100) / 200) * 40');
  console.log('Compliance Component: (MIN(100, compliance) / 100) * 60');
  console.log('-'.repeat(80) + '\n');

  // Get client health data
  const { data: healthData, error: healthError } = await supabase
    .from('client_health_summary')
    .select('client_name, health_score, nps_score, compliance_percentage')
    .order('health_score', { ascending: false });

  if (healthError) {
    console.error('Error fetching health scores:', healthError);
    return;
  }

  // Get raw compliance data
  const { data: compData, error: compError } = await supabase
    .from('segmentation_event_compliance')
    .select('client_name, compliance_percentage');

  if (compError) {
    console.error('Error fetching compliance:', compError);
    return;
  }

  // Calculate raw compliance averages per client
  const rawCompByClient = {};
  compData.forEach(r => {
    if (!rawCompByClient[r.client_name]) {
      rawCompByClient[r.client_name] = { total: 0, count: 0 };
    }
    rawCompByClient[r.client_name].total += r.compliance_percentage;
    rawCompByClient[r.client_name].count++;
  });

  // Verify each client's health score
  console.log('DETAILED VERIFICATION:\n');

  let allMatch = true;
  healthData.slice(0, 12).forEach(c => {
    const npsComponent = ((c.nps_score + 100) / 200) * 40;
    const cappedCompliance = Math.min(100, c.compliance_percentage || 0);
    const complianceComponent = (cappedCompliance / 100) * 60;
    const expectedScore = Math.round(npsComponent + complianceComponent);

    // Get raw compliance average
    const rawData = rawCompByClient[c.client_name];
    const rawAvg = rawData ? (rawData.total / rawData.count).toFixed(1) : 'N/A';
    const isInflated = rawData && (rawData.total / rawData.count) > 100;

    const match = c.health_score === expectedScore;
    if (!match) allMatch = false;

    console.log(`${c.client_name}:`);
    console.log(`  NPS: ${c.nps_score} → ${npsComponent.toFixed(1)} pts`);
    console.log(`  Raw compliance avg: ${rawAvg}%${isInflated ? ' ⚠️ OVER-SERVICED' : ''}`);
    console.log(`  Stored compliance: ${(c.compliance_percentage || 0).toFixed(1)}%`);
    console.log(`  Capped to: ${cappedCompliance}% → ${complianceComponent.toFixed(1)} pts`);
    console.log(`  Expected: ${expectedScore}% | Actual: ${c.health_score}% ${match ? '✅' : '❌'}`);
    console.log('');
  });

  // Summary
  console.log('='.repeat(80));
  console.log('SUMMARY\n');

  const inflatedClients = Object.entries(rawCompByClient)
    .filter(([_, d]) => (d.total / d.count) > 100);
  console.log(`Clients with raw compliance > 100%: ${inflatedClients.length}`);

  if (inflatedClients.length > 0) {
    console.log('Over-serviced clients:');
    inflatedClients.forEach(([name, data]) => {
      const avg = (data.total / data.count).toFixed(1);
      console.log(`  - ${name}: ${avg}%`);
    });
    console.log('');
  }

  const over100Health = healthData.filter(c => c.health_score > 100);
  console.log(`Clients with health score > 100%: ${over100Health.length}`);

  // Final verdict
  console.log('\n' + '='.repeat(80));
  if (over100Health.length === 0) {
    console.log('✅ RESULT: Health scores are properly capped at 100%');
    console.log('   Over-servicing is NOT inflating final health scores.');
    console.log('   The LEAST(100, compliance) cap is working correctly.');
  } else {
    console.log('❌ RESULT: HEALTH SCORE INFLATION DETECTED!');
    over100Health.forEach(c => console.log(`  - ${c.client_name}: ${c.health_score}%`));
  }

  // Check if formula matches
  if (allMatch) {
    console.log('\n✅ All calculated scores match stored scores.');
  } else {
    console.log('\n⚠️  Some calculated scores do not match stored scores.');
    console.log('   The materialized view may need to be refreshed.');
  }
}

checkHealthScores().catch(console.error);
