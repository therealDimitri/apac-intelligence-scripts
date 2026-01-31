/**
 * Seed additional solution bundles into the database
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const bundles = [
  {
    bundle_name: 'Patient Engagement Suite',
    tagline: 'Empowering patients to take control of their health journey',
    product_ids: [],
    what_it_is: 'A comprehensive patient engagement platform combining portal access, mobile apps, and communication tools.',
    what_it_does: 'Enables patients to access records, schedule appointments, communicate with care teams, and manage their health from any device.',
    what_it_means: {
      CEO: ['Improved patient satisfaction and loyalty', 'Competitive differentiation', 'Reduced administrative burden'],
      CFO: ['Lower call centre costs', 'Reduced no-show rates', 'Improved collection rates'],
      CMIO: ['Better patient adherence', 'Improved care plan compliance', 'Enhanced patient-provider communication']
    },
    kpis: [
      { metric: 'Portal Adoption', target: '60%+ active users', proof: 'ANZ health network achieved 68% adoption' },
      { metric: 'No-Show Reduction', target: '25% decrease', proof: 'UK trust reduced no-shows by 32%' }
    ],
    market_drivers: ['Consumer healthcare expectations', 'Value-based care requirements', 'Digital front door strategy'],
    persona_notes: {
      CEO: ['Focus on competitive positioning and patient retention'],
      CFO: ['Emphasise operational cost savings and revenue protection'],
      CMIO: ['Highlight clinical workflow integration and patient outcomes']
    },
    grabber_examples: ['What if patients could self-serve 40% of their administrative needs?'],
    regions: ['APAC', 'ANZ', 'UK'],
    is_active: true
  },
  {
    bundle_name: 'Population Health Analytics',
    tagline: 'Turning data into actionable insights for better outcomes',
    product_ids: [],
    what_it_is: 'Advanced analytics platform for identifying at-risk populations and managing care across communities.',
    what_it_does: 'Aggregates data from multiple sources, applies predictive models, and provides actionable insights for care management.',
    what_it_means: {
      CEO: ['Strategic population health positioning', 'Risk contract readiness', 'Quality measure improvement'],
      CFO: ['Reduced cost of care', 'Risk adjustment optimisation', 'Avoided penalties'],
      CMIO: ['Evidence-based care protocols', 'Proactive patient identification', 'Quality improvement support']
    },
    kpis: [
      { metric: 'Risk Stratification Accuracy', target: '85%+ predictive value', proof: 'Large IDN achieved 88% accuracy' },
      { metric: 'Care Gap Closure', target: '30% improvement', proof: 'Regional network closed 35% more gaps' }
    ],
    market_drivers: ['Value-based care transition', 'Quality reporting requirements', 'Care coordination mandates'],
    persona_notes: {
      CEO: ['Strategic market positioning for value-based contracts'],
      CFO: ['Financial impact of risk adjustment and quality bonuses'],
      CMIO: ['Clinical decision support and care standardisation']
    },
    grabber_examples: ['How many of your high-risk patients are you identifying before they end up in ED?'],
    regions: ['APAC', 'ANZ', 'US'],
    is_active: true
  },
  {
    bundle_name: 'Ambulatory Care Transformation',
    tagline: 'Modernising outpatient care delivery for the digital age',
    product_ids: [],
    what_it_is: 'Integrated ambulatory EHR and practice management solution for clinics and outpatient facilities.',
    what_it_does: 'Streamlines scheduling, documentation, billing, and referral management across ambulatory settings.',
    what_it_means: {
      CEO: ['Unified ambulatory network', 'Improved physician satisfaction', 'Enhanced care coordination'],
      CFO: ['Optimised revenue cycle', 'Reduced claim denials', 'Improved productivity'],
      CMIO: ['Standardised clinical workflows', 'Better documentation quality', 'Improved referral tracking']
    },
    kpis: [
      { metric: 'Documentation Time', target: '35% reduction', proof: 'Multi-site practice achieved 40% reduction' },
      { metric: 'Clean Claim Rate', target: '95%+', proof: 'Ambulatory network maintains 96.5%' }
    ],
    market_drivers: ['Shift to outpatient care', 'Physician burnout crisis', 'Revenue cycle pressure'],
    persona_notes: {
      CEO: ['Network growth and physician alignment'],
      CFO: ['Revenue optimisation and cost control'],
      CMIO: ['Clinical efficiency and care quality']
    },
    grabber_examples: ['Your physicians are spending 2 hours on documentation for every hour with patients. What if we could change that?'],
    regions: ['APAC', 'US'],
    is_active: true
  },
  {
    bundle_name: 'Perioperative Excellence',
    tagline: 'Optimising surgical services from scheduling to discharge',
    product_ids: [],
    what_it_is: 'End-to-end perioperative management solution covering pre-op, intra-op, and post-op workflows.',
    what_it_does: 'Manages surgical scheduling, anaesthesia documentation, OR utilisation, and post-surgical care coordination.',
    what_it_means: {
      CEO: ['Maximised surgical capacity', 'Improved patient throughput', 'Enhanced surgical reputation'],
      CFO: ['Increased OR utilisation', 'Reduced case cancellations', 'Optimised supply chain'],
      CMIO: ['Standardised surgical protocols', 'Reduced complications', 'Improved handoff communication']
    },
    kpis: [
      { metric: 'OR Utilisation', target: '80%+ prime time', proof: 'Tertiary hospital achieved 83% utilisation' },
      { metric: 'Case Cancellation Rate', target: '<5%', proof: 'Surgical centre reduced to 3.2%' }
    ],
    market_drivers: ['Surgical backlog pressure', 'Margin optimisation needs', 'Patient safety focus'],
    persona_notes: {
      CEO: ['Surgical volume growth and market positioning'],
      CFO: ['Margin improvement and cost per case reduction'],
      CMIO: ['Clinical outcomes and safety metrics']
    },
    grabber_examples: ['Every cancelled case costs you $8,000 on average. How many did you cancel last month?'],
    regions: ['APAC', 'ANZ', 'UK'],
    is_active: true
  },
  {
    bundle_name: 'Emergency Department Optimisation',
    tagline: 'Reducing wait times and improving emergency care flow',
    product_ids: [],
    what_it_is: 'Real-time ED management solution with patient tracking, capacity management, and clinical decision support.',
    what_it_does: 'Tracks patients from arrival to disposition, manages bed capacity, and provides clinical alerts for time-sensitive conditions.',
    what_it_means: {
      CEO: ['Improved patient experience', 'Reduced LWBS rates', 'Enhanced community reputation'],
      CFO: ['Optimised throughput', 'Reduced boarding costs', 'Improved reimbursement'],
      CMIO: ['Faster time to treatment', 'Better sepsis detection', 'Improved handoff quality']
    },
    kpis: [
      { metric: 'Door-to-Provider Time', target: '<30 minutes', proof: 'Regional ED achieved 24-minute average' },
      { metric: 'LWBS Rate', target: '<2%', proof: 'Urban hospital reduced from 5% to 1.8%' }
    ],
    market_drivers: ['ED crowding crisis', 'Patient experience focus', 'Regulatory compliance'],
    persona_notes: {
      CEO: ['Community access and patient satisfaction'],
      CFO: ['Throughput optimisation and cost management'],
      CMIO: ['Clinical quality and time-sensitive care']
    },
    grabber_examples: ['What percentage of your ED patients leave without being seen? Industry average is 4.2%.'],
    regions: ['APAC', 'ANZ', 'UK', 'US'],
    is_active: true
  }
]

async function seed() {
  console.log('Seeding solution bundles...')

  // Check existing bundles
  const { data: existing } = await supabase
    .from('solution_bundles')
    .select('bundle_name')

  const existingNames = new Set(existing?.map(b => b.bundle_name) || [])
  const newBundles = bundles.filter(b => !existingNames.has(b.bundle_name))

  if (newBundles.length === 0) {
    console.log('All bundles already exist. No new bundles to add.')
    return
  }

  const { data, error } = await supabase
    .from('solution_bundles')
    .insert(newBundles)
    .select('id, bundle_name')

  if (error) {
    console.error('Error:', error.message)
    process.exit(1)
  }

  console.log(`Seeded ${data.length} new bundles:`)
  data.forEach(b => console.log(`  - ${b.bundle_name}`))

  // Show total count
  const { count } = await supabase
    .from('solution_bundles')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)

  console.log(`\nTotal active bundles: ${count}`)
}

seed()
