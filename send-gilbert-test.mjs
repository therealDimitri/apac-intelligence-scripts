/**
 * Send test CSE email to Gilbert to verify fixes
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.local') });

import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const { getCSEPortfolioData } = await import('../src/lib/emails/data-aggregator.ts');
const { generateMondayEmail } = await import('../src/lib/emails/email-generator.ts');

async function main() {
  const cseName = 'Gilbert So';
  console.log(`\n📊 Fetching portfolio data for ${cseName}...`);

  const portfolioData = await getCSEPortfolioData(cseName);

  if (!portfolioData) {
    console.error('Failed to fetch portfolio data');
    process.exit(1);
  }

  console.log('\n=== PORTFOLIO DATA SUMMARY ===');
  console.log(`Total Clients: ${portfolioData.snapshot.totalClients}`);
  console.log(`Health Score: ${portfolioData.snapshot.healthScore}/10`);
  console.log(`Priority Actions: ${portfolioData.priorityActions.length}`);
  console.log(`Critical Clients: ${portfolioData.clientHealth.criticalCount}`);
  console.log(`At-Risk Clients: ${portfolioData.clientHealth.atRiskCount}`);
  console.log(`Healthy Clients: ${portfolioData.clientHealth.healthyCount}`);

  console.log('\n=== CLIENT HEALTH DETAILS ===');
  portfolioData.clientHealth.clients.forEach(c => {
    console.log(`  - ${c.clientName}: ${c.healthScore}/10 (${c.status})`);
  });

  const email = generateMondayEmail(portfolioData);

  console.log('\n📧 Sending test email to dimitri.leimonitis@alterahealth.com...');

  const result = await resend.emails.send({
    from: 'ChaSen <notifications@apac-cs-dashboards.com>',
    to: 'dimitri.leimonitis@alterahealth.com',
    subject: `[TEST] ${email.subject}`,
    html: email.htmlBody,
  });

  if (result.error) {
    console.log(`❌ Error: ${result.error.message}`);
  } else {
    console.log(`✅ Sent! ID: ${result.data?.id}`);
  }
}

main().catch(console.error);
