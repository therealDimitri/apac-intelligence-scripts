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
      // Navigate to Contract Notices search (awarded contracts from past 12 months)
      // This provides more data for testing than open ATMs which may have few results
      console.log(`[${this.name}] Navigating to Contract Notices search`)
      await page.goto(`${this.config.baseUrl}/Cn/Search`, {
        waitUntil: 'networkidle',
        timeout: this.config.timeout,
      })

      await this.humanDelay(page, 2000, 3000)

      // Wait for the search page to load
      await this.humanDelay(page, 2000, 3000)

      try {
        await page.waitForSelector('h1:has-text("Contract Notices"), form', { timeout: 10000 })
        console.log(`[${this.name}] Contract Notices search page loaded`)
      } catch {
        console.log(`[${this.name}] Continuing without specific page markers`)
      }

      await this.takeDebugScreenshot(page, 'cn-search-form')

      // Search without keywords first to get ALL recent contract notices
      // We'll filter for healthcare keywords locally after getting results
      console.log(`[${this.name}] Searching for all recent Contract Notices`)

      await this.humanDelay(page, 500, 1000)

      // Click the search button (blue magnifying glass)
      const searchButton = await page.locator('button.btn-primary, button[type="submit"]').first()
      try {
        await searchButton.click()
        console.log(`[${this.name}] Clicked search button`)
        await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {})
      } catch {
        console.log(`[${this.name}] Search button click failed, pressing Enter`)
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

    // Pattern 2: AusTender results list
    // The page shows "Showing 1-15 of X records" - find the actual result container
    // Debug: Dump page structure to understand layout
    const pageStructure = await page.evaluate(() => {
      // Find elements containing CN links
      const cnLinks = document.querySelectorAll('a[href*="/Atm/Show/"], a[href*="/Cn/Show/"]')
      if (cnLinks.length === 0) return { structure: 'No CN links found' }

      // Get the common parent of the first CN link
      const firstLink = cnLinks[0]
      let parent = firstLink.parentElement
      const ancestry: string[] = []
      for (let i = 0; i < 10 && parent; i++) {
        ancestry.push(`${parent.tagName}.${parent.className}`)
        parent = parent.parentElement
      }

      return {
        linkCount: cnLinks.length,
        ancestry: ancestry.join(' > '),
        firstLinkHTML: firstLink.parentElement?.outerHTML?.substring(0, 300) || 'N/A'
      }
    })
    console.log(`[${this.name}] Page structure: ${JSON.stringify(pageStructure, null, 2)}`)

    // Debug: Dump first tender box content
    const debugContent = await page.evaluate(() => {
      const firstBox = document.querySelector('[class*="listInner"]')
      if (!firstBox) return 'No listInner found'
      return firstBox.innerHTML.substring(0, 1500)
    })
    console.log(`[${this.name}] First tender box HTML:\n${debugContent}`)

    // Find CN links and extract tender info from their container
    const tenderData = await page.evaluate(() => {
      const results: Array<{
        reference: string
        url: string
        title: string
        agency: string
        closeDate: string | null
        debug?: string
      }> = []

      const seenCNs = new Set<string>()
      const cnLinks = document.querySelectorAll('a[href*="/Atm/Show/"], a[href*="/Cn/Show/"]')

      for (const link of cnLinks) {
        const href = link.getAttribute('href')
        if (!href) continue

        const cnMatch = href.match(/\/(?:Atm|Cn)\/Show\/([a-f0-9-]+|\d+)/i)
        if (!cnMatch) continue

        // Use just the CN number for dedup (first 8 chars of GUID or the numeric ID)
        const cnId = cnMatch[1].length > 10 ? cnMatch[1].substring(0, 8) : cnMatch[1]
        if (seenCNs.has(cnId)) continue
        seenCNs.add(cnId)

        // Get CN text from link itself
        const cnText = link.textContent?.trim() || ''

        // Navigate up to find the row container (class contains "listInner" or is .row parent)
        let container = link.parentElement
        for (let i = 0; i < 10 && container; i++) {
          const classes = container.className || ''
          // Look for the container with both left (agency) and right (details) columns
          if (classes.includes('listInner') || (classes.includes('row') && container.querySelector('.col-sm-4'))) {
            break
          }
          container = container.parentElement
        }

        if (!container) {
          // Fallback: use grandparent if no suitable container
          container = link.parentElement?.parentElement?.parentElement || link.parentElement
        }

        // Get all text from container
        const allText = container?.textContent || ''

        // Extract agency - look in the left column
        let agency = 'Australian Government'
        const leftCol = container?.querySelector('.col-sm-4')
        if (leftCol) {
          const agencyText = leftCol.textContent?.trim() || ''
          // Agency is usually the first line
          const firstLine = agencyText.split('\n')[0].trim()
          if (firstLine && firstLine.length > 2 && firstLine.length < 100) {
            agency = firstLine
          }
        }

        // Extract title by looking at the category line
        // Pattern: "Category: Some Category Title"
        let title = ''

        // Method 1: Look for Description or Category text pattern
        // Contract Notices show "Description:" field, ATMs show "Category:"
        const descMatch = allText.match(/Description:\s*([^\n]+)/i)
        if (descMatch) {
          const desc = descMatch[1].trim()
          if (desc.length > 5 && desc.length < 200) {
            title = desc
          }
        }

        if (!title) {
          const categoryMatch = allText.match(/Category:\s*([^\n]+)/i)
          if (categoryMatch) {
            const category = categoryMatch[1].trim()
            if (category.length > 5 && category.length < 150) {
              title = category
            }
          }
        }

        // Method 2: Look for list-desc content excluding metadata
        if (!title) {
          const listDesc = container?.querySelector('.list-desc')
          if (listDesc) {
            const descText = listDesc.textContent || ''
            // Find the first substantial line that's not CN or metadata
            const lines = descText.split('\n').map(l => l.trim()).filter(l => l.length > 10)
            for (const line of lines) {
              if (
                !line.startsWith('CN') &&
                !line.includes('Close Date') &&
                !line.includes('Publish Date') &&
                !line.includes('Category:') &&
                !line.includes('Full Details') &&
                !line.includes('forms mode') &&
                !line.includes('Supplier')
              ) {
                title = line.substring(0, 150)
                break
              }
            }
          }
        }

        // Method 3: Just use agency + CN as last resort
        if (!title) {
          title = `${agency} Tender ${cnText}`
        }

        // Extract close date
        let closeDate: string | null = null
        const dateMatch = allText.match(/Close\s*Date:\s*(\d{1,2}[\/\-]\w{3}[\/\-]\d{4}|\d{1,2}\s+\w+\s+\d{4})/i)
        if (dateMatch) {
          closeDate = dateMatch[1]
        }

        results.push({
          reference: cnText || `CN${cnId}`,
          url: href,
          title,
          agency,
          closeDate,
        })
      }

      return results
    })

    console.log(`[${this.name}] Extracted ${tenderData.length} tenders from page`)

    for (const item of tenderData) {
      results.push({
        tender_reference: item.reference,
        issuing_body: item.agency,
        title: item.title,
        description: null,
        region: 'Australia',
        close_date: this.parseAustralianDate(item.closeDate),
        estimated_value: null,
        source_url: item.url.startsWith('http') ? item.url : `${this.config.baseUrl}${item.url}`,
        portal: this.portalKey,
      })
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

  private async parseContainerRow(row: ElementHandle): Promise<TenderResult | null> {
    try {
      // Find CN link in this row
      const cnLink = await row.$('a[href*="/Atm/Show/"], a[href*="/Cn/Show/"]')
      if (!cnLink) return null

      const href = await cnLink.getAttribute('href')
      if (!href) return null

      const cnMatch = href.match(/\/Cn\/Show\/(\d+)/)
      if (!cnMatch) return null

      const reference = `CN${cnMatch[1]}`

      // Extract all text from the row to find the title
      const rowData = await row.evaluate((el: Element) => {
        const text = el.textContent || ''
        const innerHTML = el.innerHTML || ''

        // Find the title - it's usually the longest text segment that's not metadata
        // Split by common delimiters and find substantial text
        const segments = text.split(/[\n\r\t|]+/).map(s => s.trim()).filter(s => s.length > 10)

        // Filter out segments that look like metadata
        const titleCandidates = segments.filter(
          s =>
            !s.startsWith('CN') &&
            !s.includes('Close Date:') &&
            !s.includes('Category:') &&
            !s.includes('Full Details') &&
            !s.includes('Supplier Name:') &&
            !s.includes('Publish Date:') &&
            !/^\d{1,2}[\/\-]/.test(s) // Not a date
        )

        // The title is usually the first substantial text segment
        const title = titleCandidates[0] || ''

        // Extract agency - usually in bold or at the start
        let agency = ''
        const strongMatch = innerHTML.match(/<strong[^>]*>([^<]+)<\/strong>/i)
        if (strongMatch) {
          agency = strongMatch[1].trim()
        }

        // Extract close date
        const dateMatch = text.match(/Close\s*Date:\s*(\d{1,2}[\/\-]\w{3,}[\/\-]?\d{2,4}|\d{1,2}\s+\w+\s+\d{4})/i)
        const closeDate = dateMatch ? dateMatch[1] : null

        return { title, agency, closeDate }
      })

      if (!rowData.title || rowData.title.length < 10) return null

      return {
        tender_reference: reference,
        issuing_body: rowData.agency || 'Australian Government',
        title: rowData.title,
        description: null,
        region: 'Australia',
        close_date: this.parseAustralianDate(rowData.closeDate),
        estimated_value: null,
        source_url: `${this.config.baseUrl}${href}`,
        portal: this.portalKey,
      }
    } catch {
      return null
    }
  }
}
