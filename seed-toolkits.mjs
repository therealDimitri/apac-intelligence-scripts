/**
 * Seed additional toolkits for Sales Hub
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const toolkits = [
  {
    name: 'EHR Replacement Playbook',
    description:
      'Step-by-step guide for positioning Altera solutions in competitive EHR replacements. Includes discovery questions, ROI calculators, and reference customer stories.',
    version: '2.0',
    bundle_ids: [],
    regions: ['APAC', 'ANZ'],
    is_active: true,
  },
  {
    name: 'Interoperability Assessment Kit',
    description:
      'Tools for assessing client interoperability maturity and positioning dbMotion. Includes readiness checklist, integration complexity scorer, and implementation timeline templates.',
    version: '1.5',
    bundle_ids: [],
    regions: ['APAC', 'ANZ', 'UK'],
    is_active: true,
  },
  {
    name: 'Value-Based Care Readiness',
    description:
      'Assessment framework for clients transitioning to value-based care models. Maps Altera capabilities to VBC requirements with ROI projections.',
    version: '1.0',
    bundle_ids: [],
    regions: ['APAC', 'US'],
    is_active: true,
  },
  {
    name: 'Clinical Documentation Improvement',
    description:
      'Playbook for addressing clinician burnout and documentation burden. Includes time-motion study templates and efficiency benchmarks.',
    version: '1.2',
    bundle_ids: [],
    regions: ['APAC', 'ANZ', 'UK'],
    is_active: true,
  },
  {
    name: 'Executive Sponsor Engagement',
    description:
      'Templates and talk tracks for engaging C-suite executives. Persona-specific messaging for CEO, CFO, CMIO, CNO with industry benchmarks.',
    version: '2.1',
    bundle_ids: [],
    regions: ['APAC', 'ANZ', 'UK', 'US'],
    is_active: true,
  },
  {
    name: 'Competitive Displacement Guide',
    description:
      'Competitive intelligence and displacement strategies for major EHR vendors. Includes objection handling and proof point library.',
    version: '1.8',
    bundle_ids: [],
    regions: ['APAC', 'ANZ'],
    is_active: true,
  },
  {
    name: 'Implementation Success Stories',
    description:
      'Curated collection of customer success stories organised by use case, region, and organisation size. Includes video testimonials and case study PDFs.',
    version: '3.0',
    bundle_ids: [],
    regions: ['APAC', 'ANZ', 'UK'],
    is_active: true,
  },
  {
    name: 'ROI Calculator Suite',
    description:
      'Financial modelling tools for demonstrating Altera solution value. Includes TCO comparisons, productivity gains, and revenue impact calculators.',
    version: '2.5',
    bundle_ids: [],
    regions: ['APAC', 'ANZ', 'UK', 'US'],
    is_active: true,
  },
]

async function seed() {
  console.log('Seeding toolkits...')

  // Check existing
  const { data: existing } = await supabase.from('toolkits').select('name')

  const existingNames = new Set(existing?.map(t => t.name) || [])
  const newToolkits = toolkits.filter(t => !existingNames.has(t.name))

  console.log(`Existing toolkits: ${existingNames.size}`)

  if (newToolkits.length === 0) {
    console.log('All toolkits already exist')
    return
  }

  const { data, error } = await supabase.from('toolkits').insert(newToolkits).select('id, name')

  if (error) {
    console.error('Error:', error.message)
    process.exit(1)
  }

  console.log(`\nSeeded ${data.length} new toolkits:`)
  data.forEach(t => console.log(`  - ${t.name}`))

  // Show total
  const { count } = await supabase
    .from('toolkits')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)

  console.log(`\nTotal active toolkits: ${count}`)
}

seed()
