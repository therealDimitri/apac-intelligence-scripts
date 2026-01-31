/**
 * Seed value wedges for key products
 * Provides competitive positioning data (unique/important/defensible framework)
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const wedgeTemplates = {
  'Sunrise': {
    unique_how: [
      'Native cloud architecture built for scale',
      'Single integrated platform across acute, ambulatory, and community',
      'Real-time clinical decision support embedded in workflows',
      'Australian-developed with local support teams'
    ],
    important_wow: [
      'Reduces clinician documentation time by 40%',
      'Improves medication safety with closed-loop verification',
      'Enables true enterprise-wide patient visibility',
      'Supports remote and telehealth workflows natively'
    ],
    defensible_proof: [
      'NHS Trust achieved 45% reduction in documentation time',
      'Zero medication errors in 12-month pilot at regional hospital',
      '98.5% clinician satisfaction score at major ANZ health network',
      'Deployed across 200+ healthcare facilities in APAC'
    ],
    target_personas: ['CMIO', 'CNO', 'CIO'],
    competitive_positioning: 'Unlike legacy systems requiring multiple bolt-on modules, Sunrise provides a unified clinical platform that eliminates integration complexity and provides a single source of truth across all care settings. Competitors often require 3-5 separate systems to achieve what Sunrise delivers in one.'
  },
  'dbMotion': {
    unique_how: [
      'Vendor-agnostic interoperability engine',
      'Semantic normalisation for meaningful data exchange',
      'Real-time data federation without centralised repository',
      'FHIR-native with backwards compatibility to HL7v2'
    ],
    important_wow: [
      'Connects any EHR system without rip-and-replace',
      'Provides complete patient view in under 3 seconds',
      'Reduces duplicate testing by identifying prior results',
      'Enables cross-network care coordination'
    ],
    defensible_proof: [
      'Connected 47 disparate systems in one health network',
      'Reduced unnecessary imaging orders by 23%',
      '99.9% uptime across 50+ implementations globally',
      'Processing 2M+ patient queries daily in production'
    ],
    target_personas: ['CIO', 'CMIO', 'CEO'],
    competitive_positioning: 'dbMotion uniquely provides semantic interoperability rather than just syntactic data exchange. Clinicians see normalised, actionable information rather than raw HL7 messages requiring interpretation. Competitors offer point-to-point interfaces; dbMotion delivers true health information exchange.'
  },
  'TouchWorks': {
    unique_how: [
      'Ambulatory-first design optimised for clinic workflows',
      'Embedded revenue cycle management',
      'Flexible specialty templates out of the box',
      'Mobile-first architecture for modern practices'
    ],
    important_wow: [
      'Physicians complete notes during the visit, not after hours',
      'Clean claim rate exceeding 97% average',
      'Supports 50+ specialty workflows without customisation',
      'Go-live in 6-8 weeks vs 6-12 months for competitors'
    ],
    defensible_proof: [
      'Multi-site practice reduced after-hours documentation by 80%',
      'Large medical group achieved 97.3% clean claim rate',
      'Dermatology practice went live in 6 weeks with specialty templates',
      '4.7/5 physician satisfaction rating across implementations'
    ],
    target_personas: ['CFO', 'CMIO', 'Practice Manager'],
    competitive_positioning: 'TouchWorks is purpose-built for ambulatory care, unlike hospital EHR vendors who retrofit inpatient systems. This means faster implementations, lower TCO, and workflows designed for how clinics actually operate. Competitors take 3x longer to implement with 2x the customisation cost.'
  },
  'Paragon': {
    unique_how: [
      'Integrated acute and ambulatory in single platform',
      'Advanced clinical documentation with voice input',
      'Built-in analytics and population health tools',
      'Scalable from single hospital to large health systems'
    ],
    important_wow: [
      'Single patient record across all care settings',
      '30% reduction in clinical documentation burden',
      'Real-time operational dashboards included',
      'Lower TCO than enterprise competitors'
    ],
    defensible_proof: [
      'Regional health system saved $2.3M annually in operational costs',
      'Achieved HIMSS Stage 7 in first year of implementation',
      '95% clinician adoption within 90 days of go-live',
      'Reduced medication reconciliation errors by 67%'
    ],
    target_personas: ['CEO', 'CFO', 'CMIO'],
    competitive_positioning: 'Paragon delivers enterprise-class EHR capabilities at mid-market pricing. Unlike competitors who charge premium prices for basic functionality, Paragon includes analytics, population health, and ambulatory integration in the core platform.'
  },
  'OPAL': {
    unique_how: [
      'Purpose-built for oncology workflows',
      'Integrated chemotherapy protocols',
      'Real-time dose calculations',
      'Seamless infusion management'
    ],
    important_wow: [
      'Reduces medication errors by 85%',
      'Cuts protocol selection time by 60%',
      'Improves treatment documentation compliance',
      'Enables multi-site cancer network visibility'
    ],
    defensible_proof: [
      'Major cancer centre achieved 85% reduction in chemo errors',
      'Regional network reduced protocol selection time from 15 to 6 minutes',
      '99.7% treatment documentation compliance at leading oncology hospital',
      'Supporting 50+ oncology sites across APAC'
    ],
    target_personas: ['CMO', 'Oncology Director', 'Chief Pharmacist'],
    competitive_positioning: 'Unlike generic EHR oncology modules, OPAL was built from the ground up for cancer care. Competitors bolt on oncology features; OPAL delivers purpose-built chemotherapy management with real-time dose calculations and protocol-driven workflows.'
  },
  'HealthQuest': {
    unique_how: [
      'Consumer-grade patient portal experience',
      'AI-powered appointment scheduling',
      'Integrated telehealth capabilities',
      'Multi-language support out of the box'
    ],
    important_wow: [
      'Increases patient portal adoption by 3x',
      'Reduces no-show rates by 35%',
      'Enables 24/7 patient self-service',
      'Improves patient satisfaction scores'
    ],
    defensible_proof: [
      'Health network tripled portal adoption in 6 months',
      '35% reduction in appointment no-shows',
      '4.8/5 patient satisfaction rating for digital experience',
      'Processing 500K+ patient interactions monthly'
    ],
    target_personas: ['CIO', 'Patient Experience Director', 'Digital Health Lead'],
    competitive_positioning: 'HealthQuest delivers a consumer-grade digital experience patients expect from modern apps. Legacy patient portals feel dated; HealthQuest brings healthcare into the smartphone era with intuitive design and AI-powered interactions.'
  },
  'Sunrise Ambulatory': {
    unique_how: [
      'Unified platform for multi-specialty practices',
      'Embedded population health tools',
      'Intelligent referral management',
      'Value-based care analytics built-in'
    ],
    important_wow: [
      'Single platform for 50+ specialties',
      'Reduces referral leakage by 40%',
      'Enables care gap identification',
      'Supports transition to value-based contracts'
    ],
    defensible_proof: [
      'Multi-specialty group reduced referral leakage by 40%',
      'Health system closed 25% more care gaps',
      'ACO achieved 15% savings with embedded analytics',
      'Supporting 1000+ ambulatory locations'
    ],
    target_personas: ['CMO', 'VP Ambulatory', 'Population Health Director'],
    competitive_positioning: 'Sunrise Ambulatory unifies multi-specialty practices on a single platform with embedded population health and value-based care tools. Competitors require separate systems and integrations; Sunrise delivers it all natively.'
  },
  'iPro': {
    unique_how: [
      'Proven interoperability engine',
      'Legacy system connectivity',
      'Lightweight integration approach',
      'Minimal infrastructure requirements'
    ],
    important_wow: [
      'Connects systems in weeks, not months',
      'Low-cost interoperability solution',
      'Minimal IT overhead',
      'Preserves existing system investments'
    ],
    defensible_proof: [
      'Connected 12 legacy systems in 8 weeks',
      '70% lower implementation cost vs. alternatives',
      'Zero dedicated infrastructure required',
      'Running at 200+ sites across APAC'
    ],
    target_personas: ['CIO', 'Integration Manager', 'IT Director'],
    competitive_positioning: 'iPro delivers interoperability without the enterprise price tag or complexity. While competitors require months of implementation and dedicated infrastructure, iPro connects legacy systems in weeks with minimal IT overhead.'
  },
  'Other': {
    unique_how: [
      'Purpose-built for specific clinical workflows',
      'Modern cloud architecture',
      'Seamless integration with existing systems',
      'Continuous innovation with regular updates'
    ],
    important_wow: [
      'Reduces administrative burden on clinicians',
      'Improves patient outcomes and satisfaction',
      'Lowers total cost of ownership',
      'Faster time to value than alternatives'
    ],
    defensible_proof: [
      'Proven across multiple APAC healthcare organisations',
      'High customer satisfaction and retention rates',
      'Measurable ROI within first year',
      'Strong reference customers available'
    ],
    target_personas: ['CIO', 'CMIO', 'CFO'],
    competitive_positioning: 'Altera solutions are designed specifically for healthcare with deep domain expertise, unlike generic software vendors who treat healthcare as just another vertical.'
  }
}

async function seed() {
  console.log('Fetching products for value wedges...')

  // Get products from key families - one representative per family for wedges
  const targetFamilies = ['Sunrise', 'dbMotion', 'TouchWorks', 'Paragon', 'OPAL', 'HealthQuest', 'Sunrise Ambulatory', 'iPro']
  const products = []

  for (const family of targetFamilies) {
    // Get up to 3 products per family to have wedges
    const { data: familyProducts } = await supabase
      .from('product_catalog')
      .select('id, title, product_family')
      .eq('product_family', family)
      .eq('is_active', true)
      .limit(3)

    if (familyProducts?.length) {
      products.push(...familyProducts)
      console.log(`  ${family}: ${familyProducts.length} products`)
    }
  }

  if (!products.length) {
    console.log('No products found for target families')
    return
  }

  console.log(`Found ${products.length} products to add wedges for`)

  // Check existing wedges
  const { data: existing } = await supabase
    .from('value_wedges')
    .select('product_catalog_id')

  const existingIds = new Set(existing?.map(w => w.product_catalog_id) || [])
  const newProducts = products.filter(p => !existingIds.has(p.id))

  if (newProducts.length === 0) {
    console.log('All products already have value wedges')
    return
  }

  // Create wedges for new products
  const wedges = newProducts.map(p => {
    const template = wedgeTemplates[p.product_family] || wedgeTemplates['Other']
    return {
      product_catalog_id: p.id,
      ...template
    }
  })

  const { data, error } = await supabase
    .from('value_wedges')
    .insert(wedges)
    .select('id, product_catalog_id')

  if (error) {
    console.error('Error inserting wedges:', error.message)
    process.exit(1)
  }

  console.log(`\nSeeded ${data.length} value wedges:`)
  newProducts.forEach(p => console.log(`  - ${p.title} (${p.product_family})`))

  // Show total count
  const { count } = await supabase
    .from('value_wedges')
    .select('*', { count: 'exact', head: true })

  console.log(`\nTotal value wedges: ${count}`)
}

seed()
