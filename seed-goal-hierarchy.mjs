#!/usr/bin/env node
/**
 * Seed Goal Hierarchy
 *
 * Seeds team_goals and portfolio_initiatives to populate the Goals feature
 * with realistic APAC data. Idempotent — checks before insert.
 *
 * Usage:
 *   node scripts/seed-goal-hierarchy.mjs             # seed data
 *   node scripts/seed-goal-hierarchy.mjs --dry-run    # preview only
 *   node scripts/seed-goal-hierarchy.mjs --clean      # delete seeded data first
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const DRY_RUN = process.argv.includes('--dry-run')
const CLEAN = process.argv.includes('--clean')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// ------------------------------------------------------------------
// Existing company goal IDs (from live DB)
// ------------------------------------------------------------------
const CG = {
  // Operational Excellence
  SLA_COMPLIANCE: 'ddc72e8a-029e-4085-8051-a3277bcd1767',
  CLIENT_HEALTH: 'ce74a58e-13df-4b49-8613-f8b9043828f0',
  AGED_ACCOUNTS: 'd0b92962-bb36-46fc-b669-3867e24abbb4',
  // Growth
  NPS_ADVOCACY: 'a653f1ac-26e5-496a-99eb-1d1b0bbfd84f',
  REVENUE_TARGETS: 'da4e09b8-2e6b-44e1-aa1e-8fb91d9dfaff',
  WALLET_SHARE: 'fa6933fa-792f-4722-ad38-81f4ed35867e',
  // People
  ENGAGEMENT: 'baf56e1e-77a3-4954-9ec5-78dff6527669',
  CSE_CAM_CAPABILITIES: 'b45d85f2-0f09-4194-834b-bd96a88bbe3b',
  KNOWLEDGE_SHARING: '4bf5e60f-9627-4b02-8004-3f71710ecd0c',
}

// ------------------------------------------------------------------
// Team goals to seed (9 total — 1 per company goal)
// ------------------------------------------------------------------
const TEAM_GOALS = [
  // Operational Excellence
  {
    title: 'Achieve 95% SLA compliance for ANZ clients',
    description: 'Drive SLA compliance across Australian and New Zealand clients through proactive issue resolution and regular service review meetings.',
    company_goal_id: CG.SLA_COMPLIANCE,
    team_id: 'cse_anz',
    status: 'on_track',
    progress_percentage: 72,
    weight: 1,
  },
  {
    title: 'Improve Opal health scores for at-risk clients',
    description: 'Target clients with health scores below 60 for focused improvement plans, including Barwon Health, Epworth Healthcare, and Western Health.',
    company_goal_id: CG.CLIENT_HEALTH,
    team_id: 'cse_anz',
    status: 'on_track',
    progress_percentage: 55,
    weight: 1,
  },
  {
    title: 'Reduce aged accounts over 90 days by 30%',
    description: 'Work with finance and client contacts to resolve overdue invoices, focusing on WA Health and SA Health aged balances.',
    company_goal_id: CG.AGED_ACCOUNTS,
    team_id: 'cam',
    status: 'at_risk',
    progress_percentage: 35,
    weight: 1,
  },
  // Growth
  {
    title: 'Improve NPS to +50 across APAC portfolio',
    description: 'Achieve NPS of +50 or above through consistent client engagement, satisfaction action plans, and insight touch points.',
    company_goal_id: CG.NPS_ADVOCACY,
    team_id: 'cse_anz',
    status: 'on_track',
    progress_percentage: 60,
    weight: 1,
  },
  {
    title: 'Deliver FY26 maintenance revenue target for SEA region',
    description: 'Ensure maintenance revenue collection for SingHealth, Mount Alvernia Hospital, and NCS/MinDef Singapore is on track.',
    company_goal_id: CG.REVENUE_TARGETS,
    team_id: 'cam_sea',
    status: 'on_track',
    progress_percentage: 48,
    weight: 1,
  },
  {
    title: 'Generate 3 whitespace opportunities per quarter',
    description: 'Identify and qualify upsell opportunities through whitespace demos and client forum discussions.',
    company_goal_id: CG.WALLET_SHARE,
    team_id: 'cse_anz',
    status: 'behind',
    progress_percentage: 25,
    weight: 1,
  },
  // People
  {
    title: 'Complete quarterly team engagement surveys',
    description: 'Run quarterly pulse surveys and action on feedback to maintain team morale and identify retention risks early.',
    company_goal_id: CG.ENGAGEMENT,
    team_id: 'leadership',
    status: 'on_track',
    progress_percentage: 50,
    weight: 1,
  },
  {
    title: 'Deliver Sunrise certification for all CSEs',
    description: 'Ensure every CSE completes the Sunrise advanced certification programme by Q3 FY26.',
    company_goal_id: CG.CSE_CAM_CAPABILITIES,
    team_id: 'cse_anz',
    status: 'on_track',
    progress_percentage: 40,
    weight: 1,
  },
  {
    title: 'Establish monthly knowledge-sharing sessions',
    description: 'Create a regular cadence of cross-team knowledge-sharing sessions covering client wins, technical solutions, and process improvements.',
    company_goal_id: CG.KNOWLEDGE_SHARING,
    team_id: 'leadership',
    status: 'not_started',
    progress_percentage: 0,
    weight: 1,
  },
]

// ------------------------------------------------------------------
// Portfolio initiatives to seed (12 total — linked to team goals)
// Indices reference TEAM_GOALS array position for team_goal_id linkage
// ------------------------------------------------------------------
const INITIATIVES = [
  // Under "Achieve 95% SLA compliance" (index 0)
  {
    name: 'SA Health SLA Recovery Plan',
    client_name: 'SA Health',
    category: 'service_delivery',
    year: 2026,
    status: 'Active',
    goal_status: 'on_track',
    description: 'Address recurring SLA breaches in iPro environment through enhanced monitoring and dedicated support allocation.',
    team_goal_idx: 0,
    weight: 1,
  },
  {
    name: 'WA Health Quarterly Service Review',
    client_name: 'WA Health',
    category: 'service_delivery',
    year: 2026,
    status: 'Active',
    goal_status: 'on_track',
    description: 'Implement quarterly service review cadence with WA Health to proactively manage SLA performance.',
    team_goal_idx: 0,
    weight: 1,
  },
  // Under "Improve Opal health scores" (index 1)
  {
    name: 'Barwon Health Engagement Uplift',
    client_name: 'Barwon Health',
    category: 'client_engagement',
    year: 2026,
    status: 'Active',
    goal_status: 'at_risk',
    description: 'Increase engagement cadence with Barwon Health to improve health score from current 45 to target 65.',
    team_goal_idx: 1,
    weight: 1,
  },
  {
    name: 'Epworth Healthcare Health Check Programme',
    client_name: 'Epworth Healthcare',
    category: 'client_engagement',
    year: 2026,
    status: 'Active',
    goal_status: 'on_track',
    description: 'Run full Opal health check and remediation plan for Epworth Healthcare.',
    team_goal_idx: 1,
    weight: 1,
  },
  // Under "Reduce aged accounts" (index 2)
  {
    name: 'WA Health Invoice Reconciliation',
    client_name: 'WA Health',
    category: 'financial',
    year: 2026,
    status: 'Active',
    goal_status: 'behind',
    description: 'Reconcile and resolve 12 outstanding invoices totalling $420K with WA Health procurement.',
    team_goal_idx: 2,
    weight: 1,
  },
  // Under "Improve NPS to +50" (index 3)
  {
    name: 'Waikato DHB Satisfaction Action Plan',
    client_name: 'Waikato District Health Board',
    category: 'client_engagement',
    year: 2026,
    status: 'Active',
    goal_status: 'on_track',
    description: 'Structured satisfaction action plan following NPS detractor feedback from Waikato DHB.',
    team_goal_idx: 3,
    weight: 1,
  },
  {
    name: 'RVEEH Client Advocacy Programme',
    client_name: 'Royal Victorian Eye and Ear Hospital',
    category: 'client_engagement',
    year: 2026,
    status: 'Active',
    goal_status: 'on_track',
    description: 'Convert RVEEH from passive to active promoter through dedicated insight touch points.',
    team_goal_idx: 3,
    weight: 1,
  },
  // Under "Deliver FY26 maintenance revenue" (index 4)
  {
    name: 'SingHealth Contract Renewal',
    client_name: 'SingHealth',
    category: 'revenue',
    year: 2026,
    status: 'Active',
    goal_status: 'on_track',
    description: 'Negotiate and finalise FY26 maintenance contract renewal with SingHealth.',
    team_goal_idx: 4,
    weight: 1,
  },
  {
    name: 'Mount Alvernia Revenue Protection',
    client_name: 'Mount Alvernia Hospital',
    category: 'revenue',
    year: 2026,
    status: 'Active',
    goal_status: 'on_track',
    description: 'Protect and grow maintenance revenue with Mount Alvernia Hospital through value demonstration.',
    team_goal_idx: 4,
    weight: 1,
  },
  // Under "Generate whitespace opportunities" (index 5)
  {
    name: 'Albury Wodonga Sunrise Demo',
    client_name: 'Albury Wodonga Health',
    category: 'upsell',
    year: 2026,
    status: 'Planned',
    goal_status: 'not_started',
    description: 'Schedule and deliver Sunrise whitespace demo for Albury Wodonga Health targeting pharmacy module.',
    team_goal_idx: 5,
    weight: 1,
  },
  // Under "Deliver Sunrise certification" (index 7)
  {
    name: 'Q2 Sunrise Certification Cohort',
    client_name: null,
    category: 'training',
    year: 2026,
    status: 'Planned',
    goal_status: 'not_started',
    description: 'Enrol 4 CSEs in Q2 Sunrise advanced certification programme.',
    team_goal_idx: 7,
    weight: 1,
  },
  // Under "Monthly knowledge-sharing" (index 8)
  {
    name: 'Knowledge-Sharing Pilot Sessions',
    client_name: null,
    category: 'training',
    year: 2026,
    status: 'Planned',
    goal_status: 'not_started',
    description: 'Run 3 pilot knowledge-sharing sessions to validate format and measure engagement before monthly rollout.',
    team_goal_idx: 8,
    weight: 1,
  },
]

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------
async function main() {
  console.log('\n🎯 Seed Goal Hierarchy')
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN' : CLEAN ? 'CLEAN + SEED' : 'SEED'}`)

  // Clean mode: delete seeded team goals and initiatives (cascading via DB FK)
  if (CLEAN) {
    console.log('\n🧹 Cleaning seeded data...')

    if (!DRY_RUN) {
      // Delete initiatives first (they reference team_goals)
      const { error: iniErr, count: iniCount } = await supabase
        .from('portfolio_initiatives')
        .delete({ count: 'exact' })
        .not('team_goal_id', 'is', null)

      if (iniErr) {
        console.error('   Failed to delete initiatives:', iniErr.message)
      } else {
        console.log(`   Deleted ${iniCount} linked initiatives`)
      }

      // Delete all team goals
      const { error: tgErr, count: tgCount } = await supabase
        .from('team_goals')
        .delete({ count: 'exact' })
        .neq('id', '00000000-0000-0000-0000-000000000000') // match all

      if (tgErr) {
        console.error('   Failed to delete team goals:', tgErr.message)
      } else {
        console.log(`   Deleted ${tgCount} team goals`)
      }
    } else {
      console.log('   [DRY] Would delete linked initiatives and team goals')
    }
  }

  // Check existing team goals
  const { data: existingTG } = await supabase
    .from('team_goals')
    .select('id, title')

  const existingTitles = new Set((existingTG || []).map(tg => tg.title))

  // Seed team goals
  console.log(`\n📋 Seeding team goals (${TEAM_GOALS.length} planned, ${existingTitles.size} exist)...`)

  const teamGoalIds = [] // Track inserted IDs for initiative linking
  let tgCreated = 0
  let tgSkipped = 0

  for (const tg of TEAM_GOALS) {
    if (existingTitles.has(tg.title)) {
      // Find existing ID for initiative linking
      const existing = (existingTG || []).find(e => e.title === tg.title)
      teamGoalIds.push(existing?.id || null)
      tgSkipped++
      continue
    }

    if (DRY_RUN) {
      console.log(`   [DRY] Would create: "${tg.title}"`)
      teamGoalIds.push('dry-run-placeholder')
      tgCreated++
      continue
    }

    const { data, error } = await supabase
      .from('team_goals')
      .insert({
        title: tg.title,
        description: tg.description,
        company_goal_id: tg.company_goal_id,
        team_id: tg.team_id,
        status: tg.status,
        progress_percentage: tg.progress_percentage,
        weight: tg.weight,
        start_date: '2025-07-01',
        target_date: '2026-06-30',
      })
      .select('id')
      .single()

    if (error) {
      console.error(`   Failed to create "${tg.title}":`, error.message)
      teamGoalIds.push(null)
    } else {
      teamGoalIds.push(data.id)
      tgCreated++
    }
  }

  console.log(`   Created: ${tgCreated}, Skipped: ${tgSkipped}`)

  // Seed initiatives
  const { data: existingInit } = await supabase
    .from('portfolio_initiatives')
    .select('id, name')

  const existingInitNames = new Set((existingInit || []).map(i => i.name))

  console.log(`\n📋 Seeding portfolio initiatives (${INITIATIVES.length} planned, ${existingInitNames.size} exist)...`)

  let iniCreated = 0
  let iniSkipped = 0

  for (const ini of INITIATIVES) {
    if (existingInitNames.has(ini.name)) {
      iniSkipped++
      continue
    }

    const teamGoalId = teamGoalIds[ini.team_goal_idx] || null

    if (DRY_RUN) {
      console.log(`   [DRY] Would create: "${ini.name}" (${ini.client_name || 'internal'})`)
      iniCreated++
      continue
    }

    if (!teamGoalId || teamGoalId === 'dry-run-placeholder') {
      console.log(`   Skipping "${ini.name}" — team goal not available`)
      continue
    }

    const { error } = await supabase
      .from('portfolio_initiatives')
      .insert({
        name: ini.name,
        client_name: ini.client_name,
        category: ini.category,
        year: ini.year,
        status: ini.status,
        goal_status: ini.goal_status,
        description: ini.description,
        team_goal_id: teamGoalId,
        weight: ini.weight,
      })

    if (error) {
      console.error(`   Failed to create "${ini.name}":`, error.message)
    } else {
      iniCreated++
    }
  }

  console.log(`   Created: ${iniCreated}, Skipped: ${iniSkipped}`)

  // Link existing orphaned initiatives to relevant team goals
  if (!DRY_RUN && teamGoalIds.some(id => id && id !== 'dry-run-placeholder')) {
    const { data: orphans } = await supabase
      .from('portfolio_initiatives')
      .select('id, name, client_name')
      .is('team_goal_id', null)

    if (orphans && orphans.length > 0) {
      console.log(`\n🔗 Linking ${orphans.length} orphaned initiatives to team goals...`)

      // Simple heuristic: link SA Health initiatives to SLA compliance team goal (index 0)
      // Link SingHealth to revenue target (index 4)
      // Link others to client health (index 1)
      for (const orphan of orphans) {
        let targetIdx = 1 // default: client health
        if (orphan.client_name === 'SA Health') targetIdx = 0
        else if (orphan.client_name === 'SingHealth') targetIdx = 4

        const targetId = teamGoalIds[targetIdx]
        if (!targetId) continue

        const { error } = await supabase
          .from('portfolio_initiatives')
          .update({ team_goal_id: targetId })
          .eq('id', orphan.id)

        if (error) {
          console.error(`   Failed to link "${orphan.name}":`, error.message)
        } else {
          console.log(`   Linked: "${orphan.name}" → team goal #${targetIdx}`)
        }
      }
    }
  }

  // Summary
  console.log('\n📊 Final counts:')

  const { count: pillarsCount } = await supabase.from('strategic_pillars').select('*', { count: 'exact', head: true })
  const { count: cgCount } = await supabase.from('company_goals').select('*', { count: 'exact', head: true })
  const { count: tgCount } = await supabase.from('team_goals').select('*', { count: 'exact', head: true })
  const { count: iniCount } = await supabase.from('portfolio_initiatives').select('*', { count: 'exact', head: true })

  console.log(`   Strategic pillars: ${pillarsCount}`)
  console.log(`   BU goals: ${cgCount}`)
  console.log(`   Team goals: ${tgCount}`)
  console.log(`   Projects: ${iniCount}`)

  if (DRY_RUN) {
    console.log('\n   Run without --dry-run to apply changes.')
  } else {
    console.log('\n✅ Goal hierarchy seeded successfully!')
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message)
  process.exit(1)
})
