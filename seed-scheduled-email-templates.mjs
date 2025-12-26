#!/usr/bin/env node
/**
 * Seed Scheduled Email Templates
 *
 * Adds the existing ChaSen scheduled emails to the Email Template Studio
 * as read-only system templates that users can view and duplicate.
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

const SCHEDULED_TEMPLATES = [
  {
    name: 'CSE Monday - Week Ahead Focus',
    description: 'Automated weekly email sent every Monday at 7:00 AM Sydney time. Provides CSEs with portfolio overview, priority actions, client health insights, and upcoming renewals to focus on for the week.',
    category: 'general',
    segments: ['giants', 'sleeping-giants', 'leverage', 'collaborate', 'nurture', 'maintain'],
    stakeholder_types: [],
    subject: '🍵 ChaSen Weekly Focus | {name} - {count} priority areas',
    preview_text: 'Your week ahead focus areas and portfolio insights',
    status: 'published',
    visibility: 'organization',
    created_by: 'system',
    blocks: JSON.stringify([
      {
        id: 'header-1',
        type: 'heading',
        content: { text: 'Week Ahead Focus', level: 'h1' },
        settings: { padding: { top: 24, right: 24, bottom: 8, left: 24 } }
      },
      {
        id: 'greeting-1',
        type: 'text',
        content: { html: '<p>Good morning {{recipient.first_name}}! Here\'s your personalised portfolio briefing to start the week strong.</p>' },
        settings: { padding: { top: 8, right: 24, bottom: 16, left: 24 } }
      },
      {
        id: 'metrics-1',
        type: 'metrics',
        content: {
          metrics: [
            { label: 'Active Clients', value: '{{portfolio.total_clients}}', change: 0 },
            { label: 'Health Score', value: '{{portfolio.health_score}}/10', change: 0 },
            { label: 'Priority Actions', value: '{{portfolio.priority_count}}', change: 0 },
            { label: 'Renewals', value: '{{portfolio.renewals_count}}', change: 0 }
          ]
        },
        settings: { padding: { top: 16, right: 24, bottom: 16, left: 24 } }
      },
      {
        id: 'actions-heading',
        type: 'heading',
        content: { text: '🎯 Priority Actions', level: 'h2' },
        settings: { padding: { top: 16, right: 24, bottom: 8, left: 24 } }
      },
      {
        id: 'actions-1',
        type: 'action-items',
        content: {
          items: [
            { text: 'Priority actions will be dynamically populated', completed: false }
          ]
        },
        settings: { padding: { top: 8, right: 24, bottom: 16, left: 24 } }
      },
      {
        id: 'button-1',
        type: 'button',
        content: { text: 'View Full Dashboard', url: 'https://apac-cs-dashboards.com', variant: 'primary' },
        settings: { padding: { top: 16, right: 24, bottom: 24, left: 24 }, textAlign: 'center' }
      }
    ])
  },
  {
    name: 'CSE Wednesday - Mid-Week Checkpoint',
    description: 'Automated mid-week check-in email sent every Wednesday at 7:00 AM Sydney time. Focuses on client engagement progress, meeting follow-ups, and action completion rates.',
    category: 'general',
    segments: ['giants', 'sleeping-giants', 'leverage', 'collaborate', 'nurture', 'maintain'],
    stakeholder_types: [],
    subject: '🍵 ChaSen Mid-Week | {name} - Keep the momentum going',
    preview_text: 'Your mid-week portfolio checkpoint and engagement insights',
    status: 'published',
    visibility: 'organization',
    created_by: 'system',
    blocks: JSON.stringify([
      {
        id: 'header-1',
        type: 'heading',
        content: { text: 'Mid-Week Checkpoint', level: 'h1' },
        settings: { padding: { top: 24, right: 24, bottom: 8, left: 24 } }
      },
      {
        id: 'greeting-1',
        type: 'text',
        content: { html: '<p>Hey {{recipient.first_name}}! Let\'s check in on your week\'s progress and upcoming client engagements.</p>' },
        settings: { padding: { top: 8, right: 24, bottom: 16, left: 24 } }
      },
      {
        id: 'metrics-1',
        type: 'metrics',
        content: {
          metrics: [
            { label: 'Meetings This Week', value: '{{engagement.meetings_count}}', change: 0 },
            { label: 'Actions Completed', value: '{{engagement.completed_count}}', change: 0 },
            { label: 'Follow-ups Due', value: '{{engagement.followups_count}}', change: 0 },
            { label: 'Compliance Rate', value: '{{portfolio.compliance}}%', change: 0 }
          ]
        },
        settings: { padding: { top: 16, right: 24, bottom: 16, left: 24 } }
      },
      {
        id: 'button-1',
        type: 'button',
        content: { text: 'View Meetings', url: 'https://apac-cs-dashboards.com/meetings', variant: 'primary' },
        settings: { padding: { top: 16, right: 24, bottom: 24, left: 24 }, textAlign: 'center' }
      }
    ])
  },
  {
    name: 'CSE Friday - Week in Review',
    description: 'Automated weekly wrap-up email sent every Friday at 3:00 PM Sydney time. Celebrates wins, summarises achievements, and provides reflection prompts for the week.',
    category: 'general',
    segments: ['giants', 'sleeping-giants', 'leverage', 'collaborate', 'nurture', 'maintain'],
    stakeholder_types: [],
    subject: '🍵 ChaSen Week in Review | {name} - Celebrating your progress',
    preview_text: 'Your weekly achievements and reflection for the week',
    status: 'published',
    visibility: 'organization',
    created_by: 'system',
    blocks: JSON.stringify([
      {
        id: 'header-1',
        type: 'heading',
        content: { text: 'Week in Review', level: 'h1' },
        settings: { padding: { top: 24, right: 24, bottom: 8, left: 24 } }
      },
      {
        id: 'greeting-1',
        type: 'text',
        content: { html: '<p>Nice work this week, {{recipient.first_name}}! Let\'s celebrate what you\'ve accomplished and set yourself up for next week.</p>' },
        settings: { padding: { top: 8, right: 24, bottom: 16, left: 24 } }
      },
      {
        id: 'metrics-1',
        type: 'metrics',
        content: {
          metrics: [
            { label: 'Actions Closed', value: '{{weekly.actions_closed}}', change: 0 },
            { label: 'Meetings Held', value: '{{weekly.meetings_held}}', change: 0 },
            { label: 'NPS Responses', value: '{{weekly.nps_responses}}', change: 0 },
            { label: 'Health Improvement', value: '{{weekly.health_change}}', change: 0 }
          ]
        },
        settings: { padding: { top: 16, right: 24, bottom: 16, left: 24 } }
      },
      {
        id: 'quote-1',
        type: 'quote',
        content: { text: 'Weekly reflection: What was your biggest win this week? What would you do differently?', author: 'ChaSen' },
        settings: { padding: { top: 16, right: 24, bottom: 16, left: 24 } }
      },
      {
        id: 'button-1',
        type: 'button',
        content: { text: 'View Weekly Report', url: 'https://apac-cs-dashboards.com', variant: 'primary' },
        settings: { padding: { top: 16, right: 24, bottom: 24, left: 24 }, textAlign: 'center' }
      }
    ])
  },
  {
    name: 'Client Support Weekly Summary',
    description: 'Automated weekly email for Client Support team sent every Monday. Summarises department-specific actions, ticket status, and support metrics.',
    category: 'general',
    segments: [],
    stakeholder_types: [],
    subject: '🍵 ChaSen Client Support | Week Ahead Focus',
    preview_text: 'Your weekly Client Support action summary',
    status: 'published',
    visibility: 'organization',
    created_by: 'system',
    blocks: JSON.stringify([
      {
        id: 'header-1',
        type: 'heading',
        content: { text: 'Client Support Weekly Focus', level: 'h1' },
        settings: { padding: { top: 24, right: 24, bottom: 8, left: 24 } }
      },
      {
        id: 'greeting-1',
        type: 'text',
        content: { html: '<p>Good morning Stephen! Here\'s your Client Support team action summary for the week.</p>' },
        settings: { padding: { top: 8, right: 24, bottom: 16, left: 24 } }
      },
      {
        id: 'metrics-1',
        type: 'metrics',
        content: {
          metrics: [
            { label: 'Total Actions', value: '{{support.total}}', change: 0 },
            { label: 'Open Actions', value: '{{support.open}}', change: 0 },
            { label: 'Completed', value: '{{support.completed}}', change: 0 },
            { label: 'Overdue', value: '{{support.overdue}}', change: 0 }
          ]
        },
        settings: { padding: { top: 16, right: 24, bottom: 16, left: 24 } }
      },
      {
        id: 'actions-1',
        type: 'action-items',
        content: {
          items: [
            { text: 'Support actions will be dynamically populated', completed: false }
          ]
        },
        settings: { padding: { top: 8, right: 24, bottom: 16, left: 24 } }
      },
      {
        id: 'button-1',
        type: 'button',
        content: { text: 'View Actions Dashboard', url: 'https://apac-cs-dashboards.com/actions', variant: 'primary' },
        settings: { padding: { top: 16, right: 24, bottom: 24, left: 24 }, textAlign: 'center' }
      }
    ])
  },
  {
    name: 'EVP Executive Summary',
    description: 'Automated weekly executive briefing sent every Monday to EVP. Includes portfolio health overview, working capital insights, team recognition, segmentation compliance gaps, and Priority Matrix summary.',
    category: 'general',
    segments: [],
    stakeholder_types: ['c-suite'],
    subject: '🍵 ChaSen Executive Brief | APAC Portfolio Intelligence',
    preview_text: 'Your weekly executive portfolio summary with strategic insights',
    status: 'published',
    visibility: 'organization',
    created_by: 'system',
    blocks: JSON.stringify([
      {
        id: 'header-1',
        type: 'heading',
        content: { text: 'APAC Executive Portfolio Brief', level: 'h1' },
        settings: { padding: { top: 24, right: 24, bottom: 8, left: 24 } }
      },
      {
        id: 'greeting-1',
        type: 'text',
        content: { html: '<p>Good morning Todd. Here\'s your weekly executive intelligence summary for the APAC Client Success portfolio.</p>' },
        settings: { padding: { top: 8, right: 24, bottom: 16, left: 24 } }
      },
      {
        id: 'metrics-1',
        type: 'metrics',
        content: {
          metrics: [
            { label: 'Total Clients', value: '{{portfolio.total_clients}}', change: 0 },
            { label: 'Avg Health Score', value: '{{portfolio.avg_health}}/10', change: 0 },
            { label: 'Compliance Rate', value: '{{portfolio.compliance}}%', change: 0 },
            { label: 'Critical Actions', value: '{{actions.critical}}', change: 0 }
          ]
        },
        settings: { padding: { top: 16, right: 24, bottom: 16, left: 24 } }
      },
      {
        id: 'heading-wc',
        type: 'heading',
        content: { text: '💰 Working Capital Overview', level: 'h2' },
        settings: { padding: { top: 16, right: 24, bottom: 8, left: 24 } }
      },
      {
        id: 'metrics-wc',
        type: 'metrics',
        content: {
          metrics: [
            { label: 'Total Outstanding', value: '${{ar.total}}', change: 0 },
            { label: 'At Risk (90+ days)', value: '${{ar.at_risk}}', change: 0 }
          ]
        },
        settings: { padding: { top: 8, right: 24, bottom: 16, left: 24 } }
      },
      {
        id: 'heading-recognition',
        type: 'heading',
        content: { text: '🏆 Team Recognition', level: 'h2' },
        settings: { padding: { top: 16, right: 24, bottom: 8, left: 24 } }
      },
      {
        id: 'text-recognition',
        type: 'text',
        content: { html: '<p>Team achievements and recognition highlights will be dynamically populated based on weekly performance.</p>' },
        settings: { padding: { top: 8, right: 24, bottom: 16, left: 24 } }
      },
      {
        id: 'heading-matrix',
        type: 'heading',
        content: { text: '📊 Priority Matrix Summary', level: 'h2' },
        settings: { padding: { top: 16, right: 24, bottom: 8, left: 24 } }
      },
      {
        id: 'text-matrix',
        type: 'text',
        content: { html: '<p><strong>Do Now:</strong> Critical items requiring immediate attention<br><strong>Plan:</strong> Medium priority items for the week<br><strong>Opportunities:</strong> AI-identified growth areas<br><strong>Inform:</strong> Portfolio insights and trends</p>' },
        settings: { padding: { top: 8, right: 24, bottom: 16, left: 24 } }
      },
      {
        id: 'button-1',
        type: 'button',
        content: { text: 'View Full Dashboard', url: 'https://apac-cs-dashboards.com', variant: 'primary' },
        settings: { padding: { top: 16, right: 24, bottom: 24, left: 24 }, textAlign: 'center' }
      }
    ])
  },
  {
    name: 'Manager Weekly Digest',
    description: 'Weekly summary for CS Managers with team performance metrics, portfolio health trends, and escalation highlights.',
    category: 'general',
    segments: [],
    stakeholder_types: [],
    subject: '🍵 ChaSen Manager Brief | Team Performance Summary',
    preview_text: 'Your weekly team and portfolio performance digest',
    status: 'published',
    visibility: 'organization',
    created_by: 'system',
    blocks: JSON.stringify([
      {
        id: 'header-1',
        type: 'heading',
        content: { text: 'Manager Weekly Digest', level: 'h1' },
        settings: { padding: { top: 24, right: 24, bottom: 8, left: 24 } }
      },
      {
        id: 'greeting-1',
        type: 'text',
        content: { html: '<p>Good morning {{recipient.first_name}}! Here\'s your team performance summary and portfolio insights for the week.</p>' },
        settings: { padding: { top: 8, right: 24, bottom: 16, left: 24 } }
      },
      {
        id: 'metrics-team',
        type: 'metrics',
        content: {
          metrics: [
            { label: 'Team Health Avg', value: '{{team.avg_health}}/10', change: 0 },
            { label: 'Actions Completed', value: '{{team.actions_completed}}', change: 0 },
            { label: 'Meetings Held', value: '{{team.meetings_held}}', change: 0 },
            { label: 'Compliance Rate', value: '{{team.compliance}}%', change: 0 }
          ]
        },
        settings: { padding: { top: 16, right: 24, bottom: 16, left: 24 } }
      },
      {
        id: 'heading-cse',
        type: 'heading',
        content: { text: '👥 CSE Performance Breakdown', level: 'h2' },
        settings: { padding: { top: 16, right: 24, bottom: 8, left: 24 } }
      },
      {
        id: 'text-cse',
        type: 'text',
        content: { html: '<p>Individual CSE metrics and workload distribution will be dynamically populated.</p>' },
        settings: { padding: { top: 8, right: 24, bottom: 16, left: 24 } }
      },
      {
        id: 'button-1',
        type: 'button',
        content: { text: 'View Team Dashboard', url: 'https://apac-cs-dashboards.com', variant: 'primary' },
        settings: { padding: { top: 16, right: 24, bottom: 24, left: 24 }, textAlign: 'center' }
      }
    ])
  }
]

async function seedTemplates() {
  console.log('🌱 Seeding scheduled email templates...\n')

  for (const template of SCHEDULED_TEMPLATES) {
    // Check if template already exists
    const { data: existing } = await supabase
      .from('email_templates')
      .select('id, name')
      .eq('name', template.name)
      .single()

    if (existing) {
      console.log(`⏭️  Skipping "${template.name}" - already exists`)
      continue
    }

    // Insert new template
    const { data, error } = await supabase
      .from('email_templates')
      .insert(template)
      .select()
      .single()

    if (error) {
      console.error(`❌ Error creating "${template.name}":`, error.message)
    } else {
      console.log(`✅ Created "${template.name}"`)
    }
  }

  console.log('\n✨ Seeding complete!')
}

seedTemplates().catch(console.error)
