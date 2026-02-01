/**
 * Re-filter existing articles through Tier 1 filters
 *
 * Applies the new filtering logic to all existing articles:
 * 1. Healthcare keyword check
 * 2. Job posting detection
 * 3. APAC geographic filter
 *
 * Articles that fail are marked as tier1_passed=false and deactivated.
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

// Import filter logic (inline since we can't use ES modules easily)
// Healthcare keywords
const HEALTHCARE_KEYWORDS = [
  'health', 'hospital', 'medical', 'clinical', 'patient', 'healthcare',
  'clinic', 'physician', 'nurse', 'doctor', 'surgery', 'surgical',
  'diagnosis', 'treatment', 'therapy', 'medication', 'prescription',
  'emr', 'ehr', 'electronic health', 'electronic medical', 'health record',
  'fhir', 'hl7', 'interoperability', 'health information', 'clinical system',
  'clinical software', 'health tech', 'healthtech', 'medtech', 'digital health',
  'pharmaceutical', 'pharma', 'biotech', 'biotechnology', 'aged care',
  'mental health', 'disability', 'health insurance', 'medicare', 'medicaid',
  'ndis', 'telehealth', 'telemedicine',
  'ministry of health', 'department of health', 'health department',
  'health authority', 'health service', 'health district', 'health board',
  'altera', 'sunrise emr', 'sunrise acute', 'epic', 'mychart', 'cerner',
  'oracle health', 'meditech', 'intersystems', 'trakcare', 'orion health',
  'dbmotion', 'paragon ehr', 'touchworks',
]

// Job posting patterns
const JOB_POSTING_PATTERNS = [
  /\bgp wanted\b/i,
  /\bwe are (looking for|seeking|hiring)\b/i,
  /\b(permanent|fixed term|full[-\s]?time|part[-\s]?time) position\b/i,
  /\bapply now\b/i,
  /\bjob (opportunity|opening|vacancy|vacancies)\b/i,
  /\bnow hiring\b/i,
  /\bjoin our team\b/i,
  /\bcareer (opportunity|opportunities)\b/i,
  /\bemployment opportunity\b/i,
  /\b(gp|general practitioner|nurse practitioner|np)\s*[-–—]\s*[a-z]/i,
  /\bexpressions? of interest.{0,30}position\b/i,
  /\bwe('re| are) recruiting\b/i,
  /\bstaff (wanted|required|needed)\b/i,
  /\b(seeking|looking for) a (gp|nurse|doctor|physician|clinician)\b/i,
  /\bposition (available|vacant)\b/i,
]

// APAC regions
const APAC_TERMS = [
  'australia', 'new zealand', 'singapore', 'philippines', 'guam',
  'malaysia', 'indonesia', 'thailand', 'vietnam', 'hong kong',
  'taiwan', 'japan', 'south korea', 'india', 'china',
  'nsw', 'new south wales', 'victoria', 'vic', 'queensland', 'qld',
  'south australia', 'western australia', 'wa', 'tasmania', 'tas',
  'northern territory', 'nt', 'act', 'canberra',
  'auckland', 'wellington', 'christchurch', 'waikato', 'canterbury',
  'otago', 'bay of plenty', 'hawke', 'manawatu', 'taranaki', 'dunedin', 'hamilton', 'tauranga',
  'sydney', 'melbourne', 'brisbane', 'perth', 'adelaide', 'hobart',
  'darwin', 'geelong', 'ballarat', 'bendigo', 'gold coast', 'newcastle', 'wollongong', 'cairns', 'townsville',
  'manila', 'cebu', 'quezon', 'davao',
  'hagåtña', 'hagatna', 'tamuning', 'dededo',
  'apac', 'asia pacific', 'asia-pacific', 'australasia', 'oceania',
  'te whatu ora', 'singhealth', 'synapxe', 'adha', 'medicare australia', 'australian digital health', 'nz health', 'health nz',
]

const NON_APAC_EXCLUSIONS = [
  'saudi arabia', 'saudi', 'uae', 'dubai', 'qatar', 'kuwait', 'bahrain', 'oman',
  'israel', 'palestine', 'iran', 'iraq',
  'uk', 'united kingdom', 'britain', 'england', 'scotland', 'wales', 'ireland',
  'germany', 'france', 'italy', 'spain', 'netherlands', 'belgium', 'switzerland',
  'sweden', 'norway', 'denmark', 'finland', 'poland', 'austria', 'portugal', 'greece',
  'usa', 'united states', 'america', 'american', 'canada', 'canadian', 'mexico',
  'brazil', 'argentina', 'chile', 'colombia', 'peru',
  'nigeria', 'south africa', 'kenya', 'egypt', 'morocco', 'ghana', 'ethiopia',
]

function hasHealthcareKeyword(title, summary) {
  const text = `${title} ${summary || ''}`.toLowerCase()
  return HEALTHCARE_KEYWORDS.some(kw => text.includes(kw.toLowerCase()))
}

function isJobPosting(title, summary) {
  const text = `${title} ${summary || ''}`
  return JOB_POSTING_PATTERNS.some(pattern => pattern.test(text))
}

function passesGeographicFilter(title, summary, regions) {
  const text = `${title} ${summary || ''}`.toLowerCase()

  // If source has APAC region tags, pass
  if (regions && regions.length > 0) {
    const hasAPACSource = regions.some(r =>
      APAC_TERMS.some(term => r.toLowerCase().includes(term))
    )
    if (hasAPACSource) return true
  }

  // Check for non-APAC exclusions
  for (const exclusion of NON_APAC_EXCLUSIONS) {
    if (text.includes(exclusion.toLowerCase())) {
      const hasAPAC = APAC_TERMS.some(term => text.includes(term.toLowerCase()))
      if (!hasAPAC) return false
    }
  }

  // Must have at least one APAC mention
  return APAC_TERMS.some(term => text.includes(term.toLowerCase()))
}

function tier1Filter(title, summary, regions) {
  if (!hasHealthcareKeyword(title, summary)) {
    return { passed: false, reason: 'no_healthcare_keyword' }
  }
  if (isJobPosting(title, summary)) {
    return { passed: false, reason: 'job_posting' }
  }
  if (!passesGeographicFilter(title, summary, regions)) {
    return { passed: false, reason: 'non_apac_region' }
  }
  return { passed: true }
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  console.log('Fetching all existing articles...')

  // Fetch all articles
  const { data: articles, error } = await supabase
    .from('news_articles')
    .select('id, title, summary, regions, is_active, relevance_score')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Failed to fetch articles:', error)
    process.exit(1)
  }

  console.log(`Found ${articles.length} articles to filter\n`)

  const stats = {
    total: articles.length,
    passed: 0,
    rejectedNoKeyword: 0,
    rejectedJobPosting: 0,
    rejectedNonApac: 0,
  }

  const passedIds = []
  const rejectedArticles = []

  // Filter each article
  for (const article of articles) {
    const result = tier1Filter(article.title, article.summary, article.regions)

    if (result.passed) {
      stats.passed++
      passedIds.push(article.id)
    } else {
      if (result.reason === 'no_healthcare_keyword') stats.rejectedNoKeyword++
      if (result.reason === 'job_posting') stats.rejectedJobPosting++
      if (result.reason === 'non_apac_region') stats.rejectedNonApac++
      rejectedArticles.push({ id: article.id, title: article.title, reason: result.reason })
    }
  }

  console.log('=== TIER 1 FILTER RESULTS ===')
  console.log(`Total articles: ${stats.total}`)
  console.log(`Passed: ${stats.passed} (${((stats.passed / stats.total) * 100).toFixed(1)}%)`)
  console.log(`Rejected - No healthcare keyword: ${stats.rejectedNoKeyword}`)
  console.log(`Rejected - Job posting: ${stats.rejectedJobPosting}`)
  console.log(`Rejected - Non-APAC region: ${stats.rejectedNonApac}`)
  console.log('')

  // Show sample of rejected articles
  console.log('=== SAMPLE REJECTED ARTICLES ===')
  const sampleRejected = rejectedArticles.slice(0, 20)
  for (const article of sampleRejected) {
    console.log(`[${article.reason}] ${article.title.slice(0, 70)}...`)
  }
  console.log('')

  // Update database
  console.log('Updating database...')

  // Mark passed articles
  if (passedIds.length > 0) {
    // Update in batches of 100
    for (let i = 0; i < passedIds.length; i += 100) {
      const batch = passedIds.slice(i, i + 100)
      const { error: updateError } = await supabase
        .from('news_articles')
        .update({ tier1_passed: true })
        .in('id', batch)

      if (updateError) {
        console.error('Failed to update passed articles:', updateError)
      }
    }
    console.log(`✅ Marked ${passedIds.length} articles as tier1_passed=true`)
  }

  // Mark rejected articles and deactivate them
  if (rejectedArticles.length > 0) {
    for (const article of rejectedArticles) {
      const { error: updateError } = await supabase
        .from('news_articles')
        .update({
          tier1_passed: false,
          tier1_reject_reason: article.reason,
          is_active: false,
        })
        .eq('id', article.id)

      if (updateError) {
        console.error(`Failed to update article ${article.id}:`, updateError)
      }
    }
    console.log(`✅ Marked ${rejectedArticles.length} articles as tier1_passed=false and deactivated`)
  }

  // Get final count of active articles
  const { count: activeCount } = await supabase
    .from('news_articles')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)

  console.log(`\n✅ Re-filtering complete! Active articles remaining: ${activeCount}`)
}

main().catch(console.error)
