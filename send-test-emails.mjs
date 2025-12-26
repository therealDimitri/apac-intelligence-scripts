/**
 * Send test ChaSen emails via Resend
 */
import { Resend } from 'resend';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const resend = new Resend(process.env.RESEND_API_KEY);

// Import email generators
const { generateMondayEmail, generateWednesdayEmail, generateFridayEmail } = await import('../src/lib/emails/email-generator.ts');

// Sample data
const sampleData = {
  cse: { name: 'Dimitri Leimonitis', email: 'dimitri.leimonitis@alterahealth.com', role: 'cse' },
  snapshot: {
    date: new Date().toISOString(),
    totalClients: 18,
    healthScore: 7.2,
    healthScoreChange: 0.3,
  },
  ar: {
    totalOutstanding: 342500,
    atRiskAmount: 45200,
    atRiskPercent: 13.2,
    percentUnder60: 87,
    percentUnder90: 94,
    collectedThisWeek: 67500,
  },
  priorityActions: [
    { id: '1', priority: 'critical', clientName: 'Grampians Health', type: 'ar_overdue', issue: '$45,200 at 95 days overdue', suggestedAction: 'Schedule call to discuss payment plan', amount: 45200, days: 95 },
    { id: '2', priority: 'high', clientName: 'Peninsula Health', type: 'renewal', issue: 'Contract renewal due in 7 days', suggestedAction: 'Prepare renewal proposal', dueDate: '2024-12-28' },
  ],
  clientEngagement: {
    noContactClients: [],
    upcomingRenewals: [{ clientName: 'Peninsula Health', value: 7, detail: 'Renewal: 28 Dec 2024' }],
    npsDetractors: [{ clientName: 'Alfred Health', value: 6, detail: 'Concerned about support response times' }],
    recentNpsPromoters: [{ clientName: 'Monash Health', value: 9 }, { clientName: 'Austin Health', value: 10 }],
  },
  meetings: {
    thisWeek: [
      { id: '1', title: 'QBR', clientName: 'Eastern Health', date: 'Tue 24 Dec', time: '10:00 AM', type: 'qbr', completed: false },
      { id: '2', title: 'Onboarding Call', clientName: 'New Client', date: 'Thu 26 Dec', time: '2:00 PM', type: 'onboarding', completed: false },
    ],
    completed: [
      { id: '3', title: 'Check-in', clientName: 'Monash Health', date: 'Mon 23 Dec', time: '9:00 AM', type: 'checkin', completed: true },
    ],
  },
  weeklyProgress: { actionsRecommended: 6, actionsCompleted: 3, actionsInProgress: 2 },
  recommendations: [
    { id: '1', clientName: 'Grampians Health', action: 'Call about overdue payment', status: 'completed', outcome: 'Payment plan agreed' },
    { id: '2', clientName: 'Peninsula Health', action: 'Prepare renewal proposal', status: 'in_progress' },
  ],
  wins: [
    { type: 'ar_collected', description: 'Collected $67,500 in AR', value: 67500 },
    { type: 'meeting_held', description: '3 client meetings completed', value: 3 },
  ],
  goals: [
    { metric: 'Segmentation Compliance', goal: 80, actual: 67, unit: '%', status: 'missed' },
    { metric: 'AR Under 60 Days', goal: 90, actual: 87, unit: '%', status: 'close' },
    { metric: 'Client Contacts', goal: 10, actual: 12, unit: '', status: 'exceeded' },
    { metric: 'Actions Completed', goal: 6, actual: 4, unit: '', status: 'missed' },
  ],
  segmentation: {
    overallPercentage: 67,
    totalExpected: 24,
    totalCompleted: 16,
    eventsOutstanding: [
      { id: '1', clientName: 'Grampians Health', eventType: 'Health Check (Opal)', eventCode: 'HEALTH_CHECK', expectedCount: 1, actualCount: 0, status: 'overdue', responsibleTeam: 'PS/R&D' },
      { id: '2', clientName: 'Peninsula Health', eventType: 'CE On-Site Attendance', eventCode: 'CE_ONSITE', expectedCount: 2, actualCount: 1, status: 'due_soon', responsibleTeam: 'CE' },
      { id: '3', clientName: 'Eastern Health', eventType: 'Strategic Ops Plan Meeting', eventCode: 'STRAT_OPS', expectedCount: 1, actualCount: 0, status: 'on_track', responsibleTeam: 'CE/VP/AVP' },
    ],
    byEventType: [],
  },
  clientHealth: {
    averageScore: 7.4,
    healthyCount: 12,
    atRiskCount: 4,
    criticalCount: 2,
    clients: [],
    clientsNeedingAttention: [
      { clientName: 'Grampians Health', healthScore: 4.2, status: 'critical', npsScore: 5, compliancePercentage: 45, workingCapitalPercentage: 38, snapshotDate: '2024-12-22' },
      { clientName: 'Peninsula Health', healthScore: 5.1, status: 'critical', npsScore: 6, compliancePercentage: 52, workingCapitalPercentage: 55, snapshotDate: '2024-12-22' },
      { clientName: 'Eastern Health', healthScore: 6.3, status: 'at-risk', npsScore: 7, compliancePercentage: 68, workingCapitalPercentage: 72, snapshotDate: '2024-12-22' },
      { clientName: 'Alfred Health', healthScore: 6.8, status: 'at-risk', npsScore: 6, compliancePercentage: 75, workingCapitalPercentage: 78, snapshotDate: '2024-12-22' },
    ],
  },
};

const TO_EMAIL = 'dimitri.leimonitis@alterahealth.com';

async function sendEmails() {
  console.log('✨ ChaSen Email Sender');
  console.log('═'.repeat(50));
  console.log(`Sending to: ${TO_EMAIL}\n`);
  
  const mondayEmail = generateMondayEmail(sampleData);
  const wednesdayEmail = generateWednesdayEmail(sampleData);
  const fridayEmail = generateFridayEmail(sampleData);
  
  console.log('📧 Sending Monday "Week Ahead Focus"...');
  const monday = await resend.emails.send({
    from: 'ChaSen <notifications@apac-cs-dashboards.com>',
    to: TO_EMAIL,
    subject: mondayEmail.subject,
    html: mondayEmail.htmlBody,
  });
  if (monday.error) {
    console.log('   ❌ Error:', monday.error.message);
  } else {
    console.log('   ✅ Sent! ID:', monday.data?.id);
  }
  
  console.log('📧 Sending Wednesday "Mid-Week Check-In"...');
  const wednesday = await resend.emails.send({
    from: 'ChaSen <notifications@apac-cs-dashboards.com>',
    to: TO_EMAIL,
    subject: wednesdayEmail.subject,
    html: wednesdayEmail.htmlBody,
  });
  if (wednesday.error) {
    console.log('   ❌ Error:', wednesday.error.message);
  } else {
    console.log('   ✅ Sent! ID:', wednesday.data?.id);
  }
  
  console.log('📧 Sending Friday "Week in Review"...');
  const friday = await resend.emails.send({
    from: 'ChaSen <notifications@apac-cs-dashboards.com>',
    to: TO_EMAIL,
    subject: fridayEmail.subject,
    html: fridayEmail.htmlBody,
  });
  if (friday.error) {
    console.log('   ❌ Error:', friday.error.message);
  } else {
    console.log('   ✅ Sent! ID:', friday.data?.id);
  }
  
  console.log('\n═'.repeat(50));
  console.log('✨ Done! Check your inbox.');
}

sendEmails().catch(console.error);
