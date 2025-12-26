/**
 * Send Monday ChaSen emails with REAL data to all CSEs
 */
import 'dotenv/config';
import { Resend } from 'resend';

// Manually set env if dotenv didn't work
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const { getCSEPortfolioData, getAllCSENames } = await import('../src/lib/emails/data-aggregator.ts');
const { generateMondayEmail } = await import('../src/lib/emails/email-generator.ts');

const resend = new Resend(process.env.RESEND_API_KEY);

const CSE_EMAIL_MAP = {
  'Gilbert So': 'gilbert.so@alterahealth.com',
  'Tracey Bland': 'tracey.bland@alterahealth.com',
  'Nikki Wei': 'nikki.wei@alterahealth.com',
  'Laura Messing': 'laura.messing@alterahealth.com',
  'John Salisbury': 'john.salisbury@alterahealth.com',
};

const MANAGER_CC = 'dimitri.leimonitis@alterahealth.com';

async function sendMondayEmails() {
  console.log('✨ ChaSen Monday Email - Real Data');
  console.log('═'.repeat(50));
  console.log('Date: 22 December 2024\n');

  const cseNames = await getAllCSENames();
  console.log('CSEs found:', cseNames.length, cseNames);

  let sent = 0;
  let failed = 0;

  for (const cseName of cseNames) {
    const cseEmail = CSE_EMAIL_MAP[cseName];
    if (!cseEmail) {
      console.log(`⏭️  ${cseName} - No email mapping, skipping`);
      failed++;
      continue;
    }

    try {
      console.log(`\n📊 Loading data for ${cseName}...`);
      const portfolioData = await getCSEPortfolioData(cseName);

      if (!portfolioData) {
        console.log(`   ❌ No portfolio data`);
        failed++;
        continue;
      }

      console.log(`   Clients: ${portfolioData.snapshot.totalClients}`);
      console.log(`   Health Score: ${portfolioData.snapshot.healthScore}`);
      console.log(`   Priority Actions: ${portfolioData.priorityActions.length}`);
      console.log(`   Segmentation: ${portfolioData.segmentation.overallPercentage}%`);
      console.log(`   Client Health: ${portfolioData.clientHealth.healthyCount} healthy, ${portfolioData.clientHealth.atRiskCount} at-risk, ${portfolioData.clientHealth.criticalCount} critical`);

      const email = generateMondayEmail(portfolioData);

      console.log(`📧 Sending to ${cseEmail} (CC: ${MANAGER_CC})...`);
      const result = await resend.emails.send({
        from: 'ChaSen <notifications@apac-cs-dashboards.com>',
        to: cseEmail,
        cc: MANAGER_CC,
        subject: email.subject,
        html: email.htmlBody,
      });

      if (result.error) {
        console.log(`   ❌ Error: ${result.error.message}`);
        failed++;
      } else {
        console.log(`   ✅ Sent! ID: ${result.data?.id}`);
        sent++;
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
      failed++;
    }
  }

  console.log('\n' + '═'.repeat(50));
  console.log(`✅ Sent: ${sent} | ❌ Failed: ${failed}`);
  console.log('═'.repeat(50));
}

sendMondayEmails().catch(console.error);
