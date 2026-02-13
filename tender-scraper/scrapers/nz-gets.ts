/**
 * NZ GETS Scraper
 * New Zealand Government Electronic Tender Service: gets.govt.nz
 *
 * GETS is a traditional server-rendered HTML site with a keyword search form.
 * We search for healthcare terms and parse the results table.
 *
 * Table structure (6 columns):
 *   1. GETS ID   2. Reference   3. Title   4. Type (RFP/RFI/etc)
 *   5. Close date/time          6. Agency
 */

import type { Page } from 'playwright'
import { BaseTenderScraper } from './base-scraper'
import type { TenderResult, ScraperConfig } from '../types'
import { PORTAL_CONFIGS } from '../types'

export class NZGetsScraper extends BaseTenderScraper {
  name = 'NZ GETS'
  portalKey = 'nz-gets'
  config: ScraperConfig = PORTAL_CONFIGS['nz-gets']

  async scrape(page: Page): Promise<TenderResult[]> {
    const allResults: TenderResult[] = []
    const seenIds = new Set<string>()

    console.log(`[${this.name}] Starting scrape...`)

    for (const keyword of this.config.searchKeywords) {
      console.log(`[${this.name}] Searching for: "${keyword}"`)

      try {
        // Navigate to search results (GET form)
        const searchUrl = `${this.config.baseUrl}/ExternalTenderSearching.htm?SearchingText=${encodeURIComponent(keyword)}`
        await page.goto(searchUrl, {
          waitUntil: 'networkidle',
          timeout: this.config.timeout,
        })

        await this.humanDelay(page, 1500, 2500)
        await this.takeDebugScreenshot(page, `search-${keyword}`)

        // Parse results from the table
        const results = await this.parseResultsTable(page)

        for (const tender of results) {
          if (!seenIds.has(tender.tender_reference)) {
            seenIds.add(tender.tender_reference)
            allResults.push(tender)
          }
        }

        console.log(`[${this.name}] "${keyword}": ${results.length} results (${allResults.length} total unique)`)

        // Check for pagination — GETS uses page links
        let pageNum = 1
        while (pageNum < this.config.maxPages) {
          const nextClicked = await this.clickNextPage(page)
          if (!nextClicked) break

          await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
          await this.humanDelay(page, 1000, 2000)
          pageNum++

          const moreResults = await this.parseResultsTable(page)
          for (const tender of moreResults) {
            if (!seenIds.has(tender.tender_reference)) {
              seenIds.add(tender.tender_reference)
              allResults.push(tender)
            }
          }

          console.log(`[${this.name}] "${keyword}" page ${pageNum}: ${moreResults.length} results`)
          if (moreResults.length === 0) break
        }

        // Small delay between keyword searches
        await this.humanDelay(page, 1000, 2000)
      } catch (error) {
        console.error(`[${this.name}] Error searching "${keyword}":`, error instanceof Error ? error.message : error)
        await this.takeDebugScreenshot(page, `error-${keyword}`)
      }
    }

    console.log(`[${this.name}] Total unique tenders: ${allResults.length}`)
    return allResults
  }

  private async parseResultsTable(page: Page): Promise<TenderResult[]> {
    const tenderData = await page.evaluate(() => {
      const results: Array<{
        getsId: string
        reference: string
        title: string
        type: string
        closeDate: string | null
        agency: string
        url: string
      }> = []

      // GETS uses tr.tender rows with alternating blueRow/greyRow classes
      const rows = document.querySelectorAll('tr.tender')

      for (const row of rows) {
        const cells = row.querySelectorAll('td')
        if (cells.length < 6) continue

        // Column 0: GETS ID (links to detail page)
        const idLink = cells[0]?.querySelector('a')
        const getsId = idLink?.textContent?.trim() || ''
        const href = idLink?.getAttribute('href') || ''

        // Column 1: External reference
        const reference = cells[1]?.querySelector('a')?.textContent?.trim() || ''

        // Column 2: Title
        const title = cells[2]?.querySelector('a')?.textContent?.trim() || ''

        // Column 3: Type (RFP, RFI, RFT, etc.)
        const type = cells[3]?.querySelector('abbr')?.getAttribute('title') ||
          cells[3]?.textContent?.trim() || ''

        // Column 4: Close date/time (e.g., "12:00 PM 13 Feb 2026 (Pacific/Auckland UTC+13:00)")
        const closeDateText = cells[4]?.textContent?.trim() || ''
        // Extract just the date portion before the timezone
        const dateMatch = closeDateText.match(/(\d{1,2}:\d{2}\s*[AP]M\s+\d{1,2}\s+\w+\s+\d{4})/)
        const closeDate = dateMatch ? dateMatch[1] : null

        // Column 5: Agency
        const agency = cells[5]?.textContent?.trim() || ''

        if (!getsId || !title) continue

        results.push({
          getsId,
          reference: reference === '[None]' ? getsId : reference,
          title,
          type,
          closeDate,
          agency,
          url: href ? (href.startsWith('http') ? href : `https://www.gets.govt.nz/${href}`) : '',
        })
      }

      return results
    })

    return tenderData.map(item => ({
      tender_reference: `GETS-${item.reference || item.getsId}`,
      issuing_body: item.agency || 'New Zealand Government',
      title: item.title,
      description: item.type ? `Type: ${item.type}` : null,
      region: 'New Zealand',
      close_date: this.parseNZDate(item.closeDate),
      estimated_value: null,
      source_url: item.url || `https://www.gets.govt.nz/ExternalTenderDetails.htm?id=${item.getsId}`,
      portal: this.portalKey,
    }))
  }

  private async clickNextPage(page: Page): Promise<boolean> {
    try {
      // GETS pagination uses "Next" links or page number links
      const nextLink = page.locator('a:has-text("Next"), a:has-text("next"), .pagination a:has-text(">")')
      if (await nextLink.isVisible().catch(() => false)) {
        await nextLink.click({ timeout: 5000 })
        return true
      }
      return false
    } catch {
      return false
    }
  }

  /**
   * Parse NZ date format: "12:00 PM 13 Feb 2026" -> "2026-02-13"
   */
  private parseNZDate(dateStr: string | null): string | null {
    if (!dateStr) return null

    // Try to extract date from "HH:MM AM/PM DD Mon YYYY" format
    const match = dateStr.match(/(\d{1,2})\s+(\w{3})\s+(\d{4})/)
    if (match) {
      const monthMap: Record<string, string> = {
        Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
        Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
      }
      const day = match[1].padStart(2, '0')
      const month = monthMap[match[2]]
      const year = match[3]
      if (month) return `${year}-${month}-${day}`
    }

    // Fallback to base class parser
    return this.parseAustralianDate(dateStr)
  }
}
