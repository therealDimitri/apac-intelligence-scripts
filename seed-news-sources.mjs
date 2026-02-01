/**
 * Seed News Intelligence System sources
 * Based on design document: docs/plans/2026-02-01-news-intelligence-design.md
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

const NEWS_SOURCES = [
  // ============================
  // TIER 1: Client Press Releases
  // ============================
  {
    name: 'SingHealth Newsroom',
    source_type: 'scrape',
    url: 'https://www.singhealth.com.sg/about-singhealth/newsroom',
    region: ['Singapore'],
    category: 'client_direct',
    authority_score: 100,
    fetch_frequency: 'every_2_hours',
    config: { client: 'SingHealth' }
  },
  {
    name: 'Mount Alvernia Hospital Press Releases',
    source_type: 'scrape',
    url: 'https://mtalvernia.sg/news_cat/press-release/',
    region: ['Singapore'],
    category: 'client_direct',
    authority_score: 100,
    fetch_frequency: 'every_2_hours',
    config: { client: 'Mount Alvernia Hospital' }
  },
  {
    name: 'SA Health Media Releases',
    source_type: 'scrape',
    url: 'https://www.sahealth.sa.gov.au/wps/wcm/connect/public+content/sa+health+internet/about+us/news+and+media/all+media+releases/media+releases',
    region: ['Australia', 'South Australia'],
    category: 'client_direct',
    authority_score: 100,
    fetch_frequency: 'every_2_hours',
    config: { client: 'SA Health' }
  },
  {
    name: 'WA Health News',
    source_type: 'scrape',
    url: 'https://www.health.wa.gov.au/news',
    region: ['Australia', 'Western Australia'],
    category: 'client_direct',
    authority_score: 100,
    fetch_frequency: 'every_2_hours',
    config: { client: 'WA Health' }
  },
  {
    name: 'Barwon Health News',
    source_type: 'scrape',
    url: 'https://www.barwonhealth.org.au/news/',
    region: ['Australia', 'Victoria'],
    category: 'client_direct',
    authority_score: 100,
    fetch_frequency: 'every_2_hours',
    config: { client: 'Barwon Health Australia' }
  },
  {
    name: 'Epworth Healthcare Newsroom',
    source_type: 'scrape',
    url: 'https://www.epworth.org.au/newsroom',
    region: ['Australia', 'Victoria'],
    category: 'client_direct',
    authority_score: 100,
    fetch_frequency: 'every_2_hours',
    config: { client: 'Epworth Healthcare' }
  },
  {
    name: 'Grampians Health News',
    source_type: 'scrape',
    url: 'https://www.gh.org.au/news/',
    region: ['Australia', 'Victoria'],
    category: 'client_direct',
    authority_score: 100,
    fetch_frequency: 'every_2_hours',
    config: { client: 'Grampians Health' }
  },
  {
    name: 'Western Health News',
    source_type: 'scrape',
    url: 'https://westernhealth.org.au/news',
    region: ['Australia', 'Victoria'],
    category: 'client_direct',
    authority_score: 100,
    fetch_frequency: 'every_2_hours',
    config: { client: 'Western Health' }
  },
  {
    name: 'Royal Victorian Eye and Ear Hospital',
    source_type: 'scrape',
    url: 'https://eyeandear.org.au',
    region: ['Australia', 'Victoria'],
    category: 'client_direct',
    authority_score: 100,
    fetch_frequency: 'every_2_hours',
    config: { client: 'Royal Victorian Eye and Ear Hospital' }
  },
  {
    name: 'Te Whatu Ora Waikato News',
    source_type: 'scrape',
    url: 'https://www.tewhatuora.govt.nz/corporate-information/news-and-updates?news-area=Waikato',
    region: ['New Zealand'],
    category: 'client_direct',
    authority_score: 100,
    fetch_frequency: 'every_2_hours',
    config: { client: 'Te Whatu Ora Waikato' }
  },
  {
    name: 'St. Luke\'s Medical Center News',
    source_type: 'scrape',
    url: 'https://www.stlukes.com.ph/news-and-events/news-and-press-release',
    region: ['Philippines'],
    category: 'client_direct',
    authority_score: 100,
    fetch_frequency: 'every_2_hours',
    config: { client: 'Saint Luke\'s Medical Centre' }
  },
  {
    name: 'GRMC Guam',
    source_type: 'scrape',
    url: 'https://www.grmc.gu/',
    region: ['Guam'],
    category: 'client_direct',
    authority_score: 100,
    fetch_frequency: 'every_2_hours',
    config: { client: 'Guam Regional Medical City' }
  },

  // ============================
  // TIER 2: Healthcare IT Publications
  // ============================
  {
    name: 'Healthcare IT News APAC',
    source_type: 'rss',
    url: 'https://www.healthcareitnews.com/rss/asia',
    region: ['Asia Pacific'],
    category: 'healthcare_it',
    authority_score: 90,
    fetch_frequency: 'every_6_hours',
    config: {}
  },
  {
    name: 'Pulse+IT News',
    source_type: 'rss',
    url: 'https://www.pulseitmagazine.com.au/feed/',
    region: ['Australia', 'New Zealand'],
    category: 'healthcare_it',
    authority_score: 90,
    fetch_frequency: 'every_6_hours',
    config: {}
  },
  {
    name: 'HealthTechAsia',
    source_type: 'scrape',
    url: 'https://www.healthtechasia.com/',
    region: ['Asia Pacific'],
    category: 'healthcare_it',
    authority_score: 85,
    fetch_frequency: 'every_6_hours',
    config: {}
  },
  {
    name: 'MobiHealthNews Asia',
    source_type: 'rss',
    url: 'https://www.mobihealthnews.com/rss',
    region: ['Asia Pacific'],
    category: 'healthcare_it',
    authority_score: 85,
    fetch_frequency: 'every_6_hours',
    config: {}
  },
  {
    name: 'Talking HealthTech',
    source_type: 'scrape',
    url: 'https://www.talkinghealthtech.com/',
    region: ['Australia'],
    category: 'healthcare_it',
    authority_score: 80,
    fetch_frequency: 'daily',
    config: {}
  },
  {
    name: 'The Medical Republic',
    source_type: 'scrape',
    url: 'https://medicalrepublic.com.au/',
    region: ['Australia'],
    category: 'healthcare_it',
    authority_score: 80,
    fetch_frequency: 'daily',
    config: {}
  },

  // ============================
  // TIER 3: Industry & B2B Platforms
  // ============================
  {
    name: 'Healthcare Asia Magazine',
    source_type: 'scrape',
    url: 'https://healthcareasiamagazine.com/',
    region: ['Asia Pacific'],
    category: 'industry_body',
    authority_score: 80,
    fetch_frequency: 'daily',
    config: {}
  },
  {
    name: 'BioSpectrum Asia',
    source_type: 'rss',
    url: 'https://www.biospectrumasia.com/rss',
    region: ['Asia Pacific'],
    category: 'industry_body',
    authority_score: 75,
    fetch_frequency: 'daily',
    config: {}
  },
  {
    name: 'APACCIO Outlook',
    source_type: 'scrape',
    url: 'https://healthcare.apacciooutlook.com/',
    region: ['Asia Pacific'],
    category: 'industry_body',
    authority_score: 75,
    fetch_frequency: 'daily',
    config: {}
  },
  {
    name: 'Hospital Management Asia',
    source_type: 'scrape',
    url: 'https://hospitalmanagementasia.com/',
    region: ['Asia Pacific', 'Southeast Asia'],
    category: 'industry_body',
    authority_score: 75,
    fetch_frequency: 'daily',
    config: {}
  },
  {
    name: 'Black Book Research',
    source_type: 'scrape',
    url: 'https://blackbookmarketresearch.com/',
    region: ['Australia', 'New Zealand'],
    category: 'industry_body',
    authority_score: 80,
    fetch_frequency: 'weekly',
    config: {}
  },

  // ============================
  // TIER 4: Professional Associations
  // ============================
  {
    name: 'APACMed',
    source_type: 'scrape',
    url: 'https://www.apacmed.org/news/',
    region: ['Asia Pacific'],
    category: 'industry_body',
    authority_score: 85,
    fetch_frequency: 'daily',
    config: {}
  },
  {
    name: 'AIDH - Australasian Institute of Digital Health',
    source_type: 'scrape',
    url: 'https://digitalhealth.org.au/news/',
    region: ['Australia', 'New Zealand'],
    category: 'industry_body',
    authority_score: 90,
    fetch_frequency: 'daily',
    config: {}
  },
  {
    name: 'APAMI',
    source_type: 'scrape',
    url: 'http://www.apami.org/',
    region: ['Asia Pacific'],
    category: 'industry_body',
    authority_score: 80,
    fetch_frequency: 'weekly',
    config: {}
  },
  {
    name: 'Signify Research',
    source_type: 'scrape',
    url: 'https://signifyresearch.net/',
    region: ['Asia Pacific'],
    category: 'industry_body',
    authority_score: 80,
    fetch_frequency: 'weekly',
    config: {}
  },
  {
    name: 'IQVIA APAC',
    source_type: 'scrape',
    url: 'https://www.iqvia.com/locations/asia-pacific',
    region: ['Asia Pacific'],
    category: 'industry_body',
    authority_score: 85,
    fetch_frequency: 'weekly',
    config: {}
  },
  {
    name: 'Mordor Intelligence Healthcare IT',
    source_type: 'scrape',
    url: 'https://www.mordorintelligence.com/',
    region: ['Asia Pacific'],
    category: 'industry_body',
    authority_score: 75,
    fetch_frequency: 'weekly',
    config: {}
  },

  // ============================
  // TIER 5: Government Sources
  // ============================

  // Australia Federal
  {
    name: 'Australian Digital Health Agency',
    source_type: 'scrape',
    url: 'https://www.digitalhealth.gov.au/newsroom',
    region: ['Australia'],
    category: 'government',
    authority_score: 95,
    fetch_frequency: 'daily',
    config: {}
  },

  // Australia State Health Departments
  {
    name: 'NSW Health Media',
    source_type: 'scrape',
    url: 'https://www.health.nsw.gov.au/news/Pages/default.aspx',
    region: ['Australia', 'New South Wales'],
    category: 'government',
    authority_score: 95,
    fetch_frequency: 'daily',
    config: {}
  },
  {
    name: 'Queensland Health Media',
    source_type: 'scrape',
    url: 'https://www.health.qld.gov.au/news-events/news',
    region: ['Australia', 'Queensland'],
    category: 'government',
    authority_score: 95,
    fetch_frequency: 'daily',
    config: {}
  },
  {
    name: 'Victorian Department of Health',
    source_type: 'scrape',
    url: 'https://www.health.vic.gov.au/news',
    region: ['Australia', 'Victoria'],
    category: 'government',
    authority_score: 95,
    fetch_frequency: 'daily',
    config: {}
  },
  {
    name: 'Tasmanian Department of Health',
    source_type: 'scrape',
    url: 'https://www.health.tas.gov.au/about/news-and-media',
    region: ['Australia', 'Tasmania'],
    category: 'government',
    authority_score: 95,
    fetch_frequency: 'daily',
    config: {}
  },
  {
    name: 'NT Department of Health',
    source_type: 'scrape',
    url: 'https://health.nt.gov.au/news',
    region: ['Australia', 'Northern Territory'],
    category: 'government',
    authority_score: 95,
    fetch_frequency: 'daily',
    config: {}
  },
  {
    name: 'ACT Health',
    source_type: 'scrape',
    url: 'https://www.health.act.gov.au/news',
    region: ['Australia', 'ACT'],
    category: 'government',
    authority_score: 95,
    fetch_frequency: 'daily',
    config: {}
  },

  // New Zealand
  {
    name: 'Te Whatu Ora National',
    source_type: 'scrape',
    url: 'https://www.tewhatuora.govt.nz/corporate-information/news-and-updates',
    region: ['New Zealand'],
    category: 'government',
    authority_score: 95,
    fetch_frequency: 'daily',
    config: {}
  },
  {
    name: 'NZ Government Beehive',
    source_type: 'scrape',
    url: 'https://www.beehive.govt.nz/',
    region: ['New Zealand'],
    category: 'government',
    authority_score: 95,
    fetch_frequency: 'daily',
    config: { filterKeywords: ['health', 'digital', 'hospital'] }
  },

  // Singapore
  {
    name: 'Synapxe',
    source_type: 'scrape',
    url: 'https://www.synapxe.sg/news',
    region: ['Singapore'],
    category: 'government',
    authority_score: 95,
    fetch_frequency: 'daily',
    config: {}
  },
  {
    name: 'GovInsider Singapore',
    source_type: 'scrape',
    url: 'https://govinsider.asia/intl-en/country/singapore/',
    region: ['Singapore'],
    category: 'government',
    authority_score: 85,
    fetch_frequency: 'daily',
    config: { filterKeywords: ['health', 'digital', 'hospital'] }
  },

  // Philippines
  {
    name: 'DOH Philippines',
    source_type: 'scrape',
    url: 'https://doh.gov.ph/news-and-events',
    region: ['Philippines'],
    category: 'government',
    authority_score: 95,
    fetch_frequency: 'daily',
    config: {}
  },

  // Guam
  {
    name: 'Guam DPHSS',
    source_type: 'scrape',
    url: 'https://dphss.guam.gov/news/',
    region: ['Guam'],
    category: 'government',
    authority_score: 95,
    fetch_frequency: 'daily',
    config: {}
  },
  {
    name: 'GMHA Guam Memorial Hospital',
    source_type: 'scrape',
    url: 'https://www.gmha.org/',
    region: ['Guam'],
    category: 'government',
    authority_score: 90,
    fetch_frequency: 'daily',
    config: {}
  },

  // ============================
  // TENDER PORTALS
  // ============================

  // Australia Federal
  {
    name: 'AusTender',
    source_type: 'tender_portal',
    url: 'https://www.tenders.gov.au/',
    region: ['Australia'],
    category: 'tender',
    authority_score: 100,
    fetch_frequency: 'every_4_hours',
    config: {
      filterKeywords: ['health', 'hospital', 'clinical', 'EMR', 'EHR', 'medical', 'digital health'],
      categoryCode: 'healthcare'
    }
  },

  // Australia State Tender Portals
  {
    name: 'Tenders.vic - Victoria',
    source_type: 'tender_portal',
    url: 'https://www.tenders.vic.gov.au/',
    region: ['Australia', 'Victoria'],
    category: 'tender',
    authority_score: 100,
    fetch_frequency: 'every_4_hours',
    config: { filterKeywords: ['health', 'hospital', 'clinical', 'EMR', 'medical'] }
  },
  {
    name: 'NSW eTendering',
    source_type: 'tender_portal',
    url: 'https://tenders.nsw.gov.au/',
    region: ['Australia', 'New South Wales'],
    category: 'tender',
    authority_score: 100,
    fetch_frequency: 'every_4_hours',
    config: { filterKeywords: ['health', 'hospital', 'clinical', 'EMR', 'medical'] }
  },
  {
    name: 'QTenders - Queensland',
    source_type: 'tender_portal',
    url: 'https://qtenders.epw.qld.gov.au/',
    region: ['Australia', 'Queensland'],
    category: 'tender',
    authority_score: 100,
    fetch_frequency: 'every_4_hours',
    config: { filterKeywords: ['health', 'hospital', 'clinical', 'EMR', 'medical'] }
  },
  {
    name: 'SA Tenders - South Australia',
    source_type: 'tender_portal',
    url: 'https://www.tenders.sa.gov.au/',
    region: ['Australia', 'South Australia'],
    category: 'tender',
    authority_score: 100,
    fetch_frequency: 'every_4_hours',
    config: { filterKeywords: ['health', 'hospital', 'clinical', 'EMR', 'medical'] }
  },
  {
    name: 'WA Tenders - Western Australia',
    source_type: 'tender_portal',
    url: 'https://www.tenders.wa.gov.au/',
    region: ['Australia', 'Western Australia'],
    category: 'tender',
    authority_score: 100,
    fetch_frequency: 'every_4_hours',
    config: { filterKeywords: ['health', 'hospital', 'clinical', 'EMR', 'medical'] }
  },
  {
    name: 'Tasmanian Government Tenders',
    source_type: 'tender_portal',
    url: 'https://www.purchasing.tas.gov.au/',
    region: ['Australia', 'Tasmania'],
    category: 'tender',
    authority_score: 100,
    fetch_frequency: 'every_4_hours',
    config: { filterKeywords: ['health', 'hospital', 'clinical', 'EMR', 'medical'] }
  },
  {
    name: 'NT Tenders - Northern Territory',
    source_type: 'tender_portal',
    url: 'https://nt.gov.au/industry/tenders-and-procurement/current-tenders',
    region: ['Australia', 'Northern Territory'],
    category: 'tender',
    authority_score: 100,
    fetch_frequency: 'every_4_hours',
    config: { filterKeywords: ['health', 'hospital', 'clinical', 'EMR', 'medical'] }
  },
  {
    name: 'ACT Government Tenders',
    source_type: 'tender_portal',
    url: 'https://www.tenders.act.gov.au/',
    region: ['Australia', 'ACT'],
    category: 'tender',
    authority_score: 100,
    fetch_frequency: 'every_4_hours',
    config: { filterKeywords: ['health', 'hospital', 'clinical', 'EMR', 'medical'] }
  },

  // New Zealand
  {
    name: 'GETS - NZ Government Tenders',
    source_type: 'tender_portal',
    url: 'https://www.gets.govt.nz/',
    region: ['New Zealand'],
    category: 'tender',
    authority_score: 100,
    fetch_frequency: 'every_4_hours',
    config: { filterKeywords: ['health', 'hospital', 'clinical', 'EMR', 'medical'] }
  },

  // Singapore
  {
    name: 'GeBIZ - Singapore Government Tenders',
    source_type: 'tender_portal',
    url: 'https://www.gebiz.gov.sg/',
    region: ['Singapore'],
    category: 'tender',
    authority_score: 100,
    fetch_frequency: 'every_4_hours',
    config: { filterKeywords: ['health', 'hospital', 'clinical', 'EMR', 'medical'] }
  },

  // Philippines
  {
    name: 'PhilGEPS - Philippines Tenders',
    source_type: 'tender_portal',
    url: 'https://www.philgeps.gov.ph/',
    region: ['Philippines'],
    category: 'tender',
    authority_score: 100,
    fetch_frequency: 'every_4_hours',
    config: { filterKeywords: ['health', 'hospital', 'clinical', 'EMR', 'medical'] }
  }
]

async function seedNewsSources() {
  console.log('Seeding News Intelligence sources...\n')

  // First, check if sources already exist
  const { data: existing } = await supabase
    .from('news_sources')
    .select('id')
    .limit(1)

  if (existing && existing.length > 0) {
    console.log('Sources already seeded. Clearing existing sources...')
    await supabase.from('news_sources').delete().neq('id', 0)
  }

  // Insert all sources
  const { data, error } = await supabase
    .from('news_sources')
    .insert(NEWS_SOURCES)
    .select()

  if (error) {
    console.error('Error seeding sources:', error.message)
    process.exit(1)
  }

  console.log(`✅ Seeded ${data.length} news sources!\n`)

  // Summary by category
  const categories = {}
  data.forEach(source => {
    categories[source.category] = (categories[source.category] || 0) + 1
  })

  console.log('Sources by category:')
  Object.entries(categories).forEach(([cat, count]) => {
    console.log(`  ${cat}: ${count}`)
  })

  // Summary by region
  const regions = {}
  data.forEach(source => {
    source.region?.forEach(r => {
      regions[r] = (regions[r] || 0) + 1
    })
  })

  console.log('\nSources by region:')
  Object.entries(regions)
    .sort((a, b) => b[1] - a[1])
    .forEach(([region, count]) => {
      console.log(`  ${region}: ${count}`)
    })
}

seedNewsSources().catch(console.error)
