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

  // Get sales briefs from key product families
  const { data: products, error: fetchError } = await supabase
    .from('product_catalog')
    .select('id, title, product_family')
    .in('product_family', ['Sunrise', 'dbMotion', 'TouchWorks', 'Paragon'])
    .eq('content_type', 'sales_brief')
    .eq('is_active', true)

  if (fetchError) {
    console.error('Error fetching products:', fetchError.message)
    process.exit(1)
  }

  if (!products?.length) {
    console.log('No sales brief products found for target families')

    // Fall back to any products from these families
    const { data: fallback } = await supabase
      .from('product_catalog')
      .select('id, title, product_family')
      .in('product_family', ['Sunrise', 'dbMotion', 'TouchWorks', 'Paragon'])
      .eq('is_active', true)
      .limit(10)

    if (!fallback?.length) {
      console.log('No products found at all for target families')
      return
    }

    products.push(...fallback)
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
