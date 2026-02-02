/**
 * Tender Scraper Orchestrator
 *
 * Main entry point for GitHub Actions workflow.
 * Runs Playwright-based scrapers for Australian government tender portals.
 *
 * Usage:
 *   PORTALS=all npx tsx scripts/tender-scraper/index.ts
 *   PORTALS=austender,victoria npx tsx scripts/tender-scraper/index.ts
 */

import { chromium, Browser, BrowserContext } from 'playwright'
import { AusTenderScraper } from './scrapers/austender'
import { VictoriaScraper } from './scrapers/victoria'
import { NSWScraper } from './scrapers/nsw'
import { QLDScraper } from './scrapers/qld'
import { storeTenders, updateScraperLog } from './utils/supabase'
import type { ScraperResult, TenderResult } from './types'
import { PORTAL_CONFIGS } from './types'

// Map portal keys to scraper classes
const SCRAPERS = {
  austender: AusTenderScraper,
  victoria: VictoriaScraper,
  nsw: NSWScraper,
  qld: QLDScraper,
}

async function runScraper(
  browser: Browser,
  portalKey: string
): Promise<{ results: TenderResult[]; error?: string }> {
  const ScraperClass = SCRAPERS[portalKey as keyof typeof SCRAPERS]
  if (!ScraperClass) {
    return { results: [], error: `Unknown portal: ${portalKey}` }
  }

  const scraper = new ScraperClass()
  let context: BrowserContext | null = null

  try {
    // Create isolated browser context for each scraper
    context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'en-AU',
      timezoneId: 'Australia/Sydney',
    })

    const page = await context.newPage()

    // Run the scraper
    const results = await scraper.scrape(page)

    return { results }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[${portalKey}] Scraper failed:`, errorMessage)
    return { results: [], error: errorMessage }
  } finally {
    if (context) {
      await context.close()
    }
  }
}

async function main() {
  console.log('='.repeat(60))
  console.log('Tender Scraper - GitHub Actions')
  console.log('='.repeat(60))
  console.log(`Started: ${new Date().toISOString()}`)
  console.log()

  // Determine which portals to scrape
  const portalsEnv = process.env.PORTALS || 'all'
  let portals: string[]

  if (portalsEnv === 'all') {
    portals = Object.keys(SCRAPERS)
  } else {
    portals = portalsEnv.split(',').map(p => p.trim().toLowerCase())
  }

  // Filter to only enabled portals
  portals = portals.filter(p => PORTAL_CONFIGS[p]?.enabled)

  console.log(`Portals to scrape: ${portals.join(', ')}`)
  console.log()

  // Launch browser
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
    ],
  })

  const results: ScraperResult[] = []
  let totalTenders = 0
  let totalInserted = 0

  try {
    // Run scrapers sequentially (to be respectful to servers)
    for (const portal of portals) {
      console.log(`\n${'─'.repeat(40)}`)
      console.log(`Scraping: ${PORTAL_CONFIGS[portal]?.name || portal}`)
      console.log('─'.repeat(40))

      const startTime = Date.now()

      const { results: tenders, error } = await runScraper(browser, portal)
      const duration = Date.now() - startTime

      const result: ScraperResult = {
        portal,
        success: !error,
        tendersFound: tenders.length,
        tendersInserted: 0,
        duration,
        error,
      }

      // Store tenders in database
      if (tenders.length > 0) {
        try {
          const inserted = await storeTenders(tenders)
          result.tendersInserted = inserted
          totalInserted += inserted
        } catch (storeError) {
          result.error = `Store failed: ${storeError instanceof Error ? storeError.message : 'Unknown'}`
          result.success = false
        }
      }

      totalTenders += tenders.length
      results.push(result)

      // Update scraper log in database
      await updateScraperLog(portal, result.success, result.tendersFound, result.tendersInserted, result.error)

      console.log(
        `Result: ${result.tendersFound} found, ${result.tendersInserted} inserted (${(duration / 1000).toFixed(1)}s)`
      )
      if (result.error) {
        console.log(`Error: ${result.error}`)
      }

      // Delay between portals
      if (portals.indexOf(portal) < portals.length - 1) {
        console.log('\nWaiting 5 seconds before next portal...')
        await new Promise(r => setTimeout(r, 5000))
      }
    }
  } finally {
    await browser.close()
  }

  // Print summary
  console.log('\n' + '='.repeat(60))
  console.log('SUMMARY')
  console.log('='.repeat(60))

  for (const result of results) {
    const status = result.success ? '✓' : '✗'
    console.log(
      `${status} ${PORTAL_CONFIGS[result.portal]?.name || result.portal}: ` +
        `${result.tendersFound} found, ${result.tendersInserted} inserted`
    )
    if (result.error) {
      console.log(`  Error: ${result.error}`)
    }
  }

  console.log()
  console.log(`Total tenders found: ${totalTenders}`)
  console.log(`Total inserted: ${totalInserted}`)
  console.log(`Completed: ${new Date().toISOString()}`)
  console.log('='.repeat(60))

  // Exit with error if all scrapers failed
  const successCount = results.filter(r => r.success).length
  if (successCount === 0) {
    console.error('\nAll scrapers failed!')
    process.exit(1)
  }
}

main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
