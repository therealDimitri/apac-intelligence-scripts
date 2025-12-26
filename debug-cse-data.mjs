/**
 * Debug CSE portfolio data
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const { getCSEPortfolioData } = await import('../src/lib/emails/data-aggregator.ts');

async function main() {
  const cseName = 'Gilbert So';
  console.log(`\n🔍 Debugging portfolio data for ${cseName}...\n`);

  const data = await getCSEPortfolioData(cseName);

  console.log('=== SNAPSHOT ===');
  console.log(JSON.stringify(data.snapshot, null, 2));

  console.log('\n=== CSE INFO ===');
  console.log(JSON.stringify(data.cse, null, 2));

  console.log('\n=== CLIENT HEALTH ===');
  const clientHealth = data.clientHealth || {};
  console.log(`Total clients: ${clientHealth.clients ? clientHealth.clients.length : 0}`);
  console.log(`Average score: ${clientHealth.averageScore || 0}`);
  console.log(`Healthy: ${clientHealth.healthyCount || 0}`);
  console.log(`At Risk: ${clientHealth.atRiskCount || 0}`);
  console.log(`Critical: ${clientHealth.criticalCount || 0}`);

  if (clientHealth.clients && clientHealth.clients.length > 0) {
    console.log('\nClients:');
    clientHealth.clients.forEach(c => {
      console.log(`  - ${c.clientName}: ${c.healthScore}/10 (${c.status})`);
    });
  } else {
    console.log('\n⚠️  No clients found in clientHealth!');
  }

  console.log('\n=== SEGMENTATION ===');
  const seg = data.segmentation || {};
  console.log(`Overall: ${seg.overallPercentage || 0}%`);
  console.log(`Expected: ${seg.totalExpected || 0}`);
  console.log(`Completed: ${seg.totalCompleted || 0}`);

  console.log('\n=== RAW DATA KEYS ===');
  console.log(Object.keys(data));
}

main().catch(console.error);
