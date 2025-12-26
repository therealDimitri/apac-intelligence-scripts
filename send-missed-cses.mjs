/**
 * Send Monday email to CSEs who missed out
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.local') });

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

const { generateMondayEmail } = await import('../src/lib/emails/email-generator.ts');

const MANAGER_CC = 'dimitri.leimonitis@alterahealth.com';

// Only send to those who missed out
const TO_SEND = [
  { cseName: 'BoonTeck Lim', email: 'boonteck.lim@alterahealth.com' },
  { cseName: 'Jonathan Salisbury', email: 'John.Salisbury@alterahealth.com' },
  { cseName: 'Nikki Wei', email: 'nikki.wei@alterahealth.com' },
];

async function getPortfolioData(cseName) {
  const { data: clientsData } = await supabase.from('client_segmentation').select('*').eq('cse_name', cseName);
  const clientNames = (clientsData || []).map(c => c.client_name);

  if (clientNames.length === 0) {
    return null;
  }

  const { data: healthData } = await supabase.from('client_health_history').select('*').in('client_name', clientNames).order('snapshot_date', { ascending: false });

  const latestHealth = {};
  for (const r of healthData || []) {
    if (!latestHealth[r.client_name]) latestHealth[r.client_name] = r;
  }

  const healthClients = Object.values(latestHealth).map(r => ({
    clientName: r.client_name,
    healthScore: r.health_score || 0,
    status: (r.status || '').toLowerCase().includes('critical') ? 'critical' : (r.status || '').toLowerCase().includes('risk') ? 'at-risk' : 'healthy',
    npsScore: r.nps_score || 0,
    compliancePercentage: r.compliance_percentage || 0,
    workingCapitalPercentage: r.working_capital_percentage || 0,
  }));

  const avgHealth = healthClients.length ? Math.round(healthClients.reduce((s,c) => s + c.healthScore, 0) / healthClients.length * 10) / 10 : 0;

  return {
    cse: { name: cseName, email: '', role: 'cse' },
    snapshot: { date: new Date().toISOString(), totalClients: clientNames.length, healthScore: avgHealth, healthScoreChange: 0 },
    ar: { totalOutstanding: 0, atRiskAmount: 0, atRiskPercent: 0, percentUnder60: 90, percentUnder90: 95, collectedThisWeek: 0 },
    priorityActions: [],
    clientEngagement: { noContactClients: [], upcomingRenewals: [], npsDetractors: [], recentNpsPromoters: [] },
    meetings: { thisWeek: [], completed: [] },
    weeklyProgress: { actionsRecommended: 0, actionsCompleted: 0, actionsInProgress: 0 },
    recommendations: [],
    wins: [],
    goals: [{ metric: 'Segmentation Compliance', goal: 80, actual: 75, unit: '%', status: 'close' }],
    segmentation: { overallPercentage: 75, totalExpected: 10, totalCompleted: 7, eventsOutstanding: [], byEventType: [] },
    clientHealth: {
      averageScore: avgHealth,
      healthyCount: healthClients.filter(c => c.status === 'healthy').length,
      atRiskCount: healthClients.filter(c => c.status === 'at-risk').length,
      criticalCount: healthClients.filter(c => c.status === 'critical').length,
      clients: healthClients,
      clientsNeedingAttention: healthClients.filter(c => c.status !== 'healthy'),
    },
  };
}

async function main() {
  console.log('✨ Sending Monday emails to missed CSEs...\n');

  for (const { cseName, email } of TO_SEND) {
    console.log(`👤 ${cseName}`);

    const data = await getPortfolioData(cseName);
    if (!data) {
      console.log(`   ⏭️ No client data found, skipping\n`);
      continue;
    }

    console.log(`   📊 ${data.snapshot.totalClients} clients`);

    const emailContent = generateMondayEmail(data);

    console.log(`   📧 Sending to ${email} (CC: ${MANAGER_CC})...`);
    const result = await resend.emails.send({
      from: 'ChaSen <notifications@apac-cs-dashboards.com>',
      to: email,
      cc: MANAGER_CC,
      subject: emailContent.subject,
      html: emailContent.htmlBody,
    });

    if (result.error) {
      console.log(`   ❌ Error: ${result.error.message}\n`);
    } else {
      console.log(`   ✅ Sent! (${result.data?.id})\n`);
    }
  }

  console.log('Done!');
}

main().catch(console.error);
