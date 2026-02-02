/**
 * Configure Scrape Sources
 *
 * Updates news_sources with CSS selector configurations for web scraping.
 * Run: node scripts/configure-scrape-sources.mjs
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Scrape configurations for known sites
// These are CSS selectors for extracting news articles
const SCRAPE_CONFIGS = {
  // Singapore
  'SingHealth Newsroom': {
    articleSelector: '.views-row',
    titleSelector: 'h3 a, .views-field-title a',
    linkSelector: 'h3 a, .views-field-title a',
    dateSelector: '.date-display-single, .views-field-created',
    summarySelector: '.views-field-body, p',
    baseUrl: 'https://www.singhealth.com.sg',
  },

  // Australia - Hospital Systems
  'Barwon Health News': {
    articleSelector: 'article, .news-item, .media-item',
    titleSelector: 'h2 a, h3 a, .entry-title a',
    linkSelector: 'h2 a, h3 a, a.read-more',
    dateSelector: 'time, .date, .published',
    summarySelector: '.excerpt, .entry-summary, p',
    baseUrl: 'https://www.barwonhealth.org.au',
  },
  'Austin Health News': {
    articleSelector: '.news-listing-item, article',
    titleSelector: 'h3 a, h2 a',
    linkSelector: 'a',
    dateSelector: '.date, time',
    summarySelector: 'p, .summary',
    baseUrl: 'https://www.austin.org.au',
  },
  'Grampians Health News': {
    articleSelector: '.news-item, article, .views-row',
    titleSelector: 'h3 a, h2 a, .title a',
    linkSelector: 'a',
    dateSelector: '.date, time',
    summarySelector: 'p',
    baseUrl: 'https://www.grampianshealth.org.au',
  },
  'Albury Wodonga Health News': {
    articleSelector: '.news-item, article',
    titleSelector: 'h3 a, h2 a',
    linkSelector: 'a',
    dateSelector: '.date',
    summarySelector: 'p',
    baseUrl: 'https://www.awh.org.au',
  },

  // Australia - State Health Departments
  'SA Health Media Releases': {
    articleSelector: '.listing-item, .media-release, article',
    titleSelector: 'a, h3',
    linkSelector: 'a',
    dateSelector: '.date',
    summarySelector: 'p',
    baseUrl: 'https://www.sahealth.sa.gov.au',
  },
  'WA Health News': {
    articleSelector: '.news-item, .media-release, article',
    titleSelector: 'h3 a, h2 a, a',
    linkSelector: 'a',
    dateSelector: '.date, time',
    summarySelector: 'p',
    baseUrl: 'https://www.health.wa.gov.au',
  },
  'NSW Health Media Releases': {
    articleSelector: '.media-release, .news-item, article',
    titleSelector: 'h3 a, a',
    linkSelector: 'a',
    dateSelector: '.date, time',
    summarySelector: 'p, .summary',
    baseUrl: 'https://www.health.nsw.gov.au',
  },
  'Queensland Health News': {
    articleSelector: '.news-item, article, .qg-card',
    titleSelector: 'h3 a, h2 a, a',
    linkSelector: 'a',
    dateSelector: '.date, time',
    summarySelector: 'p',
    baseUrl: 'https://www.health.qld.gov.au',
  },
  'Victorian DHHS News': {
    articleSelector: '.news-item, article',
    titleSelector: 'h3 a, h2 a',
    linkSelector: 'a',
    dateSelector: '.date',
    summarySelector: 'p',
    baseUrl: 'https://www.health.vic.gov.au',
  },

  // Singapore Private
  'Mount Alvernia Hospital Press Releases': {
    articleSelector: 'article, .post, .news-item',
    titleSelector: 'h2 a, .entry-title a',
    linkSelector: 'h2 a, .entry-title a',
    dateSelector: 'time, .date',
    summarySelector: '.excerpt, p',
    baseUrl: 'https://mtalvernia.sg',
  },
  'Raffles Hospital News': {
    articleSelector: '.news-item, article',
    titleSelector: 'h3 a, h2 a',
    linkSelector: 'a',
    dateSelector: '.date',
    summarySelector: 'p',
    baseUrl: 'https://www.rafflesmedicalgroup.com',
  },

  // New Zealand
  'Canterbury DHB News': {
    articleSelector: '.news-item, article',
    titleSelector: 'h3 a, h2 a',
    linkSelector: 'a',
    dateSelector: '.date, time',
    summarySelector: 'p',
    baseUrl: 'https://www.cdhb.health.nz',
  },
  'Auckland DHB News': {
    articleSelector: '.news-item, article',
    titleSelector: 'h3 a, h2 a',
    linkSelector: 'a',
    dateSelector: '.date',
    summarySelector: 'p',
    baseUrl: 'https://www.adhb.health.nz',
  },

  // Government / Industry Bodies
  'Australian Digital Health Agency News': {
    articleSelector: '.news-item, article, .views-row',
    titleSelector: 'h3 a, h2 a',
    linkSelector: 'a',
    dateSelector: '.date, time',
    summarySelector: 'p, .summary',
    baseUrl: 'https://www.digitalhealth.gov.au',
  },
  'HIMSS APAC News': {
    articleSelector: 'article, .news-item',
    titleSelector: 'h3 a, h2 a',
    linkSelector: 'a',
    dateSelector: 'time, .date',
    summarySelector: 'p, .summary',
    baseUrl: 'https://www.himss.org',
  },
}

async function main() {
  console.log('Updating scrape source configurations...\n')

  // Get all scrape sources
  const { data: sources, error } = await supabase
    .from('news_sources')
    .select('id, name, config')
    .eq('source_type', 'scrape')
    .eq('is_active', true)

  if (error) {
    console.error('Error fetching sources:', error)
    process.exit(1)
  }

  let updated = 0
  let skipped = 0

  for (const source of sources || []) {
    const config = SCRAPE_CONFIGS[source.name]

    if (config) {
      // Merge scrapeConfig into existing config
      const newConfig = {
        ...source.config,
        scrapeConfig: config,
      }

      const { error: updateError } = await supabase
        .from('news_sources')
        .update({ config: newConfig })
        .eq('id', source.id)

      if (updateError) {
        console.error(`  Error updating ${source.name}:`, updateError.message)
      } else {
        console.log(`  ✓ Updated: ${source.name}`)
        updated++
      }
    } else {
      console.log(`  - Skipped (no config): ${source.name}`)
      skipped++
    }
  }

  console.log(`\nDone: ${updated} updated, ${skipped} skipped`)
}

main()
