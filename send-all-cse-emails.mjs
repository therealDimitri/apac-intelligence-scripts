/**
 * Send Monday CSE emails to all CSEs with real portfolio data
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.local') });

import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const { getCSEPortfolioData, getAllCSENames } = await import('../src/lib/emails/data-aggregator.ts');
const { generateMondayEmail } = await import('../src/lib/emails/email-generator.ts');

// CSE email mapping
const CSE_EMAIL_MAP = {
  'Gilbert So': 'gilbert.so@alterahealth.com',
  'Tracey Bland': 'tracey.bland@alterahealth.com',
  'Nikki Wei': 'nikki.wei@alterahealth.com',
  'Laura Messing': 'laura.messing@alterahealth.com',
  'John Salisbury': 'John.Salisbury@alterahealth.com',
  'Jonathan Salisbury': 'John.Salisbury@alterahealth.com',
  'BoonTeck Lim': 'boonteck.lim@alterahealth.com',
  'Stephen Oster': 'stephen.oster@alterahealth.com',
};

// Manager CC
const MANAGER_CC = 'dimitri.leimonitis@alterahealth.com';

// Additional CCs for specific CSEs
const ADDITIONAL_CC_MAP = {
  'BoonTeck Lim': [
    { email: 'nikki.wei@alterahealth.com', name: 'Nikki Wei' },
    { email: 'kenny.gan@alterahealth.com', name: 'Kenny Gan' },
  ],
  'Gilbert So': [
    { email: 'nikki.wei@alterahealth.com', name: 'Nikki Wei' },
    { email: 'kenny.gan@alterahealth.com', name: 'Kenny Gan' },
  ],
  'Nikki Wei': [{ email: 'kenny.gan@alterahealth.com', name: 'Kenny Gan' }],
  'Laura Messing': [{ email: 'anupama.pradhan@alterahealth.com', name: 'Anu Pradhan' }],
  'Tracey Bland': [{ email: 'anupama.pradhan@alterahealth.com', name: 'Anu Pradhan' }],
  'John Salisbury': [{ email: 'anupama.pradhan@alterahealth.com', name: 'Anu Pradhan' }],
};

// Special recipients who don't get standard portfolio emails
const SPECIAL_RECIPIENTS = ['Stephen Oster'];

async function main() {
  console.log('📧 Sending Monday CSE Emails to All CSEs...\n');

  const cseNames = await getAllCSENames();
  console.log(`Found ${cseNames.length} CSEs: ${cseNames.join(', ')}\n`);

  const results = [];

  for (const cseName of cseNames) {
    // Skip special recipients
    if (SPECIAL_RECIPIENTS.includes(cseName)) {
      console.log(`⏭️  Skipping ${cseName} (special recipient)`);
      continue;
    }

    const cseEmail = CSE_EMAIL_MAP[cseName];
    if (!cseEmail) {
      console.log(`⚠️  No email found for ${cseName}`);
      continue;
    }

    try {
      console.log(`📊 Fetching portfolio data for ${cseName}...`);
      const portfolioData = await getCSEPortfolioData(cseName);

      const email = generateMondayEmail(portfolioData);

      // Build CC list
      const ccList = [MANAGER_CC];
      const additionalCCs = ADDITIONAL_CC_MAP[cseName] || [];
      additionalCCs.forEach(cc => ccList.push(cc.email));

      console.log(`📧 Sending to ${cseName} (${cseEmail})...`);
      const result = await resend.emails.send({
        from: 'ChaSen <notifications@apac-cs-dashboards.com>',
        to: cseEmail,
        cc: ccList,
        subject: email.subject,
        html: email.htmlBody,
      });

      if (result.error) {
        console.log(`   ❌ Error: ${result.error.message}`);
        results.push({ cseName, success: false, error: result.error.message });
      } else {
        console.log(`   ✅ Sent! ID: ${result.data?.id}`);
        results.push({ cseName, success: true, emailId: result.data?.id });
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
      results.push({ cseName, success: false, error: error.message });
    }
  }

  console.log('\n' + '═'.repeat(50));
  console.log('📊 Summary:');
  console.log(`   ✅ Sent: ${results.filter(r => r.success).length}`);
  console.log(`   ❌ Failed: ${results.filter(r => !r.success).length}`);
  console.log('═'.repeat(50));
}

main().catch(console.error);
