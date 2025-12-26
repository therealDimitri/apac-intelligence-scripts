#!/usr/bin/env node
/**
 * Preview CSE Weekly Email Template
 * Generates HTML preview with sample data and opens in browser
 */

import { render } from '@react-email/render'
import { writeFileSync } from 'fs'
import { exec } from 'child_process'

// Dynamic import for the template
const { default: CSEWeeklyEmail } = await import('../src/lib/emails/templates/CSEWeeklyEmail.tsx')

// Sample data matching CSEWeeklyEmailProps interface
const sampleData = {
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
    {
      clientName: 'Metro Health Network',
      npsScore: 65,
      healthStatus: 'healthy',
      lastMeetingDate: '2024-12-20',
      nextMeetingDate: '2025-01-06',
      openActions: 2,
      arrValue: 450000,
      trend: 'up',
      trendValue: '+8',
    },
    {
      clientName: 'Regional Medical Centre',
      npsScore: 18,
      healthStatus: 'at_risk',
      lastMeetingDate: '2024-12-15',
      nextMeetingDate: '2025-01-07',
      openActions: 5,
      arrValue: 280000,
      trend: 'down',
      trendValue: '-12',
    },
    {
      clientName: 'Coastal Care Clinic',
      npsScore: 38,
      healthStatus: 'healthy',
      lastMeetingDate: '2024-12-22',
      nextMeetingDate: '2025-01-08',
      openActions: 1,
      arrValue: 125000,
      trend: 'neutral',
      trendValue: '0',
    },
    {
      clientName: 'Valley Health Partners',
      npsScore: 55,
      healthStatus: 'healthy',
      lastMeetingDate: '2024-12-18',
      nextMeetingDate: null,
      openActions: 3,
      arrValue: 320000,
      trend: 'up',
      trendValue: '+5',
    },
    {
      clientName: 'Mountain View Hospital',
      npsScore: 12,
      healthStatus: 'critical',
      lastMeetingDate: '2024-11-30',
      nextMeetingDate: '2025-01-04',
      openActions: 8,
      arrValue: 580000,
      trend: 'down',
      trendValue: '-18',
    },
  ],

  actions: [
    {
      title: 'Urgent: Address Mountain View Hospital escalation',
      priority: 'critical',
      dueDate: '2025-01-04',
      clientName: 'Mountain View Hospital',
      actionUrl: 'https://apac-cs-dashboards.com/actions/1',
    },
    {
      title: 'Follow up on Regional Medical Centre implementation issues',
      priority: 'high',
      dueDate: '2025-01-06',
      clientName: 'Regional Medical Centre',
      actionUrl: 'https://apac-cs-dashboards.com/actions/2',
    },
    {
      title: 'Prepare renewal proposal for Coastal Care Clinic',
      priority: 'medium',
      dueDate: '2025-01-08',
      clientName: 'Coastal Care Clinic',
      actionUrl: 'https://apac-cs-dashboards.com/actions/3',
    },
    {
      title: 'Schedule QBR with Metro Health Network',
      priority: 'low',
      dueDate: '2025-01-10',
      clientName: 'Metro Health Network',
      actionUrl: 'https://apac-cs-dashboards.com/actions/4',
    },
  ],

  insights: [
    {
      type: 'warning',
      priority: 'critical',
      title: 'Mountain View Hospital Needs Immediate Attention',
      insight: 'NPS dropped 18 points. Multiple open support tickets and delayed implementation milestones.',
      recommendation: 'Schedule executive sponsor call within 48 hours.',
      confidence: 0.92,
    },
    {
      type: 'opportunity',
      priority: 'high',
      title: 'Valley Health Partners Expansion Ready',
      insight: 'Client expressed interest in additional modules. Engagement scores trending up.',
      recommendation: 'Prepare expansion proposal with ROI analysis.',
      confidence: 0.85,
    },
    {
      type: 'info',
      priority: 'medium',
      title: 'Your Portfolio NPS Improving',
      insight: 'Portfolio NPS increased 5 points this month, now 8 points above team average.',
      recommendation: 'Document successful engagement strategies for team sharing.',
      confidence: 0.98,
    },
  ],

  upcomingMeetings: [
    {
      clientName: 'Mountain View Hospital',
      date: '2025-01-04',
      time: '9:00 AM',
      type: 'Escalation Review',
      preparationStatus: 'needs_prep',
    },
    {
      clientName: 'Metro Health Network',
      date: '2025-01-06',
      time: '10:00 AM',
      type: 'QBR',
      preparationStatus: 'ready',
    },
    {
      clientName: 'Regional Medical Centre',
      date: '2025-01-07',
      time: '2:00 PM',
      type: 'Implementation Review',
      preparationStatus: 'needs_prep',
    },
    {
      clientName: 'Coastal Care Clinic',
      date: '2025-01-08',
      time: '11:00 AM',
      type: 'Renewal Discussion',
      preparationStatus: 'not_started',
    },
  ],

  wellbeingTips: [
    {
      title: 'Take Breaks Between Client Calls',
      description: 'Research shows 5-minute breaks between meetings improve focus and reduce stress.',
      actionUrl: 'https://apac-cs-dashboards.com/wellness/breaks',
    },
    {
      title: 'Block Focus Time',
      description: 'Schedule 2-hour blocks for deep work on proposals and strategic planning.',
    },
  ],

  developmentResources: [
    {
      title: 'Handling Difficult Escalation Conversations',
      type: 'video',
      duration: '15 min',
      url: 'https://apac-cs-dashboards.com/learning/escalations',
    },
    {
      title: 'Risk Mitigation Best Practices',
      type: 'article',
      duration: '8 min read',
      url: 'https://apac-cs-dashboards.com/learning/risk',
    },
  ],

  teamBenchmarks: [
    {
      metric: 'NPS Score',
      yourValue: 42,
      teamAverage: 34,
      unit: 'pts',
      maxValue: 100,
    },
    {
      metric: 'Action Completion',
      yourValue: 83,
      teamAverage: 76,
      unit: '%',
      maxValue: 100,
    },
    {
      metric: 'Response Rate',
      yourValue: 94,
      teamAverage: 88,
      unit: '%',
      maxValue: 100,
    },
  ],

  streak: {
    current: 4,
    best: 7,
    type: 'meetings',
  },
}

console.log('🎨 Rendering CSE Weekly Email template...')

try {
  const html = await render(CSEWeeklyEmail(sampleData), { pretty: true })

  // Write to temp file
  const outputPath = '/tmp/cse-email-preview.html'
  writeFileSync(outputPath, html)

  console.log(`✅ Email rendered successfully!`)
  console.log(`📄 Output saved to: ${outputPath}`)
  console.log(`🚀 Opening in browser...`)

  // Open in default browser
  exec(`open "${outputPath}"`, (error) => {
    if (error) {
      console.error('Could not open browser:', error.message)
      console.log('Please open the file manually:', outputPath)
    }
  })

} catch (error) {
  console.error('❌ Error rendering email:', error)
  process.exit(1)
}
