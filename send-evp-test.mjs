/**
 * Send test EVP Executive Summary email to Dimitri
 * Updated to include all executive data sections
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

// Invoice Tracker API config
const INVOICE_TRACKER_URL = process.env.INVOICE_TRACKER_URL || 'https://invoice-tracker.altera-apac.com';
const INVOICE_TRACKER_EMAIL = process.env.INVOICE_TRACKER_EMAIL;
const INVOICE_TRACKER_PASSWORD = process.env.INVOICE_TRACKER_PASSWORD;

async function getInvoiceTrackerToken() {
  const response = await fetch(`${INVOICE_TRACKER_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: INVOICE_TRACKER_EMAIL,
      password: INVOICE_TRACKER_PASSWORD,
    }),
  });
  if (!response.ok) return null;
  const data = await response.json();
  return data.token;
}

async function getInvoiceTrackerData() {
  const token = await getInvoiceTrackerToken();
  if (!token) return null;

  const response = await fetch(`${INVOICE_TRACKER_URL}/api/aging-report`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) return null;
  return response.json();
}

const { generateEVPEmail } = await import('../src/lib/emails/email-generator.ts');

async function getExecutiveData() {
  console.log('Fetching executive data...\n');

  // Get all actions for Priority Matrix
  const { data: allActions } = await supabase
    .from('actions')
    .select('*')
    .order('Priority', { ascending: true })
    .order('created_at', { ascending: false });

  // Filter to Critical and High for the main actions list
  const actions = (allActions || []).filter(a =>
    a.Priority === 'Critical' || a.Priority === 'High'
  );

  const formattedActions = (actions || []).map(a => ({
    id: String(a.id),
    actionId: a.Action_ID || '',
    description: a.Action_Description || '',
    client: a.client || 'General',
    owner: a.Owners || '',
    status: a.Status || 'Open',
    priority: a.Priority,
    dueDate: a.Due_Date || '',
    category: a.Category || '',
  }));

  const today = new Date();
  const overdue = formattedActions.filter(a => {
    if (a.status.toLowerCase() === 'completed') return false;
    if (!a.dueDate) return false;
    const parts = a.dueDate.split('/');
    if (parts.length !== 3) return false;
    const dueDate = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    return dueDate < today;
  }).length;

  const openActions = formattedActions.filter(a => a.status.toLowerCase() !== 'completed');

  // Get client segmentation
  const { data: segmentation } = await supabase
    .from('client_segmentation')
    .select('*');

  // Get live aging data from Invoice Tracker API
  console.log('Fetching live Invoice Tracker data...');
  const invoiceTrackerData = await getInvoiceTrackerData();

  // Transform Invoice Tracker data to client format
  const agingClients = [];
  if (invoiceTrackerData?.buckets) {
    const bucketMapping = {
      'Current': 'current',
      '31-60': 'days31to60',
      '61-90': 'days61to90',
      '91-120': 'days91to120',
      '121-180': 'days121to180',
      '181-270': 'days181to270',
      '271-365': 'days271to365',
      '>365': 'over365',
    };

    const clientMap = {};
    Object.entries(invoiceTrackerData.buckets).forEach(([bucket, data]) => {
      const field = bucketMapping[bucket];
      if (!field || !data.clients) return;

      Object.entries(data.clients).forEach(([clientName, clientData]) => {
        if (!clientMap[clientName]) {
          clientMap[clientName] = {
            client_name: clientName,
            total_outstanding: 0,
            current: 0,
            days_31_to_60: 0,
            days_61_to_90: 0,
            days_91_to_120: 0,
            days_121_to_180: 0,
            days_181_to_270: 0,
            days_271_to_365: 0,
            days_over_365: 0,
          };
        }
        const mappedField = field === 'current' ? 'current' :
                           field === 'days31to60' ? 'days_31_to_60' :
                           field === 'days61to90' ? 'days_61_to_90' :
                           field === 'days91to120' ? 'days_91_to_120' :
                           field === 'days121to180' ? 'days_121_to_180' :
                           field === 'days181to270' ? 'days_181_to_270' :
                           field === 'days271to365' ? 'days_271_to_365' : 'days_over_365';
        clientMap[clientName][mappedField] = clientData.totalUSD;
        clientMap[clientName].total_outstanding += clientData.totalUSD;
      });
    });

    // Exclude non-CSE owned clients
    const excludedClients = ['provation', 'iqht', 'philips', 'altera'];
    Object.values(clientMap).forEach(client => {
      const clientNameLower = client.client_name.toLowerCase();
      const isExcluded = excludedClients.some(ex => clientNameLower.includes(ex));
      if (!isExcluded) {
        agingClients.push(client);
      }
    });
  }
  console.log(`  Found ${agingClients.length} clients from Invoice Tracker\n`);

  // Get client health history
  const { data: healthHistory } = await supabase
    .from('client_health_history')
    .select('*')
    .order('snapshot_date', { ascending: false });

  // Get recently completed actions (last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const { data: recentCompleted } = await supabase
    .from('actions')
    .select('*')
    .eq('Status', 'Completed')
    .gte('Completed_At', sevenDaysAgo.toISOString());

  // Get recent meetings
  const { data: recentMeetings } = await supabase
    .from('unified_meetings')
    .select('*')
    .gte('meeting_date', sevenDaysAgo.toISOString().split('T')[0])
    .neq('deleted', true);

  // Calculate segmentation gaps
  const segmentationGaps = [];
  const clientSegments = new Map();
  for (const seg of segmentation || []) {
    // Only set if we don't have an entry yet, or if this one has a cse_name and existing doesn't
    const existing = clientSegments.get(seg.client_name);
    if (!existing || (seg.cse_name && !existing.cse_name)) {
      clientSegments.set(seg.client_name, seg);
    }
  }

  const uniqueClients = new Map();
  for (const h of healthHistory || []) {
    if (!uniqueClients.has(h.client_name)) {
      uniqueClients.set(h.client_name, h);
    }
  }

  for (const [clientName, health] of uniqueClients) {
    const compliance = health.compliance_percentage || 0;
    if (compliance < 80) {
      const seg = clientSegments.get(clientName);
      segmentationGaps.push({
        clientName,
        cseName: seg?.cse_name || 'Unassigned',
        segment: seg?.tier_id || 'Standard',
        eventsExpected: 10,
        eventsCompleted: Math.round(compliance / 10),
        compliancePercentage: compliance,
        outstandingEvents: compliance < 50
          ? ['QBR', 'Monthly Check-in', 'Roadmap Review']
          : ['Monthly Check-in', 'Follow-up'],
      });
    }
  }
  segmentationGaps.sort((a, b) => a.compliancePercentage - b.compliancePercentage);

  // Calculate working capital from live Invoice Tracker data
  let totalOutstanding = 0;
  let totalAtRisk = 0;
  const clientsAtRisk = [];

  // Get CSE assignments for matching
  const { data: cseAssignments } = await supabase
    .from('cse_client_assignments')
    .select('cse_name, client_name, client_name_normalized')
    .eq('is_active', true);

  const findCSEForClient = (clientName) => {
    const normalise = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalised = normalise(clientName);

    // Try exact match first
    let assignment = cseAssignments?.find(a =>
      a.client_name_normalized?.toLowerCase() === clientName.toLowerCase() ||
      normalise(a.client_name_normalized || '') === normalised
    );

    // If no exact match, try partial match (one contains the other)
    if (!assignment) {
      assignment = cseAssignments?.find(a => {
        const normDb = normalise(a.client_name_normalized || '');
        return normDb.includes(normalised) || normalised.includes(normDb);
      });
    }

    return assignment?.cse_name || 'Unassigned';
  };

  for (const acc of agingClients) {
    const outstanding = Number(acc.total_outstanding) || 0;
    const over90 = (Number(acc.days_91_to_120) || 0) +
                   (Number(acc.days_121_to_180) || 0) +
                   (Number(acc.days_181_to_270) || 0) +
                   (Number(acc.days_271_to_365) || 0) +
                   (Number(acc.days_over_365) || 0);
    const over120 = (Number(acc.days_121_to_180) || 0) +
                    (Number(acc.days_181_to_270) || 0) +
                    (Number(acc.days_271_to_365) || 0) +
                    (Number(acc.days_over_365) || 0);

    totalOutstanding += outstanding;
    totalAtRisk += over90;

    if (over90 > 0) {
      clientsAtRisk.push({
        clientName: acc.client_name,
        totalOutstanding: outstanding,
        over90Days: over90,
        over120Days: over120,
        percentAtRisk: outstanding > 0 ? Math.round((over90 / outstanding) * 100) : 0,
        cseName: findCSEForClient(acc.client_name),
      });
    }
  }
  clientsAtRisk.sort((a, b) => b.over90Days - a.over90Days);

  // Calculate team metrics
  // Health scores are stored as percentages (0-100), convert to /10 scale for display
  const healthScores = Array.from(uniqueClients.values()).map(h => h.health_score || 0);
  const complianceRates = Array.from(uniqueClients.values()).map(h => h.compliance_percentage || 0);
  const avgHealthScoreRaw = healthScores.length > 0
    ? healthScores.reduce((a, b) => a + b, 0) / healthScores.length
    : 0;
  const avgHealthScore = Math.round(avgHealthScoreRaw / 10 * 10) / 10; // Convert to /10 scale
  const avgComplianceRate = complianceRates.length > 0
    ? Math.round(complianceRates.reduce((a, b) => a + b, 0) / complianceRates.length)
    : 0;
  const criticalClients = Array.from(uniqueClients.values()).filter(h => h.status === 'Critical').length;
  const atRiskClients = Array.from(uniqueClients.values()).filter(h => h.status === 'At Risk' || h.status === 'Critical').length;

  // Generate recognition
  const recognition = [];

  const completedByOwner = new Map();
  for (const action of recentCompleted || []) {
    const owner = action.Owners || 'Unknown';
    completedByOwner.set(owner, (completedByOwner.get(owner) || 0) + 1);
  }

  const topPerformers = Array.from(completedByOwner.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  for (const [name, count] of topPerformers) {
    if (count >= 2) {
      recognition.push({
        name,
        role: 'individual',
        achievement: `Completed ${count} high-priority actions this week`,
        metric: `${count} actions closed`,
      });
    }
  }

  // Helper to format name from "Last, First" to "First Last"
  const formatName = (name) => {
    if (!name) return 'Unknown';
    if (name.includes(', ')) {
      const [last, first] = name.split(', ');
      return `${first} ${last}`;
    }
    return name;
  };

  const meetingsByCSE = new Map();
  for (const meeting of recentMeetings || []) {
    const cse = meeting.cse_name || 'Unknown';
    meetingsByCSE.set(cse, (meetingsByCSE.get(cse) || 0) + 1);
  }

  const topMeetingCSEs = Array.from(meetingsByCSE.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2);

  for (const [name, count] of topMeetingCSEs) {
    if (count >= 3 && !recognition.find(r => r.name === name)) {
      recognition.push({
        name: formatName(name),
        role: 'individual',
        achievement: `Conducted ${count} client meetings this week`,
        metric: `${count} engagements`,
      });
    }
  }

  if (avgComplianceRate >= 75) {
    recognition.push({
      name: 'APAC Client Success Team',
      role: 'team',
      achievement: `Maintained strong portfolio compliance at ${avgComplianceRate}%`,
      metric: `${avgComplianceRate}% average compliance`,
    });
  }

  // Helper to find CSE name for a client
  const getCSENameForClient = (clientName) => {
    // First try client_segmentation
    const seg = clientSegments.get(clientName);
    if (seg?.cse_name) return formatName(seg.cse_name);

    // Then try CSE assignments
    const assignment = cseAssignments?.find(a =>
      a.client_name_normalized?.toLowerCase() === clientName.toLowerCase() ||
      a.client_name?.toLowerCase() === clientName.toLowerCase()
    );
    if (assignment?.cse_name) return formatName(assignment.cse_name);

    return null; // Return null instead of fallback - we'll skip if no CSE found
  };

  // Find clients/CSEs achieving high compliance (80%+)
  const highComplianceClients = Array.from(uniqueClients.entries())
    .filter(([, health]) => (health.compliance_percentage || 0) >= 80)
    .sort((a, b) => (b[1].compliance_percentage || 0) - (a[1].compliance_percentage || 0))
    .slice(0, 3);

  for (const [clientName, health] of highComplianceClients) {
    const cseName = getCSENameForClient(clientName);
    if (!cseName) continue; // Skip if no CSE found
    if (!recognition.find(r => r.name === cseName)) {
      recognition.push({
        name: cseName,
        role: 'individual',
        achievement: `Achieved ${health.compliance_percentage}% compliance for ${clientName}`,
        metric: `${health.compliance_percentage}% compliance`,
        client: clientName,
      });
    }
  }

  // Find clients with excellent health scores (80+/100, displayed as 8+/10)
  // Health scores are stored as percentages, so filter for >= 80
  const healthyClients = Array.from(uniqueClients.entries())
    .filter(([, health]) => (health.health_score || 0) >= 80)
    .sort((a, b) => (b[1].health_score || 0) - (a[1].health_score || 0))
    .slice(0, 2);

  for (const [clientName, health] of healthyClients) {
    const cseName = getCSENameForClient(clientName);
    if (!cseName) continue; // Skip if no CSE found
    if (!recognition.find(r => r.name === cseName && r.client === clientName)) {
      const displayScore = Math.round((health.health_score || 0) / 10 * 10) / 10; // Convert to /10 scale
      recognition.push({
        name: cseName,
        role: 'individual',
        achievement: `Maintained excellent client health for ${clientName}`,
        metric: `${displayScore}/10 health score`,
        client: clientName,
      });
    }
  }

  // Generate insights
  const insights = [];

  if (criticalClients > 0) {
    insights.push(`${criticalClients} client${criticalClients > 1 ? 's' : ''} currently at critical status - recommend executive sponsorship review`);
  }

  if (totalAtRisk > 100000) {
    insights.push(`$${Math.round(totalAtRisk / 1000)}K in working capital at risk (90+ days) - consider escalating to Dimitri for review`);
  }

  if (segmentationGaps.length > 3) {
    insights.push(`${segmentationGaps.length} clients below 80% compliance - recommend escalating to Dimitri for review`);
  }

  const overdueActions = formattedActions.filter(a => {
    if (a.status.toLowerCase() === 'completed') return false;
    if (!a.dueDate) return false;
    const parts = a.dueDate.split('/');
    if (parts.length !== 3) return false;
    const dueDate = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    return dueDate < today;
  });
  if (overdueActions.length > 5) {
    insights.push(`${overdueActions.length} critical/high priority actions overdue - action owner accountability review recommended`);
  }

  if (avgHealthScore >= 7) {
    insights.push(`Portfolio health strong at ${avgHealthScore}/10 - positive trend continuing`);
  } else if (avgHealthScore < 5) {
    insights.push(`Portfolio health at ${avgHealthScore}/10 requires attention - consider intervention strategy`);
  }

  if (insights.length === 0) {
    insights.push('Portfolio metrics are stable - continue monitoring for changes');
  }

  // Generate data insights
  const dataInsights = [];

  // AR concentration insight
  const sortedByOutstanding = [...agingClients].sort((a, b) => b.total_outstanding - a.total_outstanding);
  const top3Outstanding = sortedByOutstanding.slice(0, 3).reduce((sum, c) => sum + c.total_outstanding, 0);
  const arConcentration = totalOutstanding > 0 ? Math.round((top3Outstanding / totalOutstanding) * 100) : 0;
  dataInsights.push({
    icon: '🎯',
    label: 'AR Concentration',
    value: `${arConcentration}%`,
    trend: arConcentration > 50 ? 'down' : 'neutral',
    context: `Top 3 clients = $${Math.round(top3Outstanding / 1000).toLocaleString()}K of total AR`,
  });

  // At risk percentage insight
  const atRiskPercentage = totalOutstanding > 0 ? Math.round((totalAtRisk / totalOutstanding) * 100) : 0;
  dataInsights.push({
    icon: '⚠️',
    label: 'Portfolio at Risk',
    value: `${atRiskPercentage}%`,
    trend: atRiskPercentage > 10 ? 'down' : atRiskPercentage < 5 ? 'up' : 'neutral',
    context: `$${Math.round(totalAtRisk / 1000).toLocaleString()}K over 90 days outstanding`,
  });

  // Compliance distribution insight
  const highCompliance = segmentationGaps.filter(g => g.compliancePercentage >= 80).length;
  const lowCompliance = segmentationGaps.filter(g => g.compliancePercentage < 50).length;
  const totalWithCompliance = uniqueClients.size || segmentation?.length || 0;
  const complianceHealthy = totalWithCompliance > 0 ? Math.round(((totalWithCompliance - segmentationGaps.length) / totalWithCompliance) * 100) : 0;
  dataInsights.push({
    icon: '📋',
    label: 'Compliance Health',
    value: `${complianceHealthy}%`,
    trend: complianceHealthy >= 80 ? 'up' : complianceHealthy >= 60 ? 'neutral' : 'down',
    context: `${totalWithCompliance - segmentationGaps.length} clients meeting 80%+ threshold`,
  });

  // Action completion insight (last 7 days)
  const totalActionsWeek = (recentCompleted?.length || 0) + openActions.filter(a => a.status.toLowerCase() !== 'completed').length;
  const completionRate = totalActionsWeek > 0 ? Math.round(((recentCompleted?.length || 0) / totalActionsWeek) * 100) : 0;
  dataInsights.push({
    icon: '✅',
    label: 'Weekly Action Completion',
    value: `${recentCompleted?.length || 0} closed`,
    trend: completionRate >= 50 ? 'up' : completionRate >= 25 ? 'neutral' : 'down',
    context: `${completionRate}% completion rate this week`,
  });

  // Client engagement insight
  const meetingsThisWeek = recentMeetings?.length || 0;
  dataInsights.push({
    icon: '🤝',
    label: 'Client Engagement',
    value: `${meetingsThisWeek} meetings`,
    trend: meetingsThisWeek >= 10 ? 'up' : meetingsThisWeek >= 5 ? 'neutral' : 'down',
    context: `${meetingsByCSE.size} CSEs actively engaging clients`,
  });

  // Generate Priority Matrix summary (matching dashboard logic)
  // Fetch event-types API for compliance data
  let eventTypeData = [];
  try {
    const eventResponse = await fetch('https://apac-cs-dashboards.com/api/event-types');
    if (eventResponse.ok) {
      const eventJson = await eventResponse.json();
      if (eventJson.success && Array.isArray(eventJson.data)) {
        eventTypeData = eventJson.data;
      }
    }
  } catch (err) {
    console.log('  Note: Could not fetch event-types API for Priority Matrix');
  }

  // Helper to check if action is overdue (>7 days)
  const sevenDaysAgoMatrix = new Date();
  sevenDaysAgoMatrix.setDate(sevenDaysAgoMatrix.getDate() - 7);
  const isOverdue7Days = (action) => {
    if (!action.Due_Date) return false;
    const parts = action.Due_Date.split('/');
    if (parts.length !== 3) return false;
    const dueDate = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    return dueDate < sevenDaysAgoMatrix;
  };

  const openAllActions = (allActions || []).filter(a => a.Status?.toLowerCase() !== 'completed' && a.Status?.toLowerCase() !== 'cancelled');

  // === DO NOW (Critical Alerts) ===
  const doNowItems = [];

  // 1. Critical compliance events (<30% complete or high/medium priority <50%)
  const criticalEvents = eventTypeData.filter(event => {
    const hasSevereDelay = event.completionPercentage < 30 && event.remainingEvents > 0;
    const hasModerateDelay = (event.priority === 'high' || event.priority === 'medium') &&
      event.completionPercentage < 50 && event.remainingEvents > 0;
    return hasSevereDelay || hasModerateDelay;
  });
  criticalEvents.forEach(e => doNowItems.push(`${e.name}: ${e.completionPercentage}% complete`));

  // 2. Overdue actions (>7 days past due)
  const overdueActionsMatrix = openAllActions.filter(a => isOverdue7Days(a)).slice(0, 3);
  overdueActionsMatrix.forEach(a => doNowItems.push(`${a.client || 'General'}: ${(a.Action_Description || '').substring(0, 30)}...`));

  // 3. Aged accounts alerts (clients with 90+ day receivables)
  if (clientsAtRisk.length > 0) {
    doNowItems.push(`${clientsAtRisk.length} clients with 90+ day receivables ($${Math.round(totalAtRisk / 1000)}K)`);
  }

  // === PLAN (Priority Actions - medium urgency) ===
  const planItems = [];

  // 1. Events needing attention (priority high/medium with remaining work, not critical)
  const criticalEventNames = new Set(criticalEvents.map(e => e.name));
  const priorityEvents = eventTypeData.filter(event => {
    if (criticalEventNames.has(event.name)) return false;
    const hasRemainingWork = event.remainingEvents > 0;
    const isPriorityEvent = event.priority === 'high' || event.priority === 'medium';
    const isBehindSchedule = event.completionPercentage < 60;
    return hasRemainingWork && (isPriorityEvent || isBehindSchedule);
  });
  priorityEvents.slice(0, 3).forEach(e => planItems.push(`Schedule ${e.name} (${e.remainingEvents} remaining)`));

  // 2. Actions due within 7 days
  const sevenDaysFromNow = new Date();
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
  const upcomingActions = openAllActions.filter(a => {
    if (!a.Due_Date) return false;
    const parts = a.Due_Date.split('/');
    if (parts.length !== 3) return false;
    const dueDate = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    return dueDate >= today && dueDate <= sevenDaysFromNow;
  }).slice(0, 3);
  upcomingActions.forEach(a => planItems.push(`${a.client}: ${(a.Action_Description || '').substring(0, 30)}...`));

  // 3. Clients needing engagement (low compliance)
  const lowComplianceForPlan = segmentationGaps.filter(g => g.compliancePercentage < 50).slice(0, 2);
  lowComplianceForPlan.forEach(g => planItems.push(`Re-engage ${g.clientName} (${g.compliancePercentage}% compliance)`));

  // === OPPORTUNITIES (AI Recommendations) ===
  const opportunityItems = [];

  // 1. High health clients for case studies
  const caseStudyCandidates = Array.from(uniqueClients.values())
    .filter(h => (h.health_score || 0) >= 70 && (h.compliance_percentage || 0) >= 80)
    .slice(0, 2);
  caseStudyCandidates.forEach(h => opportunityItems.push(`Case study opportunity: ${h.client_name}`));

  // 2. Workload optimisation recommendations
  const actionsByOwnerMatrix = {};
  for (const action of openAllActions) {
    const owner = action.Owners || 'Unassigned';
    actionsByOwnerMatrix[owner] = (actionsByOwnerMatrix[owner] || 0) + 1;
  }
  const overloadedOwners = Object.entries(actionsByOwnerMatrix)
    .filter(([, count]) => count > 10)
    .slice(0, 2);
  overloadedOwners.forEach(([owner, count]) => opportunityItems.push(`Redistribute ${formatName(owner)}'s workload (${count} actions)`));

  // 3. Improving clients to sustain momentum
  const improvingClients = Array.from(uniqueClients.values())
    .filter(h => h.trend === 'up' || (h.health_score || 0) > (h.previous_health_score || 0))
    .slice(0, 2);
  improvingClients.forEach(h => opportunityItems.push(`Sustain momentum: ${h.client_name}`));

  // === INFORM (Smart Insights) ===
  const informItems = [];

  // 1. Portfolio overview
  informItems.push(`Managing ${uniqueClients.size} clients across portfolio`);

  // 2. Success patterns
  const highCompletionEvents = eventTypeData.filter(e => e.completionPercentage >= 100);
  if (highCompletionEvents.length > 0) {
    informItems.push(`${highCompletionEvents.length} event types exceeding targets`);
  }

  // 3. Positive trends
  const improvingCount = Array.from(uniqueClients.values()).filter(h => h.trend === 'up').length;
  if (improvingCount > 0) {
    informItems.push(`${improvingCount} clients showing NPS improvement`);
  }

  // 4. Completion rate insight
  const completedActionsCount = (allActions || []).filter(a => a.Status?.toLowerCase() === 'completed').length;
  const totalActionsCount = (allActions || []).length;
  const completionRateMatrix = totalActionsCount > 0 ? Math.round((completedActionsCount / totalActionsCount) * 100) : 0;
  if (completionRateMatrix >= 70) {
    informItems.push(`Strong action completion rate: ${completionRateMatrix}%`);
  }

  const priorityMatrix = {
    doNow: {
      count: criticalEvents.length + overdueActionsMatrix.length + (clientsAtRisk.length > 0 ? 1 : 0),
      topItems: doNowItems.slice(0, 3),
    },
    plan: {
      count: priorityEvents.length + upcomingActions.length + lowComplianceForPlan.length,
      topItems: planItems.slice(0, 3),
    },
    opportunities: {
      count: caseStudyCandidates.length + overloadedOwners.length + improvingClients.length,
      topItems: opportunityItems.slice(0, 3),
    },
    inform: {
      count: informItems.length,
      topItems: informItems.slice(0, 3),
    },
  };

  return {
    recipientName: 'Todd',
    actions: formattedActions,
    summary: {
      total: formattedActions.length,
      critical: openActions.filter(a => a.priority === 'Critical').length,
      high: openActions.filter(a => a.priority === 'High').length,
      open: openActions.length,
      completed: formattedActions.filter(a => a.status.toLowerCase() === 'completed').length,
      overdue,
    },
    segmentationGaps: segmentationGaps.slice(0, 8),
    workingCapital: {
      totalOutstanding,
      totalAtRisk,
      clientsAtRisk: clientsAtRisk.slice(0, 5),
    },
    teamMetrics: {
      totalClients: uniqueClients.size || (segmentation?.length || 0),
      avgHealthScore,
      avgComplianceRate,
      criticalClients,
      atRiskClients,
    },
    recognition: recognition.slice(0, 5),
    insights: insights.slice(0, 5),
    dataInsights,
    priorityMatrix,
  };
}

async function main() {
  console.log('📊 Sending EVP Executive Summary test email to Dimitri...\n');

  const data = await getExecutiveData();

  console.log('=== EXECUTIVE SUMMARY DATA ===\n');

  console.log(`Actions (Critical + High priority):`);
  console.log(`  - Total: ${data.summary.total}`);
  console.log(`  - Critical: ${data.summary.critical}`);
  console.log(`  - High: ${data.summary.high}`);
  console.log(`  - Open: ${data.summary.open}`);
  console.log(`  - Completed: ${data.summary.completed}`);
  console.log(`  - Overdue: ${data.summary.overdue}\n`);

  console.log(`Team Metrics:`);
  console.log(`  - Total Clients: ${data.teamMetrics.totalClients}`);
  console.log(`  - Avg Health Score: ${data.teamMetrics.avgHealthScore}/10`);
  console.log(`  - Avg Compliance: ${data.teamMetrics.avgComplianceRate}%`);
  console.log(`  - Critical Clients: ${data.teamMetrics.criticalClients}`);
  console.log(`  - At Risk Clients: ${data.teamMetrics.atRiskClients}\n`);

  console.log(`Working Capital:`);
  console.log(`  - Total Outstanding: $${data.workingCapital.totalOutstanding.toLocaleString()}`);
  console.log(`  - Total at Risk (90+ days): $${data.workingCapital.totalAtRisk.toLocaleString()}`);
  console.log(`  - Clients at Risk: ${data.workingCapital.clientsAtRisk.length}`);
  for (const client of data.workingCapital.clientsAtRisk) {
    console.log(`    * ${client.clientName}: ${client.cseName} ($${client.over90Days.toLocaleString()} at risk)`);
  }
  console.log('');

  console.log(`Segmentation Gaps: ${data.segmentationGaps.length} clients below 80%`);
  for (const gap of data.segmentationGaps) {
    console.log(`  - ${gap.clientName}: ${gap.cseName} (${gap.compliancePercentage}%)`);
  }
  console.log('');

  console.log(`Recognition: ${data.recognition.length} items`);
  for (const rec of data.recognition) {
    console.log(`  - ${rec.role === 'team' ? '👥' : '⭐'} ${rec.name}: ${rec.achievement}`);
  }
  console.log('');

  console.log(`Insights: ${data.insights.length}`);
  for (const insight of data.insights) {
    console.log(`  - ${insight}`);
  }
  console.log('');

  console.log(`Data Insights: ${data.dataInsights?.length || 0}`);
  for (const di of data.dataInsights || []) {
    console.log(`  - ${di.icon} ${di.label}: ${di.value} (${di.trend || 'n/a'}) - ${di.context}`);
  }
  console.log('');

  console.log(`Priority Matrix:`);
  console.log(`  - Do Now: ${data.priorityMatrix?.doNow?.count || 0}`);
  console.log(`  - Plan: ${data.priorityMatrix?.plan?.count || 0}`);
  console.log(`  - Opportunities: ${data.priorityMatrix?.opportunities?.count || 0}`);
  console.log(`  - Inform: ${data.priorityMatrix?.inform?.count || 0}`);
  console.log('');

  const email = generateEVPEmail(data);

  console.log('Sending email...\n');

  const result = await resend.emails.send({
    from: 'ChaSen <notifications@apac-cs-dashboards.com>',
    to: 'todd.haebich@alterahealth.com',
    cc: ['dimitri.leimonitis@alterahealth.com'],
    subject: email.subject,
    html: email.htmlBody,
  });

  if (result.error) {
    console.log(`❌ Error: ${result.error.message}`);
  } else {
    console.log(`✅ Sent! (${result.data?.id})`);
    console.log(`\nSubject: ${email.subject}`);
  }
}

main().catch(console.error);
