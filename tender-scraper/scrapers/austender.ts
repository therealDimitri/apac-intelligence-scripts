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
        waitUntil: 'networkidle',
        timeout: this.config.timeout,
      })

      await this.humanDelay(page, 2000, 3000)

      // Wait for the search page content to load - look for specific elements
      try {
        await page.waitForSelector('h1:has-text("Contract Notices"), .step-indicator, .wizard-step', { timeout: 10000 })
        console.log(`[${this.name}] Search page loaded`)
      } catch {
        // Page structure might be different, continue anyway
        console.log(`[${this.name}] Continuing without specific page markers`)
      }

      // Take a debug screenshot to see current state
      await this.takeDebugScreenshot(page, 'form-loaded')

      // Find the visible keyword input - AusTender has multiple forms on page
      // The main search form's keyword field should be visible
      const keywordInput = await page.locator('input[name="Keyword"]:visible, input#Keyword:visible').first()

      try {
        await keywordInput.waitFor({ state: 'visible', timeout: 5000 })
        await keywordInput.click()
        await this.humanDelay(page, 300, 500)
        await keywordInput.fill(this.config.searchKeywords.join(' '))
        console.log(`[${this.name}] Filled keyword search: ${this.config.searchKeywords.join(' ')}`)
      } catch {
        console.warn(`[${this.name}] Keyword input not found or not visible, proceeding without keywords`)
        await this.takeDebugScreenshot(page, 'no-keyword-input')
      }

      // Select Current/Open status if radio button exists
      const statusRadio = await page.$('input[name="Status"][value="Current"]:visible')
      if (statusRadio) {
        await statusRadio.check().catch(() => {})
        console.log(`[${this.name}] Selected Current status`)
      }

      await this.humanDelay(page, 500, 1000)

      // Find and click the visible search/submit button
      // AusTender uses a blue button with magnifying glass icon
      const searchButton = await page.locator('button[type="submit"]:visible, .btn-primary:visible').first()

      try {
        await searchButton.waitFor({ state: 'visible', timeout: 5000 })
        await searchButton.click()
        console.log(`[${this.name}] Clicked search button`)
        await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {})
      } catch {
        // Try pressing Enter as fallback
        console.log(`[${this.name}] No visible search button, trying Enter key`)
        await page.keyboard.press('Enter')
        await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {})
      }

      await this.humanDelay(page, 2000, 4000)
      await this.takeDebugScreenshot(page, 'after-search')

      // Parse results from multiple possible structures
      let pageNum = 0
      const maxPages = this.config.maxPages

      while (pageNum < maxPages) {
        console.log(`[${this.name}] Parsing page ${pageNum + 1}...`)

        const pageResults = await this.parseResultsPage(page)
        results.push(...pageResults)

        console.log(`[${this.name}] Found ${pageResults.length} tenders on page ${pageNum + 1}`)

        if (pageResults.length === 0) {
          break
        }

        // Check for next page - only proceed if button exists AND is visible
        try {
          const nextLocator = page.locator(
            '.pagination .next:not(.disabled), a[rel="next"], .page-link:has-text("Next"), a:has-text("Next")'
          ).first()

          const isVisible = await nextLocator.isVisible().catch(() => false)
          if (!isVisible) {
            console.log(`[${this.name}] No visible next button, done paginating`)
            break
          }

          await nextLocator.click({ timeout: 5000 })
          await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
          await this.humanDelay(page)
          pageNum++
        } catch (navError) {
          console.log(`[${this.name}] Pagination stopped: ${navError instanceof Error ? navError.message : 'unknown'}`)
          break
        }
      }

      // Debug: Show first few titles
      console.log(`[${this.name}] Sample titles found:`)
      results.slice(0, 5).forEach((t, i) => {
        console.log(`  ${i + 1}. "${t.title.substring(0, 80)}..."`)
      })

      // Filter for healthcare-related tenders
      const healthcareTenders = results.filter(t => this.isHealthcareRelated(t.title, t.description))
      console.log(`[${this.name}] Total: ${results.length}, Healthcare-related: ${healthcareTenders.length}`)

      // If few healthcare results, also show which ones matched
      if (healthcareTenders.length > 0 && healthcareTenders.length <= 10) {
        console.log(`[${this.name}] Matched tenders:`)
        healthcareTenders.forEach((t, i) => {
          console.log(`  ${i + 1}. ${t.tender_reference}: ${t.title.substring(0, 60)}`)
        })
      }

      return healthcareTenders
    } catch (error) {
      console.error(`[${this.name}] Scrape error:`, error)
      await this.takeDebugScreenshot(page, 'error')
      throw error
    }
  }

  private async parseResultsPage(page: Page): Promise<TenderResult[]> {
    const results: TenderResult[] = []

    // AusTender uses a distinct layout with agency name + details blocks
    // Try multiple selector patterns

    // Pattern 1: Standard table rows
    const tableRows = await page.$$('table tbody tr:not(:empty)')
    if (tableRows.length > 0) {
      console.log(`[${this.name}] Found ${tableRows.length} table rows`)
      for (const row of tableRows) {
        const tender = await this.parseTableRow(row)
        if (tender) results.push(tender)
      }
      if (results.length > 0) return results
    }

    // Pattern 2: Contract Notice list items (AusTender 2024+ layout)
    // Look for links containing "/Cn/Show/" which are individual tender links
    const tenderLinks = await page.$$('a[href*="/Cn/Show/"]')
    console.log(`[${this.name}] Found ${tenderLinks.length} tender links`)

    for (const linkEl of tenderLinks) {
      const tender = await this.parseTenderLink(linkEl, page)
      if (tender) results.push(tender)
    }
    if (results.length > 0) return results

    // Pattern 3: Generic list-based results
    const listItems = await page.$$('.list-unstyled li, .search-result, .result-item, article')
    console.log(`[${this.name}] Found ${listItems.length} list items`)
    for (const item of listItems) {
      const tender = await this.parseListItem(item)
      if (tender) results.push(tender)
    }

    return results
  }

  private async parseTenderLink(linkEl: ElementHandle, page: Page): Promise<TenderResult | null> {
    try {
      const href = await linkEl.getAttribute('href')
      if (!href) return null

      // Extract CN number from URL (e.g., /Cn/Show/12345)
      const cnMatch = href.match(/\/Cn\/Show\/(\d+)/)
      if (!cnMatch) return null // Only process actual CN links

      const reference = `CN${cnMatch[1]}`

      // Get the link text
      const linkText = (await linkEl.textContent())?.trim() || ''

      // Skip "Full Details" links and pure CN number links - those don't have titles
      if (linkText.includes('Full Details') || /^CN\d+$/.test(linkText)) {
        return null // Will be picked up by another link with actual title
      }

      // The title should be substantial text (not just a CN number)
      if (linkText.length < 10) return null

      const title = linkText

      // Try to find agency info and close date from surrounding context
      let agency = 'Australian Government'
      let closeDate: string | null = null

      try {
        // Get the entire row/container text for context
        const containerData = await linkEl.evaluate(el => {
          // Navigate up to find the tender row (typically 5-8 levels up)
          let parent = el.parentElement
          for (let i = 0; i < 8 && parent; i++) {
            const text = parent.textContent || ''
            // Look for a container with tender details
            if (text.includes('Close Date:') || text.includes('Category:')) {
              // Extract agency from strong/bold elements at the start
              const agencyEl = parent.querySelector('strong, b')
              return {
                text: text,
                agency: agencyEl?.textContent || null
              }
            }
            parent = parent.parentElement
          }
          return { text: '', agency: null }
        })

        if (containerData.agency) {
          agency = containerData.agency.trim()
        }

        // Extract close date using various patterns
        const datePatterns = [
          /Close\s*Date:\s*(\d{1,2}[\/\-]\w{3}[\/\-]\d{4})/i,
          /Close\s*Date:\s*(\d{1,2}\s+\w+\s+\d{4})/i,
          /Close\s*Date:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i,
          /Closes?:\s*(\d{1,2}[\/\-]\w{3}[\/\-]\d{4})/i,
        ]
        for (const pattern of datePatterns) {
          const dateMatch = containerData.text.match(pattern)
          if (dateMatch) {
            closeDate = this.parseAustralianDate(dateMatch[1])
            if (closeDate) break
          }
        }
      } catch {
        // Ignore extraction errors
      }

      return {
        tender_reference: reference,
        issuing_body: agency,
        title: title.trim(),
        description: null,
        region: 'Australia',
        close_date: closeDate,
        estimated_value: null,
        source_url: href.startsWith('http') ? href : `${this.config.baseUrl}${href}`,
        portal: this.portalKey,
      }
    } catch {
      return null
    }
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
