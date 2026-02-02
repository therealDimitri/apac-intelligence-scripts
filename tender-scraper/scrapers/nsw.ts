/**
 * NSW eTendering Scraper
 * State government tender portal: buy.nsw.gov.au
 *
 * Challenge: React/Angular SPA, content loads dynamically
 * Strategy: Wait for JavaScript hydration before parsing
 */

import type { Page, ElementHandle } from 'playwright'
import { BaseTenderScraper } from './base-scraper'
import type { TenderResult, ScraperConfig } from '../types'
import { PORTAL_CONFIGS } from '../types'

export class NSWScraper extends BaseTenderScraper {
  name = 'NSW eTendering'
  portalKey = 'nsw'
  config: ScraperConfig = PORTAL_CONFIGS.nsw

  async scrape(page: Page): Promise<TenderResult[]> {
    const results: TenderResult[] = []

    console.log(`[${this.name}] Starting scrape...`)

    try {
      // Navigate to tender search
      await page.goto(`${this.config.baseUrl}/supplier/search/tender`, {
        waitUntil: 'domcontentloaded',
        timeout: this.config.timeout,
      })

      await this.humanDelay(page, 2000, 3000)

      // Wait for SPA to hydrate - check for dynamic content
      const contentLoaded = await this.waitForSPAContent(page)
      if (!contentLoaded) {
        console.warn(`[${this.name}] SPA content did not load, trying alternative approach...`)
        await this.takeDebugScreenshot(page, 'spa-not-loaded')

        // Try going to homepage first
        await page.goto(this.config.baseUrl, { waitUntil: 'networkidle' })
        await this.humanDelay(page)

        // Look for tender link
        const tenderLink = await page.$('a[href*="tender"], a:has-text("Tender")')
        if (tenderLink) {
          await tenderLink.click()
          await page.waitForLoadState('networkidle', { timeout: 15000 })
          await this.waitForSPAContent(page)
        }
      }

      // Try to apply health filter if available
      const searchInput = await page.$('input[type="search"], input[placeholder*="Search"], #search')
      if (searchInput) {
        await searchInput.fill('health')
        await page.keyboard.press('Enter')
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
        await this.humanDelay(page)
      }

      // Scroll to trigger lazy loading
      await this.scrollToLoadContent(page)

      // Parse results
      let pageNum = 0
      const maxPages = this.config.maxPages

      while (pageNum < maxPages) {
        console.log(`[${this.name}] Parsing page ${pageNum + 1}...`)

        const pageResults = await this.parseResultsPage(page)
        results.push(...pageResults)

        console.log(`[${this.name}] Found ${pageResults.length} tenders on page ${pageNum + 1}`)

        if (pageResults.length === 0) break

        // Check for next page / load more
        const nextButton = await page.$(
          '.pagination .next:not(.disabled), button:has-text("Load more"), a[rel="next"]'
        )
        if (!nextButton) break

        await nextButton.click()
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
        await this.humanDelay(page, 2000, 3000)
        pageNum++
      }

      // Filter for healthcare-related
      const healthcareTenders = results.filter(t => this.isHealthcareRelated(t.title, t.description))
      console.log(`[${this.name}] Total: ${results.length}, Healthcare-related: ${healthcareTenders.length}`)

      return healthcareTenders
    } catch (error) {
      console.error(`[${this.name}] Scrape error:`, error)
      await this.takeDebugScreenshot(page, 'error')
      throw error
    }
  }

  private async waitForSPAContent(page: Page): Promise<boolean> {
    try {
      // Wait for any of these indicators that SPA has loaded
      await page.waitForFunction(
        () => {
          // Check for tender-related content
          const hasResults =
            document.querySelectorAll('[data-testid*="tender"], .tender-card, .result-card, article')
              .length > 0
          const hasTable = document.querySelectorAll('table tbody tr').length > 0
          const hasNoResults =
            document.body.textContent?.includes('No results') ||
            document.body.textContent?.includes('No tenders')

          return hasResults || hasTable || hasNoResults
        },
        { timeout: 20000 }
      )
      return true
    } catch {
      return false
    }
  }

  private async parseResultsPage(page: Page): Promise<TenderResult[]> {
    const results: TenderResult[] = []

    // Try various SPA result selectors
    const selectors = [
      '[data-testid*="tender"]',
      '.tender-card',
      '.result-card',
      '.search-result-item',
      'table tbody tr',
      'article',
      '.listing',
    ]

    for (const selector of selectors) {
      const items = await page.$$(selector)
      if (items.length > 0) {
        for (const item of items) {
          const tender = await this.parseResultItem(item)
          if (tender) results.push(tender)
        }
        if (results.length > 0) break
      }
    }

    return results
  }

  private async parseResultItem(item: ElementHandle): Promise<TenderResult | null> {
    try {
      // Get link and title
      const linkEl = await item.$('a')
      const link = linkEl ? await linkEl.getAttribute('href') : null

      let title = ''
      if (linkEl) {
        title = (await linkEl.textContent()) || ''
      }
      if (!title) {
        const titleEl = await item.$('.title, h3, h4, [data-testid*="title"]')
        if (titleEl) {
          title = (await titleEl.textContent()) || ''
        }
      }

      if (!title?.trim() || title.length < 10) return null

      // Extract reference
      let reference = ''
      const refEl = await item.$('.rfx-id, .reference, [data-testid*="reference"]')
      if (refEl) {
        reference = (await refEl.textContent())?.trim() || ''
      }
      if (!reference && link) {
        const match = link.match(/tender\/(\d+)/)
        if (match) reference = `NSW${match[1]}`
      }
      if (!reference) {
        reference = this.generateReference('NSW')
      }

      // Extract agency
      const agencyEl = await item.$('.agency, .organisation, [data-testid*="agency"]')
      const agency = agencyEl ? (await agencyEl.textContent())?.trim() : 'NSW Government'

      // Extract close date
      const dateEl = await item.$('.close-date, .closing, [data-testid*="date"]')
      const closeDate = dateEl ? this.parseAustralianDate(await dateEl.textContent()) : null

      // Extract description
      const descEl = await item.$('.description, .summary, p')
      const description = descEl ? (await descEl.textContent())?.trim() || null : null

      return {
        tender_reference: reference,
        issuing_body: agency || 'NSW Government',
        title: title.trim(),
        description,
        region: 'New South Wales',
        close_date: closeDate,
        estimated_value: null,
        source_url: link
          ? link.startsWith('http')
            ? link
            : `${this.config.baseUrl}${link}`
          : this.config.baseUrl,
        portal: this.portalKey,
      }
    } catch {
      return null
    }
  }
}
