/**
 * ChaSen Email Preview Script
 * Generates sample email previews for the ChaSen weekly communications
 *
 * Run with: node scripts/preview-email.mjs
 */

import {
  CHASEN_BRANDING,
  MONDAY_EMAIL,
  WEDNESDAY_EMAIL,
  FRIDAY_EMAIL,
  SHARED_CONTENT,
} from '../src/lib/emails/content-templates.ts'

// Sample data for preview
const sampleData = {
  cse: { name: 'Sarah Jones', email: 'sarah.jones@example.com', role: 'cse' },
  snapshot: {
    date: new Date().toISOString(),
    totalClients: 18,
    healthScore: 7.2,
    healthScoreChange: 0.3,
    clientsNeedingAttention: 3,
    upcomingRenewals: 2,
  },
  ar: {
    totalOutstanding: 342500,
    atRiskAmount: 45200,
    atRiskPercent: 13.2,
    percentUnder60: 87,
    percentUnder90: 94,
    paidThisWeek: 67500,
    clientsOver90Days: [
      { clientName: 'Grampians Health', amount: 45200, daysPastDue: 95 },
    ],
  },
  priorityMatrixActions: [
    { id: '1', quadrant: 'urgent_important', clientName: 'Peninsula Health', action: 'Contract renewal due in 7 days', dueDate: '2024-12-28' },
    { id: '2', quadrant: 'not_urgent_important', clientName: 'Eastern Health', action: 'Schedule QBR for Q1', dueDate: '2025-01-15' },
  ],
  segmentationActions: [
    { id: '1', clientName: 'Monash Health', action: 'Annual review overdue', dueDate: '2024-12-15', status: 'overdue' },
    { id: '2', clientName: 'Alfred Health', action: 'NPS follow-up', dueDate: '2024-12-24', status: 'due_this_week' },
  ],
  meetingActions: [
    { id: '1', clientName: 'Austin Health', meeting: 'QBR - 18 Dec', action: 'Send updated pricing proposal', assignee: 'Sarah' },
    { id: '2', clientName: 'Eastern Health', meeting: 'Check-in - 17 Dec', action: 'Follow up on support ticket', assignee: 'Sarah' },
  ],
  meetings: {
    thisWeek: [
      { id: '1', title: 'QBR', clientName: 'Eastern Health', date: 'Tue 24 Dec', time: '10:00 AM', type: 'qbr', completed: false },
      { id: '2', title: 'Onboarding Call', clientName: 'New Client', date: 'Thu 26 Dec', time: '2:00 PM', type: 'onboarding', completed: false },
    ],
    completed: [
      { id: '3', title: 'Check-in', clientName: 'Monash Health', date: 'Mon 23 Dec', time: '9:00 AM', type: 'checkin', completed: true },
    ],
  },
  weeklyProgress: {
    actionsRecommended: 6,
    actionsCompleted: 3,
    actionsInProgress: 2,
  },
  recommendations: [
    { id: '1', clientName: 'Grampians Health', action: 'Call about overdue payment', status: 'completed', outcome: 'Payment plan agreed - $15K/month' },
    { id: '2', clientName: 'Peninsula Health', action: 'Prepare renewal proposal', status: 'in_progress' },
    { id: '3', clientName: 'Alfred Health', action: 'Follow up on NPS feedback', status: 'completed', outcome: 'Issue resolved' },
    { id: '4', clientName: 'Austin Health', action: 'Send payment reminder', status: 'pending' },
  ],
  wins: [
    { type: 'ar_paid', description: 'AR Paid: $67,500', value: 67500 },
    { type: 'meeting_held', description: '3 client meetings completed', value: 3 },
    { type: 'nps_response', description: '2 NPS promoters received', value: 2 },
    { type: 'actions_completed', description: '4 actions completed', value: 4 },
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
      { id: '4', clientName: 'Alfred Health', eventType: 'SLA/Service Review Meeting', eventCode: 'SLA_REVIEW', expectedCount: 1, actualCount: 0, status: 'on_track', responsibleTeam: 'Support' },
    ],
    byEventType: [
      { eventType: 'Health Check (Opal)', eventCode: 'HEALTH_CHECK', expected: 4, completed: 2, percentage: 50 },
      { eventType: 'CE On-Site Attendance', eventCode: 'CE_ONSITE', expected: 6, completed: 4, percentage: 67 },
      { eventType: 'Strategic Ops Plan Meeting', eventCode: 'STRAT_OPS', expected: 4, completed: 3, percentage: 75 },
      { eventType: 'EVP Engagement', eventCode: 'EVP_ENGAGE', expected: 4, completed: 4, percentage: 100 },
    ],
  },
  clientHealth: {
    averageScore: 7.4,
    healthyCount: 12,
    atRiskCount: 4,
    criticalCount: 2,
    clients: [
      { clientName: 'Grampians Health', healthScore: 4.2, status: 'critical', npsScore: 5, compliancePercentage: 45, workingCapitalPercentage: 38, snapshotDate: '2024-12-22' },
      { clientName: 'Peninsula Health', healthScore: 5.1, status: 'critical', npsScore: 6, compliancePercentage: 52, workingCapitalPercentage: 55, snapshotDate: '2024-12-22' },
      { clientName: 'Eastern Health', healthScore: 6.3, status: 'at-risk', npsScore: 7, compliancePercentage: 68, workingCapitalPercentage: 72, snapshotDate: '2024-12-22' },
      { clientName: 'Alfred Health', healthScore: 6.8, status: 'at-risk', npsScore: 6, compliancePercentage: 75, workingCapitalPercentage: 78, snapshotDate: '2024-12-22' },
      { clientName: 'Monash Health', healthScore: 8.2, status: 'healthy', npsScore: 9, compliancePercentage: 92, workingCapitalPercentage: 88, snapshotDate: '2024-12-22' },
      { clientName: 'Austin Health', healthScore: 8.5, status: 'healthy', npsScore: 8, compliancePercentage: 88, workingCapitalPercentage: 91, snapshotDate: '2024-12-22' },
    ],
    clientsNeedingAttention: [
      { clientName: 'Grampians Health', healthScore: 4.2, status: 'critical', npsScore: 5, compliancePercentage: 45, workingCapitalPercentage: 38, snapshotDate: '2024-12-22' },
      { clientName: 'Peninsula Health', healthScore: 5.1, status: 'critical', npsScore: 6, compliancePercentage: 52, workingCapitalPercentage: 55, snapshotDate: '2024-12-22' },
      { clientName: 'Eastern Health', healthScore: 6.3, status: 'at-risk', npsScore: 7, compliancePercentage: 68, workingCapitalPercentage: 72, snapshotDate: '2024-12-22' },
      { clientName: 'Alfred Health', healthScore: 6.8, status: 'at-risk', npsScore: 6, compliancePercentage: 75, workingCapitalPercentage: 78, snapshotDate: '2024-12-22' },
    ],
  },
}

function formatCurrency(amount) {
  return '$' + amount.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

// =============================================================================
// ChaSen MONDAY EMAIL PREVIEW
// =============================================================================
console.log()
console.log('═'.repeat(70))
console.log(`✨ ${CHASEN_BRANDING.name} - MONDAY EMAIL PREVIEW`)
console.log(`   "${MONDAY_EMAIL.sections.portfolioOverview.title}"`)
console.log('═'.repeat(70))
console.log()

const mondaySubject = MONDAY_EMAIL.subject
  .replace('{name}', 'Sarah')
  .replace('{count}', '4')

console.log(`📧 SUBJECT: ${mondaySubject}`)
console.log()
console.log('─'.repeat(70))
console.log()

console.log(MONDAY_EMAIL.greetings[0].replace('{name}', 'Sarah'))
console.log()
console.log(MONDAY_EMAIL.intro.standard)
console.log()

// Portfolio Overview
console.log(`${MONDAY_EMAIL.sections.portfolioOverview.icon} ${MONDAY_EMAIL.sections.portfolioOverview.title}`)
console.log('─'.repeat(40))
console.log(`  • ${MONDAY_EMAIL.sections.portfolioOverview.labels.totalClients}: ${sampleData.snapshot.totalClients}`)
console.log(`  • ${MONDAY_EMAIL.sections.portfolioOverview.labels.healthScore}: ${sampleData.snapshot.healthScore}/10`)
console.log(`  • ${MONDAY_EMAIL.sections.portfolioOverview.labels.clientsNeedingAttention}: ${sampleData.snapshot.clientsNeedingAttention}`)
console.log(`  • ${MONDAY_EMAIL.sections.portfolioOverview.labels.upcomingRenewals}: ${sampleData.snapshot.upcomingRenewals}`)
console.log()

// Priority Matrix Actions
console.log(`${MONDAY_EMAIL.sections.priorityMatrix.icon} ${MONDAY_EMAIL.sections.priorityMatrix.title}`)
console.log('─'.repeat(40))
console.log(`  ${MONDAY_EMAIL.sections.priorityMatrix.description}`)
console.log()
sampleData.priorityMatrixActions.forEach((action) => {
  const quadrantLabel = MONDAY_EMAIL.sections.priorityMatrix.quadrantLabels[action.quadrant]
  console.log(`  [${quadrantLabel}] ${action.clientName}`)
  console.log(`    → ${action.action}`)
  console.log(`    📅 Due: ${action.dueDate}`)
  console.log()
})
console.log(`  ${MONDAY_EMAIL.sections.priorityMatrix.viewAllLink}`)
console.log()

// Client Actions (Segmentation)
console.log(`${MONDAY_EMAIL.sections.clientActions.icon} ${MONDAY_EMAIL.sections.clientActions.title}`)
console.log('─'.repeat(40))
sampleData.segmentationActions.forEach((action) => {
  const statusEmoji = action.status === 'overdue' ? '🔴' : '🟡'
  const statusLabel = MONDAY_EMAIL.sections.clientActions.categories[action.status === 'overdue' ? 'overdue' : 'dueThisWeek']
  console.log(`  ${statusEmoji} [${statusLabel}] ${action.clientName}: ${action.action}`)
})
console.log()
console.log(`  ${MONDAY_EMAIL.sections.clientActions.viewAllLink}`)
console.log()

// Meeting Actions
console.log(`${MONDAY_EMAIL.sections.meetingActions.icon} ${MONDAY_EMAIL.sections.meetingActions.title}`)
console.log('─'.repeat(40))
sampleData.meetingActions.forEach((action) => {
  console.log(`  📝 ${action.clientName} (${action.meeting})`)
  console.log(`    → ${action.action}`)
})
console.log()
console.log(`  ${MONDAY_EMAIL.sections.meetingActions.viewAllLink}`)
console.log()

// AR Focus (90+ days only)
if (sampleData.ar.clientsOver90Days.length > 0) {
  console.log(`${MONDAY_EMAIL.sections.arFocus.icon} ${MONDAY_EMAIL.sections.arFocus.title}`)
  console.log('─'.repeat(40))
  console.log(`  ${MONDAY_EMAIL.sections.arFocus.description}`)
  console.log()
  console.log(`  ${MONDAY_EMAIL.sections.arFocus.labels.totalAtRisk}: ${formatCurrency(sampleData.ar.atRiskAmount)}`)
  console.log(`  ${MONDAY_EMAIL.sections.arFocus.labels.clientsAffected}: ${sampleData.ar.clientsOver90Days.length}`)
  console.log()
  sampleData.ar.clientsOver90Days.forEach((client) => {
    console.log(`  ⚠️ ${client.clientName}: ${formatCurrency(client.amount)} (${client.daysPastDue} days)`)
  })
  console.log()
  console.log(`  ${MONDAY_EMAIL.sections.arFocus.viewAllLink}`)
  console.log()
}

// Segmentation Compliance
console.log(`${MONDAY_EMAIL.sections.segmentationCompliance.icon} ${MONDAY_EMAIL.sections.segmentationCompliance.title}`)
console.log('─'.repeat(40))
console.log(`  ${MONDAY_EMAIL.sections.segmentationCompliance.description}`)
console.log()
console.log(`  ${MONDAY_EMAIL.sections.segmentationCompliance.labels.overallCompliance}: ${sampleData.segmentation.overallPercentage}%`)
console.log(`  ${MONDAY_EMAIL.sections.segmentationCompliance.labels.eventsCompleted}: ${sampleData.segmentation.totalCompleted}/${sampleData.segmentation.totalExpected}`)
console.log(`  ${MONDAY_EMAIL.sections.segmentationCompliance.labels.eventsToSchedule}: ${sampleData.segmentation.eventsOutstanding.length}`)
console.log()
// Show status-based encouragement
const complianceLevel = sampleData.segmentation.overallPercentage >= 80 ? 'excellent'
  : sampleData.segmentation.overallPercentage >= 70 ? 'good'
  : sampleData.segmentation.overallPercentage >= 50 ? 'needsAttention'
  : 'critical'
console.log(`  ${MONDAY_EMAIL.sections.segmentationCompliance.encouragement[complianceLevel]}`)
console.log()
// Outstanding events
console.log('  Events to schedule:')
sampleData.segmentation.eventsOutstanding.forEach((event) => {
  const statusLabel = MONDAY_EMAIL.sections.segmentationCompliance.statusLabels[event.status]
  console.log(`    ${statusLabel} ${event.clientName}: ${event.eventType} (${event.actualCount}/${event.expectedCount})`)
})
console.log()
console.log(`  ${MONDAY_EMAIL.sections.segmentationCompliance.viewAllLink}`)
console.log()

// Client Health Overview
console.log(`${MONDAY_EMAIL.sections.clientHealth.icon} ${MONDAY_EMAIL.sections.clientHealth.title}`)
console.log('─'.repeat(40))
console.log(`  ${MONDAY_EMAIL.sections.clientHealth.description}`)
console.log()
console.log(`  ${MONDAY_EMAIL.sections.clientHealth.labels.averageScore}: ${sampleData.clientHealth.averageScore}`)
console.log(`  ${MONDAY_EMAIL.sections.clientHealth.labels.healthyClients}: ${sampleData.clientHealth.healthyCount}`)
console.log(`  ${MONDAY_EMAIL.sections.clientHealth.labels.atRiskClients}: ${sampleData.clientHealth.atRiskCount}`)
console.log(`  ${MONDAY_EMAIL.sections.clientHealth.labels.criticalClients}: ${sampleData.clientHealth.criticalCount}`)
console.log()
// Show status-based encouragement
const healthLevel = sampleData.clientHealth.criticalCount > 0 ? 'critical'
  : sampleData.clientHealth.atRiskCount > 3 ? 'needsAttention'
  : sampleData.clientHealth.atRiskCount > 0 ? 'good'
  : 'excellent'
console.log(`  ${MONDAY_EMAIL.sections.clientHealth.encouragement[healthLevel]}`)
console.log()
// Clients needing attention
if (sampleData.clientHealth.clientsNeedingAttention.length > 0) {
  console.log('  Clients needing attention:')
  sampleData.clientHealth.clientsNeedingAttention.forEach((client) => {
    const statusLabel = MONDAY_EMAIL.sections.clientHealth.statusLabels[client.status]
    console.log(`    ${statusLabel} ${client.clientName}: Score ${client.healthScore} | NPS: ${client.npsScore} | Compliance: ${client.compliancePercentage}%`)
  })
  console.log()
}
console.log(`  ${MONDAY_EMAIL.sections.clientHealth.viewAllLink}`)
console.log()

// Weekly Schedule
console.log(`${MONDAY_EMAIL.sections.weeklySchedule.icon} ${MONDAY_EMAIL.sections.weeklySchedule.title}`)
console.log('─'.repeat(40))
sampleData.meetings.thisWeek.forEach((meeting) => {
  console.log(`  📅 ${meeting.date} ${meeting.time}: ${meeting.title} (${meeting.clientName})`)
})
console.log()
console.log(`  ${MONDAY_EMAIL.sections.weeklySchedule.viewAllLink}`)
console.log()

// 1-on-1 Prep with Dimitri
console.log(`${MONDAY_EMAIL.sections.oneOnOne.icon} ${MONDAY_EMAIL.sections.oneOnOne.title}`)
console.log('─'.repeat(40))
console.log(`  ${MONDAY_EMAIL.sections.oneOnOne.description}`)
console.log()
console.log(`  📌 ${MONDAY_EMAIL.sections.oneOnOne.suggestedTopics.wins}`)
console.log(`    - ${MONDAY_EMAIL.sections.oneOnOne.topicTemplates.arSuccess.replace('{client}', 'Grampians Health')}`)
console.log()
console.log(`  📌 ${MONDAY_EMAIL.sections.oneOnOne.suggestedTopics.challenges}`)
console.log(`    - ${MONDAY_EMAIL.sections.oneOnOne.topicTemplates.renewalStrategy.replace('{client}', 'Peninsula Health').replace('{days}', '7')}`)
console.log()
console.log(`  📌 ${MONDAY_EMAIL.sections.oneOnOne.suggestedTopics.clientInsights}`)
console.log(`    - ${MONDAY_EMAIL.sections.oneOnOne.topicTemplates.npsImprovement.replace('{client}', 'Alfred Health').replace('{score}', '6')}`)
console.log()

// Development
console.log(`${MONDAY_EMAIL.sections.development.icon} ${MONDAY_EMAIL.sections.development.title}`)
console.log('─'.repeat(40))
console.log(`  ${MONDAY_EMAIL.sections.development.prompts[0]}`)
console.log()

// Wellbeing
console.log(`${MONDAY_EMAIL.sections.wellbeing.icon} ${MONDAY_EMAIL.sections.wellbeing.title}`)
console.log('─'.repeat(40))
console.log(`  💡 ${MONDAY_EMAIL.sections.wellbeing.tips[0].tip}`)
console.log()
console.log(`  ✨ "${MONDAY_EMAIL.sections.wellbeing.affirmations[0]}"`)
console.log()

// Closing
console.log('─'.repeat(70))
console.log()
console.log(MONDAY_EMAIL.closing.standard)
console.log(MONDAY_EMAIL.closing.encouragement)
console.log()
console.log(MONDAY_EMAIL.closing.signOff)
console.log(MONDAY_EMAIL.closing.signature)
console.log(MONDAY_EMAIL.closing.tagline)
console.log()
console.log('─'.repeat(40))
console.log(MONDAY_EMAIL.footer.generatedAt
  .replace('{date}', new Date().toLocaleDateString('en-AU'))
  .replace('{time}', new Date().toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })))
console.log()

// =============================================================================
// ChaSen WEDNESDAY EMAIL PREVIEW
// =============================================================================
console.log()
console.log('═'.repeat(70))
console.log(`✨ ${CHASEN_BRANDING.name} - WEDNESDAY EMAIL PREVIEW`)
console.log(`   "Mid-Week Check-In"`)
console.log('═'.repeat(70))
console.log()

const wednesdaySubject = WEDNESDAY_EMAIL.subject
  .replace('{completed}', '3')
  .replace('{total}', '6')

console.log(`📧 SUBJECT: ${wednesdaySubject}`)
console.log()
console.log('─'.repeat(70))
console.log()

console.log(WEDNESDAY_EMAIL.greetings[0].replace('{name}', 'Sarah'))
console.log()
console.log(WEDNESDAY_EMAIL.intro.good)
console.log()

// Progress Dashboard
console.log(`${WEDNESDAY_EMAIL.sections.progressDashboard.icon} ${WEDNESDAY_EMAIL.sections.progressDashboard.title}`)
console.log('─'.repeat(40))
console.log(`  ✅ ${WEDNESDAY_EMAIL.sections.progressDashboard.labels.completed}: ${sampleData.weeklyProgress.actionsCompleted}`)
console.log(`  🔄 ${WEDNESDAY_EMAIL.sections.progressDashboard.labels.inProgress}: ${sampleData.weeklyProgress.actionsInProgress}`)
console.log(`  ⏳ ${WEDNESDAY_EMAIL.sections.progressDashboard.labels.notStarted}: ${sampleData.weeklyProgress.actionsRecommended - sampleData.weeklyProgress.actionsCompleted - sampleData.weeklyProgress.actionsInProgress}`)
console.log()
console.log(`  ${WEDNESDAY_EMAIL.sections.progressDashboard.encouragement.good}`)
console.log()

// What's Changed
console.log(`${WEDNESDAY_EMAIL.sections.weekChanges.icon} ${WEDNESDAY_EMAIL.sections.weekChanges.title}`)
console.log('─'.repeat(40))
console.log(`  💰 ${WEDNESDAY_EMAIL.sections.weekChanges.labels.arPaid}: ${formatCurrency(sampleData.ar.paidThisWeek)}`)
console.log(`  ✅ ${WEDNESDAY_EMAIL.sections.weekChanges.labels.meetingsCompleted}: ${sampleData.meetings.completed.length}`)
console.log()

// Encouragement
console.log(`${WEDNESDAY_EMAIL.sections.encouragement.icon} ${WEDNESDAY_EMAIL.sections.encouragement.title}`)
console.log('─'.repeat(40))
console.log(`  ${WEDNESDAY_EMAIL.sections.encouragement.messages[0]}`)
console.log()

// Closing
console.log('─'.repeat(70))
console.log()
console.log(WEDNESDAY_EMAIL.closing.standard)
console.log()
console.log(WEDNESDAY_EMAIL.closing.signOff)
console.log(WEDNESDAY_EMAIL.closing.signature)
console.log()

// =============================================================================
// ChaSen FRIDAY EMAIL PREVIEW
// =============================================================================
console.log()
console.log('═'.repeat(70))
console.log(`✨ ${CHASEN_BRANDING.name} - FRIDAY EMAIL PREVIEW`)
console.log(`   "Week in Review"`)
console.log('═'.repeat(70))
console.log()

const fridaySubject = FRIDAY_EMAIL.subject.replace('{headline}', FRIDAY_EMAIL.headlines.arPaid.replace('{amount}', '67,500'))

console.log(`📧 SUBJECT: ${fridaySubject}`)
console.log()
console.log('─'.repeat(70))
console.log()

console.log(FRIDAY_EMAIL.greetings[0].replace('{name}', 'Sarah'))
console.log()
console.log(FRIDAY_EMAIL.intro.great)
console.log()

// Wins
console.log(`${FRIDAY_EMAIL.sections.wins.icon} ${FRIDAY_EMAIL.sections.wins.title}`)
console.log('─'.repeat(40))
sampleData.wins.forEach((win) => {
  console.log(`  🏆 ${win.description}`)
})
console.log()
console.log(`  ${FRIDAY_EMAIL.sections.wins.celebration.great}`)
console.log()

// Goal Progress
console.log(`${FRIDAY_EMAIL.sections.goalProgress.icon} ${FRIDAY_EMAIL.sections.goalProgress.title}`)
console.log('─'.repeat(40))
sampleData.goals.forEach((goal) => {
  const statusLabel = FRIDAY_EMAIL.sections.goalProgress.statusLabels[goal.status]
  console.log(`  ${statusLabel} ${goal.metric}: ${goal.actual}${goal.unit} / ${goal.goal}${goal.unit}`)
})
console.log()

// Recognition
console.log(`${FRIDAY_EMAIL.sections.recognition.icon} ${FRIDAY_EMAIL.sections.recognition.title}`)
console.log('─'.repeat(40))
console.log(`  ${FRIDAY_EMAIL.sections.recognition.templates.persistence.replace('{name}', 'Sarah').replace('{client}', 'Grampians Health')}`)
console.log()

// Reflection
console.log(`${FRIDAY_EMAIL.sections.reflection.icon} ${FRIDAY_EMAIL.sections.reflection.title}`)
console.log('─'.repeat(40))
console.log(`  💭 ${FRIDAY_EMAIL.sections.reflection.prompts[0]}`)
console.log()

// Weekend Wellbeing
console.log(`${FRIDAY_EMAIL.sections.weekendWellbeing.icon} ${FRIDAY_EMAIL.sections.weekendWellbeing.title}`)
console.log('─'.repeat(40))
console.log(`  🌿 ${FRIDAY_EMAIL.sections.weekendWellbeing.tips[0]}`)
console.log()

// Closing
console.log('─'.repeat(70))
console.log()
console.log(FRIDAY_EMAIL.closing.standard)
console.log()
console.log(FRIDAY_EMAIL.closing.signOff)
console.log(FRIDAY_EMAIL.closing.signature)
console.log(FRIDAY_EMAIL.closing.tagline)
console.log()

// =============================================================================
// Dashboard URLs
// =============================================================================
console.log()
console.log('═'.repeat(70))
console.log('🔗 DASHBOARD LINKS')
console.log('═'.repeat(70))
console.log()
console.log(`  Base URL: ${CHASEN_BRANDING.dashboardUrls.base}`)
Object.entries(CHASEN_BRANDING.dashboardUrls).forEach(([key, url]) => {
  if (key !== 'base') {
    console.log(`  • ${key}: ${CHASEN_BRANDING.dashboardUrls.base}${url}`)
  }
})
console.log()

console.log('═'.repeat(70))
console.log(`✨ ${CHASEN_BRANDING.name} - ${CHASEN_BRANDING.tagline}`)
console.log('═'.repeat(70))
console.log()
