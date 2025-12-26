/**
 * Send Monday ChaSen emails with REAL data
 * Self-contained script that loads env first
 */

// Load env BEFORE any other imports
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.local') });

// Now import after env is loaded
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

// Verify env loaded
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL not set');
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const resend = new Resend(process.env.RESEND_API_KEY);

// Import generators after env is set
const { generateMondayEmail, generateWednesdayEmail, generateFridayEmail } = await import('../src/lib/emails/email-generator.ts');
const { CHASEN_BRANDING } = await import('../src/lib/emails/content-templates.ts');

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

const MANAGER_CC = 'dimitri.leimonitis@alterahealth.com';

// Additional CCs for team oversight
const ADDITIONAL_CC_MAP = {
  // Singapore team
  'BoonTeck Lim': ['nikki.wei@alterahealth.com', 'kenny.gan@alterahealth.com'],
  'Gilbert So': ['nikki.wei@alterahealth.com', 'kenny.gan@alterahealth.com'],
  'Nikki Wei': ['kenny.gan@alterahealth.com'],
  // Client Support
  'Stephen Oster': ['dominic.wilson-ing@alterahealth.com'],
  // ANZ team
  'Laura Messing': ['anupama.pradhan@alterahealth.com'],
  'Tracey Bland': ['anupama.pradhan@alterahealth.com'],
  'John Salisbury': ['anupama.pradhan@alterahealth.com'],
};

// Get all CSE names
async function getAllCSENames() {
  const { data } = await supabase
    .from('aging_compliance_history')
    .select('cse_name')
    .order('cse_name');

  const uniqueNames = [...new Set(data?.map(d => d.cse_name))];
  return uniqueNames.filter(name => name && name.toLowerCase() !== 'unassigned');
}

// Get portfolio data for a CSE
async function getCSEPortfolioData(cseName) {
  try {
    // Get AR data
    const { data: arData } = await supabase
      .from('aged_accounts_history')
      .select('*')
      .eq('cse_name', cseName)
      .order('snapshot_date', { ascending: false })
      .limit(30);

    const latest = arData?.[0] || {};

    // Get clients
    const { data: clientsData } = await supabase
      .from('client_segmentation')
      .select('*')
      .eq('cse_name', cseName);

    const clientNames = (clientsData || []).map(c => c.client_name);

    // Get meetings this week
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const { data: meetingsData } = await supabase
      .from('unified_meetings')
      .select('*')
      .eq('organizer_name', cseName)
      .gte('start_time', weekStart.toISOString())
      .lte('start_time', weekEnd.toISOString());

    // Get NPS data
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: npsData } = await supabase
      .from('nps_responses')
      .select('*')
      .eq('cse_name', cseName)
      .gte('response_date', thirtyDaysAgo.toISOString());

    // Get actions
    const { data: actionsData } = await supabase
      .from('actions')
      .select('*')
      .eq('Owners', cseName)
      .gte('created_at', weekStart.toISOString());

    // Get segmentation compliance
    const currentYear = new Date().getFullYear();
    const { data: eventTypes } = await supabase.from('segmentation_event_types').select('*');

    const eventTypeMap = {};
    (eventTypes || []).forEach(e => {
      eventTypeMap[e.id] = { name: e.event_name, code: e.event_code, team: e.responsible_team || 'CE' };
    });

    const { data: complianceData } = await supabase
      .from('segmentation_event_compliance')
      .select('*')
      .in('client_name', clientNames)
      .eq('year', currentYear)
      .gt('expected_count', 0);

    let totalExpected = 0, totalCompleted = 0;
    const eventsOutstanding = [];

    for (const record of complianceData || []) {
      const expected = record.expected_count || 0;
      const actual = record.actual_count || 0;
      totalExpected += expected;
      totalCompleted += actual;

      if (actual < expected) {
        const eventInfo = eventTypeMap[record.event_type_id] || { name: 'Unknown', code: 'UNKNOWN', team: 'CE' };
        eventsOutstanding.push({
          id: record.id,
          clientName: record.client_name,
          eventType: eventInfo.name,
          eventCode: eventInfo.code,
          expectedCount: expected,
          actualCount: actual,
          status: record.status === 'critical' ? 'overdue' : record.status === 'at_risk' ? 'due_soon' : 'on_track',
          responsibleTeam: eventInfo.team,
        });
      }
    }

    // Get client health
    const { data: healthData } = await supabase
      .from('client_health_history')
      .select('*')
      .in('client_name', clientNames)
      .order('snapshot_date', { ascending: false });

    const latestHealthByClient = {};
    for (const record of healthData || []) {
      if (!latestHealthByClient[record.client_name]) {
        latestHealthByClient[record.client_name] = record;
      }
    }

    const healthClients = Object.values(latestHealthByClient).map(r => ({
      clientName: r.client_name,
      healthScore: r.health_score || 0,
      status: (r.status || '').toLowerCase().includes('critical') ? 'critical' :
              (r.status || '').toLowerCase().includes('risk') ? 'at-risk' : 'healthy',
      npsScore: r.nps_score || 0,
      compliancePercentage: r.compliance_percentage || 0,
      workingCapitalPercentage: r.working_capital_percentage || 0,
    }));

    const healthyCount = healthClients.filter(c => c.status === 'healthy').length;
    const atRiskCount = healthClients.filter(c => c.status === 'at-risk').length;
    const criticalCount = healthClients.filter(c => c.status === 'critical').length;

    // Build priority actions
    const priorityActions = [];
    for (const client of arData || []) {
      const over90 = (client.days_91_to_120 || 0) + (client.days_121_plus || 0);
      if (over90 > 0) {
        priorityActions.push({
          id: `ar-${client.client_name}`,
          priority: over90 > 50000 ? 'critical' : 'high',
          clientName: client.client_name,
          type: 'ar_overdue',
          issue: `$${over90.toLocaleString()} at 90+ days overdue`,
          suggestedAction: 'Schedule call to discuss payment plan',
          amount: over90,
          days: 90,
        });
      }
    }

    const meetings = (meetingsData || []).map(m => ({
      id: m.id,
      title: m.title || 'Meeting',
      clientName: m.client_name || 'Unknown',
      date: new Date(m.start_time).toLocaleDateString('en-AU'),
      time: new Date(m.start_time).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }),
      type: m.meeting_type || 'general',
      completed: new Date(m.start_time) < new Date(),
    }));

    const recommendations = (actionsData || []).map(a => ({
      id: a.id,
      clientName: a.client || 'General',
      action: a.action_description || a.title || '',
      status: a.status?.toLowerCase().includes('complet') ? 'completed' :
              a.status?.toLowerCase().includes('progress') ? 'in_progress' : 'pending',
    }));

    return {
      cse: { name: cseName, email: '', role: 'cse' },
      snapshot: {
        date: new Date().toISOString(),
        totalClients: clientNames.length,
        healthScore: healthClients.length > 0 ?
          Math.round(healthClients.reduce((s, c) => s + c.healthScore, 0) / healthClients.length * 10) / 10 : 0,
        healthScoreChange: 0,
      },
      ar: {
        totalOutstanding: latest.total_outstanding || 0,
        atRiskAmount: (latest.days_91_to_120 || 0) + (latest.days_121_plus || 0),
        atRiskPercent: latest.total_outstanding ?
          (((latest.days_91_to_120 || 0) + (latest.days_121_plus || 0)) / latest.total_outstanding) * 100 : 0,
        percentUnder60: latest.percent_under_60 || 0,
        percentUnder90: latest.percent_under_90 || 0,
        collectedThisWeek: 0,
      },
      priorityActions,
      clientEngagement: {
        noContactClients: [],
        upcomingRenewals: [],
        npsDetractors: (npsData || []).filter(n => n.score <= 6).map(n => ({ clientName: n.client_name, value: n.score })),
        recentNpsPromoters: (npsData || []).filter(n => n.score >= 9).map(n => ({ clientName: n.client_name, value: n.score })),
      },
      meetings: {
        thisWeek: meetings.filter(m => !m.completed),
        completed: meetings.filter(m => m.completed),
      },
      weeklyProgress: {
        actionsRecommended: recommendations.length,
        actionsCompleted: recommendations.filter(r => r.status === 'completed').length,
        actionsInProgress: recommendations.filter(r => r.status === 'in_progress').length,
      },
      recommendations,
      wins: [],
      goals: [
        { metric: 'Segmentation Compliance', goal: 80, actual: totalExpected > 0 ? Math.round(totalCompleted / totalExpected * 100) : 100, unit: '%', status: 'close' },
        { metric: 'AR Under 60 Days', goal: 90, actual: Math.round(latest.percent_under_60 || 0), unit: '%', status: 'close' },
      ],
      segmentation: {
        overallPercentage: totalExpected > 0 ? Math.round(totalCompleted / totalExpected * 100) : 100,
        totalExpected,
        totalCompleted,
        eventsOutstanding: eventsOutstanding.slice(0, 5),
        byEventType: [],
      },
      clientHealth: {
        averageScore: healthClients.length > 0 ?
          Math.round(healthClients.reduce((s, c) => s + c.healthScore, 0) / healthClients.length * 10) / 10 : 0,
        healthyCount,
        atRiskCount,
        criticalCount,
        clients: healthClients,
        clientsNeedingAttention: healthClients.filter(c => c.status !== 'healthy').slice(0, 5),
      },
    };
  } catch (error) {
    console.error(`Error fetching data for ${cseName}:`, error.message);
    return null;
  }
}

// Main send function
async function sendMondayEmails() {
  console.log('✨ ChaSen Monday "Week Ahead Focus" - REAL DATA');
  console.log('═'.repeat(55));
  console.log(`📅 Date: ${new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`);
  console.log(`📧 CC: ${MANAGER_CC}\n`);

  const cseNames = await getAllCSENames();
  console.log(`Found ${cseNames.length} CSEs: ${cseNames.join(', ')}\n`);

  let sent = 0, failed = 0;

  for (const cseName of cseNames) {
    const cseEmail = CSE_EMAIL_MAP[cseName];
    if (!cseEmail) {
      console.log(`⏭️  ${cseName} - No email mapping`);
      failed++;
      continue;
    }

    console.log(`\n👤 ${cseName}`);
    console.log(`   Loading portfolio data...`);

    const portfolioData = await getCSEPortfolioData(cseName);
    if (!portfolioData) {
      console.log(`   ❌ No data available`);
      failed++;
      continue;
    }

    console.log(`   📊 ${portfolioData.snapshot.totalClients} clients | Health: ${portfolioData.snapshot.healthScore}/10`);
    console.log(`   🎯 ${portfolioData.priorityActions.length} priority actions`);
    console.log(`   📈 Segmentation: ${portfolioData.segmentation.overallPercentage}%`);
    console.log(`   💚 Health: ${portfolioData.clientHealth.healthyCount} healthy, ${portfolioData.clientHealth.atRiskCount} at-risk, ${portfolioData.clientHealth.criticalCount} critical`);

    const email = generateMondayEmail(portfolioData);

    // Build CC list
    const ccList = [MANAGER_CC, ...(ADDITIONAL_CC_MAP[cseName] || [])];
    console.log(`   📧 Sending to ${cseEmail} (CC: ${ccList.join(', ')})...`);
    const result = await resend.emails.send({
      from: 'ChaSen <notifications@apac-cs-dashboards.com>',
      to: cseEmail,
      cc: ccList,
      subject: email.subject,
      html: email.htmlBody,
    });

    if (result.error) {
      console.log(`   ❌ Error: ${result.error.message}`);
      failed++;
    } else {
      console.log(`   ✅ Sent! (${result.data?.id})`);
      sent++;
    }
  }

  console.log('\n' + '═'.repeat(55));
  console.log(`📬 Results: ${sent} sent, ${failed} failed`);
  console.log('═'.repeat(55));
}

sendMondayEmails().catch(console.error);
