#!/usr/bin/env node
/**
 * Preview Email Templates with Minimal Data
 * Tests conditional rendering by providing empty arrays for optional sections
 */

import { render } from '@react-email/render'
import { writeFileSync } from 'fs'
import { exec } from 'child_process'

// Dynamic imports
const { default: CSEWeeklyEmail } = await import('../src/lib/emails/templates/CSEWeeklyEmail.tsx')
const { default: ManagerWeeklyEmail } = await import('../src/lib/emails/templates/ManagerWeeklyEmail.tsx')
const { default: ExecutiveWeeklyEmail } = await import('../src/lib/emails/templates/ExecutiveWeeklyEmail.tsx')

// CSE with minimal data - no clients, no insights, no actions, no meetings
const cseMinimalData = {
  cseName: 'Sarah Chen',
  weekEnding: '2025-01-03',
  dashboardUrl: 'https://apac-cs-dashboards.com',
  metrics: {
    npsScore: null, // No NPS data
    npsChange: null,
    clientsAtRisk: 0,
    completedActions: 0,
    totalActions: 0,
    meetingsCompleted: 0,
    meetingsScheduled: 0,
    responseRate: 0,
  },
  clients: [], // Empty - should hide section
  actions: [], // Empty - should hide section
  insights: [], // Empty - should hide section
  upcomingMeetings: [], // Empty - should hide section
  wellbeingTips: [], // Empty - should hide section
  developmentResources: [], // Empty - should hide section
  teamBenchmarks: [], // Empty - should hide section
}

// Manager with minimal data - no CSEs, no escalations
const managerMinimalData = {
  managerName: 'James Wilson',
  weekEnding: '2025-01-03',
  dashboardUrl: 'https://apac-cs-dashboards.com',
  teamMetrics: {
    teamSize: 0,
    totalClients: 0,
    avgTeamNPS: null,
    npsChange: null,
    totalClientsAtRisk: 0,
    teamActionCompletionRate: 0,
    teamMeetingsCompleted: 0,
    portfolioARR: 0,
    arrAtRisk: 0,
  },
  csePerformance: [], // Empty - should hide section
  escalations: [], // Empty - should hide section
  crossPortfolioRisks: [], // Empty - should hide section
  teamRecognition: [], // Empty - should hide section
  insights: [], // Empty - should hide section
  actions: [], // Empty - should hide section
}

// Executive with minimal data - no segments, no alerts
const executiveMinimalData = {
  executiveName: 'Robert Thompson',
  weekEnding: '2025-01-03',
  dashboardUrl: 'https://apac-cs-dashboards.com',
  portfolioMetrics: {
    totalARR: 0,
    arrChange: 0,
    arrAtRisk: 0,
    avgPortfolioNPS: null,
    npsChange: null,
    totalClients: 0,
    clientsAtRisk: 0,
    churnProbability: 0,
    projectedChurn: 0,
    netRevenueTrend: 'stable',
  },
  segmentPerformance: [], // Empty - should hide section
  strategicAlerts: [], // Empty - should hide section
  strategicInsights: [], // Empty - should hide section
  investmentRecommendations: [], // Empty - should hide section
}

console.log('🎨 Rendering email templates with MINIMAL data...\n')

const templates = [
  { name: 'CSE Weekly Email (Minimal)', component: CSEWeeklyEmail, data: cseMinimalData, outputFile: 'cse-minimal.html' },
  { name: 'Manager Weekly Email (Minimal)', component: ManagerWeeklyEmail, data: managerMinimalData, outputFile: 'manager-minimal.html' },
  { name: 'Executive Weekly Email (Minimal)', component: ExecutiveWeeklyEmail, data: executiveMinimalData, outputFile: 'executive-minimal.html' },
]

const outputDir = '/tmp/email-previews-minimal'

// Create output directory
exec(`mkdir -p ${outputDir}`)

for (const template of templates) {
  try {
    console.log(`📄 Rendering ${template.name}...`)
    const html = await render(template.component(template.data), { pretty: true })
    const outputPath = `${outputDir}/${template.outputFile}`
    writeFileSync(outputPath, html)
    console.log(`   ✅ Saved to: ${outputPath}`)
  } catch (error) {
    console.error(`   ❌ Error rendering ${template.name}:`, error.message)
  }
}

// Create index page
const indexHtml = `<!DOCTYPE html>
<html>
<head>
  <title>Email Templates - Minimal Data Preview</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; background: #f5f5f5; }
    h1 { color: #333; }
    .description { color: #666; margin-bottom: 24px; }
    .template-link { display: block; padding: 16px 20px; background: white; border-radius: 8px; margin-bottom: 12px; text-decoration: none; color: #333; border: 1px solid #ddd; }
    .template-link:hover { background: #f0f0f0; border-color: #999; }
    .template-name { font-weight: 600; font-size: 16px; }
    .template-desc { font-size: 14px; color: #666; margin-top: 4px; }
    .badge { display: inline-block; padding: 2px 8px; background: #fef3c7; color: #92400e; border-radius: 4px; font-size: 12px; margin-left: 8px; }
  </style>
</head>
<body>
  <h1>Email Templates - Minimal Data Preview</h1>
  <p class="description">These previews demonstrate conditional rendering with empty/minimal data. Sections without data should be hidden.</p>
  <a href="cse-minimal.html" class="template-link" target="_blank">
    <span class="template-name">CSE Weekly Email <span class="badge">Empty Data</span></span>
    <span class="template-desc">No clients, actions, insights, meetings, tips, or benchmarks</span>
  </a>
  <a href="manager-minimal.html" class="template-link" target="_blank">
    <span class="template-name">Manager Weekly Email <span class="badge">Empty Data</span></span>
    <span class="template-desc">No CSEs, escalations, risks, recognition, or actions</span>
  </a>
  <a href="executive-minimal.html" class="template-link" target="_blank">
    <span class="template-name">Executive Weekly Email <span class="badge">Empty Data</span></span>
    <span class="template-desc">No segments, alerts, insights, or recommendations</span>
  </a>
</body>
</html>`

writeFileSync(`${outputDir}/index.html`, indexHtml)

console.log(`\n✅ All templates rendered successfully!`)
console.log(`📁 Output directory: ${outputDir}`)
console.log(`🚀 Opening index in browser...`)

exec(`open "${outputDir}/index.html"`, (error) => {
  if (error) {
    console.error('Could not open browser:', error.message)
  }
})
