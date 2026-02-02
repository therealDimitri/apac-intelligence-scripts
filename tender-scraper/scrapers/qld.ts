/**
 * QLD QTenders Scraper
 * State government tender portal: qtenders.hpw.qld.gov.au
 *
 * Challenge: Blazor WebAssembly application (heaviest SPA type)
 * Strategy: Wait for Blazor to fully initialize, then parse
 */

import type { Page, ElementHandle } from 'playwright'
import { BaseTenderScraper } from './base-scraper'
import type { TenderResult, ScraperConfig } from '../types'
import { PORTAL_CONFIGS } from '../types'

export class QLDScraper extends BaseTenderScraper {
  name = 'QLD QTenders'
  portalKey = 'qld'
  config: ScraperConfig = PORTAL_CONFIGS.qld

  async scrape(page: Page): Promise<TenderResult[]> {
    const results: TenderResult[] = []

    console.log(`[${this.name}] Starting scrape (Blazor WASM - may take longer)...`)

    try {
      // Navigate to QTenders
      await page.goto(`${this.config.baseUrl}/qtenders/`, {
        waitUntil: 'domcontentloaded',
        timeout: this.config.timeout,
      })

      // Wait for Blazor to initialize - this can take 10-20 seconds
      console.log(`[${this.name}] Waiting for Blazor WASM to initialize...`)
      const blazorReady = await this.waitForBlazor(page)

      if (!blazorReady) {
        console.warn(`[${this.name}] Blazor did not fully initialize`)
        await this.takeDebugScreenshot(page, 'blazor-timeout')
      }

      await this.humanDelay(page, 3000, 5000)

      // Look for tender search/list functionality
      // QTenders typically has a search interface once loaded
      const searchLoaded = await this.navigateToTenderSearch(page)
      if (!searchLoaded) {
        console.warn(`[${this.name}] Could not navigate to tender search`)
        await this.takeDebugScreenshot(page, 'no-search')
      }

      // Try to filter by health category
      await this.applyHealthFilter(page)

      // Scroll to load all content
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

        // Check for next page
        const nextButton = await page.$(
          '.pagination .next:not(.disabled), button:has-text("Next"), [aria-label="Next"]'
        )
        if (!nextButton) break

        const isDisabled = await nextButton.getAttribute('disabled')
        if (isDisabled) break

        await nextButton.click()
        await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
        await this.humanDelay(page, 3000, 5000)
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

  private async waitForBlazor(page: Page): Promise<boolean> {
    try {
      // Wait for Blazor runtime to be available
      await page.waitForFunction(
        () => {
          // Check if Blazor is defined (WASM loaded)
          // @ts-expect-error Blazor is a global added by Blazor WASM
          const hasBlazor = typeof window.Blazor !== 'undefined'

          // Check if the app element has content
          const appEl = document.getElementById('app')
          const hasContent = appEl && appEl.children.length > 0

          // Check for common Blazor-rendered elements
          const hasBlazorContent =
            document.querySelectorAll('[blazor-component], [b-*], .mud-main-content').length > 0

          return hasBlazor || hasContent || hasBlazorContent
        },
        { timeout: 30000 }
      )

      // Additional wait for content to render
      await page.waitForTimeout(3000)
      return true
    } catch {
      return false
    }
  }

  private async navigateToTenderSearch(page: Page): Promise<boolean> {
    try {
      // Look for tender search link or button
      const searchSelectors = [
        'a[href*="tender"]',
        'a[href*="search"]',
        'button:has-text("Search")',
        'a:has-text("Browse Tenders")',
        'a:has-text("Open Tenders")',
        '.nav-link:has-text("Tender")',
      ]

      for (const selector of searchSelectors) {
        const el = await page.$(selector)
        if (el) {
          await el.click()
          await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
          await this.humanDelay(page, 2000, 3000)
          return true
        }
      }

      // Check if we're already on a tender list page
      const tenderList = await page.$(
        '.tender-list, table, [data-tender], .search-results'
      )
      return tenderList !== null
    } catch {
      return false
    }
  }

  private async applyHealthFilter(page: Page): Promise<void> {
    try {
      // Look for category dropdown or search
      const categorySelect = await page.$('select[name*="category"], #category')
      if (categorySelect) {
        await categorySelect.selectOption({ label: 'Health' }).catch(() => {})
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
        return
      }

      // Try search input
      const searchInput = await page.$(
        'input[type="search"], input[placeholder*="Search"], input[name*="keyword"]'
      )
      if (searchInput) {
        await searchInput.fill('health')
        await page.keyboard.press('Enter')
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
      }
    } catch {
      // Continue without filter
    }
  }

  private async parseResultsPage(page: Page): Promise<TenderResult[]> {
    const results: TenderResult[] = []

    // Try various Blazor result selectors
    const selectors = [
      '.tender-item',
      '.tender-row',
      'table tbody tr',
      '.mud-table-row',
      '[data-tender]',
      '.search-result',
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
        const titleEl = await item.$('.tender-title, h3, h4, td:nth-child(2)')
        if (titleEl) {
          title = (await titleEl.textContent()) || ''
        }
      }

      if (!title?.trim() || title.length < 10) return null

      // Extract reference
      let reference = ''
      const refEl = await item.$('.tender-number, .reference, td:first-child')
      if (refEl) {
        reference = (await refEl.textContent())?.trim() || ''
      }
      if (!reference && link) {
        const match = link.match(/tender\/(\d+)/)
        if (match) reference = `QLD${match[1]}`
      }
      if (!reference) {
        reference = this.generateReference('QLD')
      }

      // Extract agency
      const agencyEl = await item.$('.agency, td:nth-child(3)')
      const agency = agencyEl ? (await agencyEl.textContent())?.trim() : 'Queensland Government'

      // Extract close date
      const dateEl = await item.$('.close-date, td:nth-child(4)')
      const closeDate = dateEl ? this.parseAustralianDate(await dateEl.textContent()) : null

      return {
        tender_reference: reference,
        issuing_body: agency || 'Queensland Government',
        title: title.trim(),
        description: null,
        region: 'Queensland',
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
