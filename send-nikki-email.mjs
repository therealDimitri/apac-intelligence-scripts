/**
 * Send CSE email to Nikki Wei
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

const MANAGER_CC = 'dimitri.leimonitis@alterahealth.com';
const ADDITIONAL_CC = [
  { email: 'kenny.gan@alterahealth.com', name: 'Kenny Gan' },
];

async function main() {
  const cseName = 'Nikki Wei';
  const cseEmail = 'nikki.wei@alterahealth.com';

  console.log(`\n📊 Fetching portfolio data for ${cseName}...`);

  const portfolioData = await getCSEPortfolioData(cseName);

  if (!portfolioData) {
    console.error('Failed to fetch portfolio data');
    process.exit(1);
  }

  console.log(`Total Clients: ${portfolioData.snapshot.totalClients}`);
  console.log(`Health Score: ${portfolioData.snapshot.healthScore}/10`);

  const email = generateMondayEmail(portfolioData);

  // Build CC list
  const ccList = [MANAGER_CC, ...ADDITIONAL_CC.map(cc => cc.email)];

  console.log(`\n📧 Sending to ${cseName} (${cseEmail})...`);
  console.log(`   CC: ${ccList.join(', ')}`);

  const result = await resend.emails.send({
    from: 'ChaSen <notifications@apac-cs-dashboards.com>',
    to: cseEmail,
    cc: ccList,
    subject: email.subject,
    html: email.htmlBody,
  });

  if (result.error) {
    console.log(`❌ Error: ${result.error.message}`);
  } else {
    console.log(`✅ Sent! ID: ${result.data?.id}`);
  }
}

main().catch(console.error);
