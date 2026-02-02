/**
 * Victoria Tenders Scraper
 * State government tender portal: tenders.vic.gov.au
 *
 * Challenge: Active bot protection (403 Forbidden)
 * Strategy: Realistic browser fingerprint, human-like timing
 */

import type { Page, ElementHandle } from 'playwright'
import { BaseTenderScraper } from './base-scraper'
import type { TenderResult, ScraperConfig } from '../types'
import { PORTAL_CONFIGS } from '../types'

export class VictoriaScraper extends BaseTenderScraper {
  name = 'Victoria Tenders'
  portalKey = 'victoria'
  config: ScraperConfig = PORTAL_CONFIGS.victoria

  async scrape(page: Page): Promise<TenderResult[]> {
    const results: TenderResult[] = []

    console.log(`[${this.name}] Starting scrape...`)

    try {
      // Set realistic headers
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-AU,en-GB;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
      })

      // Add random delay before first request (appear human)
      await this.humanDelay(page, 2000, 4000)

      // Navigate to search page
      await page.goto(`${this.config.baseUrl}/tender/search?preset=open`, {
        waitUntil: 'domcontentloaded',
        timeout: this.config.timeout,
      })

      // Check for bot block
      const pageContent = await page.content()
      if (
        pageContent.includes('Access Denied') ||
        pageContent.includes('403') ||
        pageContent.includes('blocked')
      ) {
        console.warn(`[${this.name}] Bot protection detected, trying alternative approach...`)
        await this.takeDebugScreenshot(page, 'bot-blocked')

        // Try the homepage first then navigate
        await page.goto(this.config.baseUrl, { waitUntil: 'networkidle' })
        await this.humanDelay(page, 3000, 5000)

        // Click through to tenders
        const tendersLink = await page.$('a[href*="tender"], a:has-text("Tenders")')
        if (tendersLink) {
          await tendersLink.click()
          await page.waitForLoadState('networkidle')
        }
      }

      await this.humanDelay(page, 2000, 3000)

      // Scroll to trigger any lazy loading
      await this.scrollToLoadContent(page)

      // Try to find health category filter
      const categoryFilter = await page.$('select[name="category"], #category')
      if (categoryFilter) {
        await categoryFilter.selectOption({ label: 'Health' }).catch(() => {})
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
      }

      // Parse results
      let pageNum = 0
      const maxPages = this.config.maxPages

      while (pageNum < maxPages) {
        console.log(`[${this.name}] Parsing page ${pageNum + 1}...`)

        const pageResults = await this.parseResultsPage(page)
        results.push(...pageResults)

        console.log(`[${this.name}] Found ${pageResults.length} tenders on page ${pageNum + 1}`)

        if (pageResults.length === 0) break

        // Check for next page
        const nextButton = await page.$('.pagination .next:not(.disabled), a[rel="next"]')
        if (!nextButton) break

        await nextButton.click()
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
        await this.humanDelay(page, 2000, 4000)
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

  private async parseResultsPage(page: Page): Promise<TenderResult[]> {
    const results: TenderResult[] = []

    // Try various result selectors
    const selectors = [
      'table tbody tr',
      '.tender-list-item',
      '.search-result',
      '.result-item',
      '[data-tender-id]',
      'article',
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
        const titleEl = await item.$('.title, h3, h4, td:nth-child(2)')
        if (titleEl) {
          title = (await titleEl.textContent()) || ''
        }
      }

      if (!title?.trim() || title.length < 10) return null

      // Extract reference
      let reference = ''
      const refEl = await item.$('.tender-id, .reference, td:first-child')
      if (refEl) {
        reference = (await refEl.textContent())?.trim() || ''
      }
      if (!reference && link) {
        const match = link.match(/[?&]id=(\d+)/)
        if (match) reference = `VIC${match[1]}`
      }
      if (!reference) {
        reference = this.generateReference('VIC')
      }

      // Extract agency
      const agencyEl = await item.$('.agency, .organisation, td:nth-child(3)')
      const agency = agencyEl ? (await agencyEl.textContent())?.trim() : 'Victorian Government'

      // Extract close date
      const dateEl = await item.$('.close-date, .closing, td:nth-child(4)')
      const closeDate = dateEl ? this.parseAustralianDate(await dateEl.textContent()) : null

      // Extract description if available
      const descEl = await item.$('.description, .summary')
      const description = descEl ? (await descEl.textContent())?.trim() || null : null

      return {
        tender_reference: reference,
        issuing_body: agency || 'Victorian Government',
        title: title.trim(),
        description,
        region: 'Victoria',
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
