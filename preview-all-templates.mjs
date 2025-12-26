#!/usr/bin/env node
/**
 * Preview All Email Templates
 * Generates HTML previews for CSE, Manager, and Executive templates
 */

import { render } from '@react-email/render'
import { writeFileSync } from 'fs'
import { exec } from 'child_process'

// Dynamic imports for templates
const { default: CSEWeeklyEmail } = await import('../src/lib/emails/templates/CSEWeeklyEmail.tsx')
const { default: ManagerWeeklyEmail } = await import('../src/lib/emails/templates/ManagerWeeklyEmail.tsx')
const { default: ExecutiveWeeklyEmail } = await import('../src/lib/emails/templates/ExecutiveWeeklyEmail.tsx')

// ============================================================================
// CSE SAMPLE DATA
// ============================================================================
const cseData = {
  cseName: 'Sarah Chen',
  weekEnding: '2025-01-03',
  dashboardUrl: 'https://apac-cs-dashboards.com',
  metrics: {
    npsScore: 42,
    npsChange: 5,
    clientsAtRisk: 2,
    completedActions: 15,
    totalActions: 18,
    meetingsCompleted: 8,
    meetingsScheduled: 12,
    responseRate: 94,
  },
  historicalData: {
    npsScores: [35, 38, 40, 42, 42],
    actionCompletion: [78, 82, 85, 88, 83],
    meetingCounts: [6, 8, 7, 9, 8],
  },
  clients: [
    { clientName: 'Metro Health Network', npsScore: 65, healthStatus: 'healthy', lastMeetingDate: '2024-12-20', nextMeetingDate: '2025-01-06', openActions: 2, arrValue: 450000, trend: 'up', trendValue: '+8' },
    { clientName: 'Regional Medical Centre', npsScore: 18, healthStatus: 'at_risk', lastMeetingDate: '2024-12-15', nextMeetingDate: '2025-01-07', openActions: 5, arrValue: 280000, trend: 'down', trendValue: '-12' },
    { clientName: 'Coastal Care Clinic', npsScore: 38, healthStatus: 'healthy', lastMeetingDate: '2024-12-22', nextMeetingDate: '2025-01-08', openActions: 1, arrValue: 125000, trend: 'neutral', trendValue: '0' },
    { clientName: 'Valley Health Partners', npsScore: 55, healthStatus: 'healthy', lastMeetingDate: '2024-12-18', nextMeetingDate: null, openActions: 3, arrValue: 320000, trend: 'up', trendValue: '+5' },
    { clientName: 'Mountain View Hospital', npsScore: 12, healthStatus: 'critical', lastMeetingDate: '2024-11-30', nextMeetingDate: '2025-01-04', openActions: 8, arrValue: 580000, trend: 'down', trendValue: '-18' },
  ],
  actions: [
    { title: 'Urgent: Address Mountain View Hospital escalation', priority: 'critical', dueDate: '2025-01-04', clientName: 'Mountain View Hospital', actionUrl: 'https://apac-cs-dashboards.com/actions/1' },
    { title: 'Follow up on Regional Medical Centre implementation issues', priority: 'high', dueDate: '2025-01-06', clientName: 'Regional Medical Centre', actionUrl: 'https://apac-cs-dashboards.com/actions/2' },
    { title: 'Prepare renewal proposal for Coastal Care Clinic', priority: 'medium', dueDate: '2025-01-08', clientName: 'Coastal Care Clinic', actionUrl: 'https://apac-cs-dashboards.com/actions/3' },
    { title: 'Schedule QBR with Metro Health Network', priority: 'low', dueDate: '2025-01-10', clientName: 'Metro Health Network', actionUrl: 'https://apac-cs-dashboards.com/actions/4' },
  ],
  insights: [
    { type: 'warning', priority: 'critical', title: 'Mountain View Hospital Needs Immediate Attention', insight: 'NPS dropped 18 points. Multiple open support tickets and delayed implementation milestones.', recommendation: 'Schedule executive sponsor call within 48 hours.', confidence: 0.92 },
    { type: 'opportunity', priority: 'high', title: 'Valley Health Partners Expansion Ready', insight: 'Client expressed interest in additional modules. Engagement scores trending up.', recommendation: 'Prepare expansion proposal with ROI analysis.', confidence: 0.85 },
    { type: 'info', priority: 'medium', title: 'Your Portfolio NPS Improving', insight: 'Portfolio NPS increased 5 points this month, now 8 points above team average.', recommendation: 'Document successful engagement strategies for team sharing.', confidence: 0.98 },
  ],
  upcomingMeetings: [
    { clientName: 'Mountain View Hospital', date: '2025-01-04', time: '9:00 AM', type: 'Escalation Review', preparationStatus: 'needs_prep' },
    { clientName: 'Metro Health Network', date: '2025-01-06', time: '10:00 AM', type: 'QBR', preparationStatus: 'ready' },
    { clientName: 'Regional Medical Centre', date: '2025-01-07', time: '2:00 PM', type: 'Implementation Review', preparationStatus: 'needs_prep' },
    { clientName: 'Coastal Care Clinic', date: '2025-01-08', time: '11:00 AM', type: 'Renewal Discussion', preparationStatus: 'not_started' },
  ],
  wellbeingTips: [
    { title: 'Take Breaks Between Client Calls', description: 'Research shows 5-minute breaks between meetings improve focus and reduce stress.', actionUrl: 'https://apac-cs-dashboards.com/wellness/breaks' },
    { title: 'Block Focus Time', description: 'Schedule 2-hour blocks for deep work on proposals and strategic planning.' },
  ],
  developmentResources: [
    { title: 'Handling Difficult Escalation Conversations', type: 'video', duration: '15 min', url: 'https://apac-cs-dashboards.com/learning/escalations' },
    { title: 'Risk Mitigation Best Practices', type: 'article', duration: '8 min read', url: 'https://apac-cs-dashboards.com/learning/risk' },
  ],
  teamBenchmarks: [
    { metric: 'NPS Score', yourValue: 42, teamAverage: 34, unit: 'pts', maxValue: 100 },
    { metric: 'Action Completion', yourValue: 83, teamAverage: 76, unit: '%', maxValue: 100 },
    { metric: 'Response Rate', yourValue: 94, teamAverage: 88, unit: '%', maxValue: 100 },
  ],
  streak: { current: 4, best: 7, type: 'meetings' },
}

// ============================================================================
// MANAGER SAMPLE DATA
// ============================================================================
const managerData = {
  managerName: 'Michael Thompson',
  weekEnding: '2025-01-03',
  dashboardUrl: 'https://apac-cs-dashboards.com/manager',
  teamMetrics: {
    teamSize: 6,
    totalClients: 48,
    avgTeamNPS: 38,
    npsChange: 3,
    totalClientsAtRisk: 5,
    teamActionCompletionRate: 86,
    teamMeetingsCompleted: 45,
    portfolioARR: 14500000,
    arrAtRisk: 1250000,
  },
  historicalData: {
    teamNPS: [34, 35, 36, 37, 38],
    actionCompletion: [82, 84, 85, 85, 86],
    clientsAtRisk: [7, 6, 6, 5, 5],
  },
  csePerformance: [
    { cseName: 'Sarah Chen', portfolioSize: 12, avgNPS: 42, clientsAtRisk: 2, actionCompletionRate: 83, meetingsCompleted: 8, status: 'exceeding' },
    { cseName: 'James Wilson', portfolioSize: 10, avgNPS: 40, clientsAtRisk: 1, actionCompletionRate: 88, meetingsCompleted: 7, status: 'exceeding' },
    { cseName: 'Emily Rodriguez', portfolioSize: 8, avgNPS: 38, clientsAtRisk: 1, actionCompletionRate: 86, meetingsCompleted: 8, status: 'meeting' },
    { cseName: 'David Park', portfolioSize: 9, avgNPS: 35, clientsAtRisk: 0, actionCompletionRate: 89, meetingsCompleted: 9, status: 'meeting' },
    { cseName: 'Lisa Martinez', portfolioSize: 5, avgNPS: 32, clientsAtRisk: 1, actionCompletionRate: 67, meetingsCompleted: 6, status: 'needs_support' },
    { cseName: 'Tom Anderson', portfolioSize: 4, avgNPS: 28, clientsAtRisk: 0, actionCompletionRate: 100, meetingsCompleted: 7, status: 'needs_support' },
  ],
  escalations: [
    { title: 'Mountain View Hospital - Critical implementation delays', cseName: 'Sarah Chen', clientName: 'Mountain View Hospital', escalationType: 'support_issue', priority: 'critical', dueDate: '2025-01-04', actionUrl: 'https://apac-cs-dashboards.com/escalations/1' },
    { title: 'Pacific Healthcare - Executive sponsor disengaged', cseName: 'Lisa Martinez', clientName: 'Pacific Healthcare', escalationType: 'churn_risk', priority: 'high', dueDate: '2025-01-06', actionUrl: 'https://apac-cs-dashboards.com/escalations/2' },
    { title: 'Northern Clinic Group - Renewal at risk', cseName: 'Tom Anderson', clientName: 'Northern Clinic Group', escalationType: 'contract_renewal', priority: 'high', dueDate: '2025-01-08', actionUrl: 'https://apac-cs-dashboards.com/escalations/3' },
  ],
  crossPortfolioRisks: [
    { riskType: 'Implementation Delays', affectedClients: ['Mountain View Hospital', 'Pacific Healthcare'], affectedCSEs: ['Sarah Chen', 'Lisa Martinez'], severity: 'critical', description: 'Multiple enterprise clients experiencing implementation delays due to resource constraints.', recommendedAction: 'Escalate to implementation team lead for resource reallocation.' },
    { riskType: 'NPS Decline Pattern', affectedClients: ['Northern Clinic Group', 'Valley Medical'], affectedCSEs: ['Tom Anderson', 'David Park'], severity: 'medium', description: 'Two mid-market clients showing similar NPS decline patterns after recent product update.', recommendedAction: 'Schedule joint review with product team to address common issues.' },
  ],
  teamRecognition: [
    { cseName: 'Sarah Chen', achievement: 'Closed $80k expansion with Valley Health Partners', metric: '+$80k ARR', icon: '🏆' },
    { cseName: 'James Wilson', achievement: 'Secured 3-year renewal with Coastal Care Clinic', metric: '100% retention', icon: '⭐' },
    { cseName: 'David Park', achievement: 'Achieved 100% action completion rate', metric: '18/18 actions', icon: '🎯' },
  ],
  insights: [
    { type: 'warning', priority: 'high', title: 'Lisa Martinez Needs Support', insight: 'NPS trending down for 3 consecutive weeks. Two clients showing disengagement patterns.', recommendation: 'Schedule 1:1 coaching session to review engagement strategies.', confidence: 0.88 },
    { type: 'success', priority: 'medium', title: 'Sarah Chen Exceeding Targets', insight: 'Top performer with 23% above team average NPS. Excellent client retention.', recommendation: 'Consider peer mentoring program or knowledge sharing session.', confidence: 0.95 },
    { type: 'opportunity', priority: 'medium', title: '$1.2M Expansion Pipeline', insight: '4 clients showing strong expansion signals across the team.', recommendation: 'Review expansion opportunities in next team meeting.', confidence: 0.82 },
  ],
  actions: [
    { title: 'Review Mountain View Hospital escalation with Sarah', priority: 'critical', dueDate: '2025-01-04', actionUrl: 'https://apac-cs-dashboards.com/actions/m1' },
    { title: 'Coach Lisa Martinez on at-risk client strategy', priority: 'high', dueDate: '2025-01-06', actionUrl: 'https://apac-cs-dashboards.com/actions/m2' },
    { title: 'Prepare Q1 team targets presentation', priority: 'medium', dueDate: '2025-01-10', actionUrl: 'https://apac-cs-dashboards.com/actions/m3' },
  ],
  regionalBenchmark: {
    yourTeamNPS: 38,
    regionalAvgNPS: 34,
    yourTeamPercentile: 78,
    totalTeams: 12,
  },
}

// ============================================================================
// EXECUTIVE SAMPLE DATA
// ============================================================================
const executiveData = {
  executiveName: 'Jennifer Walsh',
  weekEnding: '2025-01-03',
  dashboardUrl: 'https://apac-cs-dashboards.com/executive',
  portfolioMetrics: {
    totalARR: 48500000,
    arrChange: 125000,
    arrAtRisk: 4200000,
    avgPortfolioNPS: 36,
    npsChange: 2,
    totalClients: 156,
    clientsAtRisk: 12,
    churnProbability: 8.5,
    projectedChurn: 2100000,
    netRevenueTrend: 'up',
  },
  historicalData: {
    arr: [47800000, 48000000, 48200000, 48350000, 48500000],
    nps: [33, 34, 35, 35, 36],
    churnRisk: [10, 9.5, 9, 8.8, 8.5],
  },
  segmentPerformance: [
    { segment: 'Enterprise', clientCount: 24, arr: 28500000, nps: 32, churnRisk: 'high', trend: 'declining' },
    { segment: 'Mid-Market', clientCount: 58, arr: 14200000, nps: 42, churnRisk: 'low', trend: 'improving' },
    { segment: 'SMB', clientCount: 74, arr: 5800000, nps: 38, churnRisk: 'medium', trend: 'stable' },
  ],
  strategicAlerts: [
    { title: 'Enterprise Segment NPS Declining', severity: 'critical', impact: '$2.1M ARR at risk', arrImpact: 2100000, affectedClients: 5, recommendedAction: 'Executive sponsor engagement recommended for top 5 enterprise accounts.', timeframe: 'Immediate' },
    { title: 'Q1 Renewal Pipeline Strong', severity: 'medium', impact: '$12.4M in Q1 renewals', arrImpact: 12400000, affectedClients: 28, recommendedAction: 'Review 2 flagged accounts in weekly leadership sync.', timeframe: 'This week' },
    { title: 'Expansion Opportunity in Healthcare', severity: 'medium', impact: '$3.2M potential', arrImpact: 3200000, affectedClients: 8, recommendedAction: 'Align sales and CS for coordinated expansion plays.', timeframe: 'Q1 2025' },
  ],
  strategicInsights: [
    { type: 'warning', priority: 'critical', title: 'Enterprise Segment Requires Intervention', insight: 'Enterprise clients showing 8-point NPS decline over 4 weeks. 3 renewal conversations at risk totalling $2.1M ARR.', recommendation: 'Schedule executive sponsor calls with top 5 enterprise accounts.', confidence: 0.91 },
    { type: 'opportunity', priority: 'high', title: 'Healthcare Vertical Expansion Ready', insight: '8 healthcare clients showing strong expansion signals. Combined potential of $3.2M additional ARR.', recommendation: 'Coordinate sales and CS for Q1 expansion campaign.', confidence: 0.87 },
    { type: 'info', priority: 'medium', title: 'Mid-Market Segment Outperforming', insight: 'Mid-market NPS up 10 points YoY. Lowest churn risk across all segments.', recommendation: 'Document best practices for cross-segment application.', confidence: 0.94 },
  ],
  investmentRecommendations: [
    { title: 'Enterprise Success Manager', category: 'resource', expectedROI: '3.2x within 12 months', investmentLevel: 'high', priority: 'critical', description: 'Dedicated senior resource for top 10 enterprise accounts', businessCase: 'Current enterprise churn risk of $2.1M could be reduced by 60% with dedicated support.' },
    { title: 'Predictive Health Score Tool', category: 'technology', expectedROI: '2.5x within 18 months', investmentLevel: 'medium', priority: 'high', description: 'AI-powered early warning system for at-risk accounts', businessCase: 'Early detection could prevent 40% of churn, saving $840K annually.' },
    { title: 'CSE Training Program', category: 'training', expectedROI: '1.8x within 6 months', investmentLevel: 'low', priority: 'medium', description: 'Advanced negotiation and escalation handling', businessCase: 'Improved resolution times and customer satisfaction.' },
  ],
  yoyComparison: {
    arrGrowth: 12,
    npsChange: 8,
    clientGrowth: 15,
  },
}

// ============================================================================
// RENDER ALL TEMPLATES
// ============================================================================
console.log('🎨 Rendering all email templates...\n')

const templates = [
  { name: 'CSE Weekly Email', component: CSEWeeklyEmail, data: cseData, outputFile: '/tmp/email-preview-cse.html' },
  { name: 'Manager Weekly Email', component: ManagerWeeklyEmail, data: managerData, outputFile: '/tmp/email-preview-manager.html' },
  { name: 'Executive Weekly Email', component: ExecutiveWeeklyEmail, data: executiveData, outputFile: '/tmp/email-preview-executive.html' },
]

for (const template of templates) {
  try {
    console.log(`📧 Rendering ${template.name}...`)
    const html = await render(template.component(template.data), { pretty: true })
    writeFileSync(template.outputFile, html)
    console.log(`   ✅ Saved to: ${template.outputFile}`)
  } catch (error) {
    console.error(`   ❌ Error rendering ${template.name}:`, error.message)
  }
}

console.log('\n🚀 Opening all previews in browser...')

// Open all in browser
exec('open /tmp/email-preview-cse.html')
setTimeout(() => exec('open /tmp/email-preview-manager.html'), 500)
setTimeout(() => exec('open /tmp/email-preview-executive.html'), 1000)

console.log('\n✨ Done! Check your browser for all 3 email previews.')
