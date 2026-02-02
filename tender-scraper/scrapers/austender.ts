/**
 * AusTender Scraper
 * Federal government tender portal: tenders.gov.au
 */

import type { Page, ElementHandle } from 'playwright'
import { BaseTenderScraper } from './base-scraper'
import type { TenderResult, ScraperConfig } from '../types'
import { PORTAL_CONFIGS } from '../types'

export class AusTenderScraper extends BaseTenderScraper {
  name = 'AusTender'
  portalKey = 'austender'
  config: ScraperConfig = PORTAL_CONFIGS.austender

  async scrape(page: Page): Promise<TenderResult[]> {
    const results: TenderResult[] = []

    console.log(`[${this.name}] Starting scrape...`)

    try {
      // Navigate to Contract Notices search
      await page.goto(`${this.config.baseUrl}/Cn/Search`, {
        waitUntil: 'domcontentloaded',
        timeout: this.config.timeout,
      })

      await this.humanDelay(page)

      // Check if we landed on the search page
      const searchForm = await page.$('form')
      if (!searchForm) {
        await this.takeDebugScreenshot(page, 'no-search-form')
        throw new Error('Search form not found')
      }

      // Fill in search criteria
      const keywordInput = await page.$('#KeywordSearch, input[name="KeywordSearch"], input[type="text"]')
      if (keywordInput) {
        await keywordInput.fill(this.config.searchKeywords.join(' '))
        console.log(`[${this.name}] Filled keyword search`)
      }

      // Select Open status if dropdown exists
      const statusSelect = await page.$('#Status, select[name="Status"]')
      if (statusSelect) {
        await statusSelect.selectOption({ label: 'Open' }).catch(() => {
          statusSelect.selectOption('Open').catch(() => {})
        })
      }

      // Submit search
      const submitButton = await page.$(
        'button[type="submit"], input[type="submit"], .search-button, #search-button'
      )
      if (submitButton) {
        await submitButton.click()
        await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
      }

      await this.humanDelay(page, 2000, 4000)

      // Parse results from multiple possible structures
      let pageNum = 0
      const maxPages = this.config.maxPages

      while (pageNum < maxPages) {
        console.log(`[${this.name}] Parsing page ${pageNum + 1}...`)

        const pageResults = await this.parseResultsPage(page)
        results.push(...pageResults)

        console.log(`[${this.name}] Found ${pageResults.length} tenders on page ${pageNum + 1}`)

        // Check for next page
        const nextButton = await page.$(
          '.pagination .next:not(.disabled), a[rel="next"], .page-link:has-text("Next")'
        )
        if (!nextButton || pageResults.length === 0) {
          break
        }

        await nextButton.click()
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
        await this.humanDelay(page)
        pageNum++
      }

      // Filter for healthcare-related tenders
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

    // Try table-based results
    const tableRows = await page.$$('table tbody tr, .search-results tr')
    if (tableRows.length > 0) {
      for (const row of tableRows) {
        const tender = await this.parseTableRow(row)
        if (tender) results.push(tender)
      }
      return results
    }

    // Try list-based results
    const listItems = await page.$$('.list-unstyled li, .search-result, .result-item, article')
    for (const item of listItems) {
      const tender = await this.parseListItem(item)
      if (tender) results.push(tender)
    }

    return results
  }

  private async parseTableRow(row: ElementHandle): Promise<TenderResult | null> {
    try {
      const cells = await row.$$('td')
      if (cells.length < 2) return null

      const linkEl = await row.$('a')
      const link = linkEl ? await linkEl.getAttribute('href') : null
      const title = linkEl ? await linkEl.textContent() : ''

      if (!title?.trim()) return null

      // Extract reference from first cell or link
      let reference = ''
      if (cells[0]) {
        reference = (await cells[0].textContent())?.trim() || ''
      }
      if (!reference && link) {
        const match = link.match(/\/Cn\/Show\/(\d+)/)
        if (match) reference = `CN${match[1]}`
      }
      if (!reference) {
        reference = this.generateReference('AUSTENDER')
      }

      // Extract agency from third cell if exists
      const agency = cells[2] ? (await cells[2].textContent())?.trim() : 'Australian Government'

      // Extract close date from fourth cell if exists
      const closeDate = cells[3] ? this.parseAustralianDate(await cells[3].textContent()) : null

      return {
        tender_reference: reference,
        issuing_body: agency || 'Australian Government',
        title: title.trim(),
        description: null,
        region: 'Australia',
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

  private async parseListItem(item: ElementHandle): Promise<TenderResult | null> {
    try {
      const linkEl = await item.$('a')
      const link = linkEl ? await linkEl.getAttribute('href') : null

      // Get title from link or heading
      let title = ''
      if (linkEl) {
        title = (await linkEl.textContent()) || ''
      }
      if (!title) {
        const headingEl = await item.$('h3, h4, .title')
        if (headingEl) {
          title = (await headingEl.textContent()) || ''
        }
      }

      if (!title?.trim() || title.length < 10) return null

      // Extract reference
      let reference = ''
      const refEl = await item.$('.reference, .cn-id, .atm-id')
      if (refEl) {
        reference = (await refEl.textContent())?.trim() || ''
      }
      if (!reference && link) {
        const match = link.match(/\/(?:Cn|Atm)\/Show\/(\d+)/)
        if (match) reference = `CN${match[1]}`
      }
      if (!reference) {
        reference = this.generateReference('AUSTENDER')
      }

      // Extract agency
      const agencyEl = await item.$('.agency, .organisation')
      const agency = agencyEl ? (await agencyEl.textContent())?.trim() : 'Australian Government'

      // Extract close date
      const dateEl = await item.$('.close-date, .closing-date')
      const closeDate = dateEl ? this.parseAustralianDate(await dateEl.textContent()) : null

      return {
        tender_reference: reference,
        issuing_body: agency || 'Australian Government',
        title: title.trim(),
        description: null,
        region: 'Australia',
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
