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
      // Navigate to Contract Notices search and submit form
      console.log(`[${this.name}] Navigating to Contract Notices search`)
      await page.goto(`${this.config.baseUrl}/Cn/Search`, {
        waitUntil: 'networkidle',
        timeout: this.config.timeout,
      })

      await this.humanDelay(page, 2000, 3000)
      await this.takeDebugScreenshot(page, 'cn-search')

      // Set date range to past 12 months for comprehensive results
      // Using Advanced Search section with Date Range fields
      console.log(`[${this.name}] Setting date range to past 12 months via Advanced Search...`)

      // Calculate date range (12 months ago to today)
      const today = new Date()
      const twelveMonthsAgo = new Date()
      twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1)

      // Format dates as DD-MMM-YYYY (AusTender format, e.g., "03-Feb-2025")
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      const formatDate = (d: Date) => {
        const day = d.getDate().toString().padStart(2, '0')
        const month = months[d.getMonth()]
        const year = d.getFullYear()
        return `${day}-${month}-${year}`
      }

      const fromDate = formatDate(twelveMonthsAgo)
      const toDate = formatDate(today)

      console.log(`[${this.name}] Date range: ${fromDate} to ${toDate}`)

      // Fill in the "Date Range" From field in Advanced Search
      // The field shows placeholder "DD-MMM-YYYY" and has label "From:"
      const dateRangeFilled = await page.evaluate((dates: { from: string; to: string }) => {
        // Find all inputs with date picker behavior
        const allInputs = Array.from(document.querySelectorAll('input[type="text"]'))
        let fromFilled = false
        let toFilled = false

        for (const input of allInputs) {
          const el = input as HTMLInputElement
          const placeholder = el.placeholder || ''
          const parentText = el.parentElement?.textContent || ''

          // Look for the From date field
          if (!fromFilled && (placeholder.includes('DD-MMM-YYYY') || parentText.toLowerCase().includes('from'))) {
            // Check if this is the first date input (From)
            const previousText = el.parentElement?.previousElementSibling?.textContent || ''
            if (previousText.toLowerCase().includes('from') || parentText.toLowerCase().startsWith('from')) {
              el.value = dates.from
              el.dispatchEvent(new Event('input', { bubbles: true }))
              el.dispatchEvent(new Event('change', { bubbles: true }))
              fromFilled = true
              console.log('Set From date:', dates.from)
              continue
            }
          }

          // Look for the To date field
          if (fromFilled && !toFilled && (placeholder.includes('DD-MMM-YYYY') || parentText.toLowerCase().includes('to'))) {
            el.value = dates.to
            el.dispatchEvent(new Event('input', { bubbles: true }))
            el.dispatchEvent(new Event('change', { bubbles: true }))
            toFilled = true
            console.log('Set To date:', dates.to)
          }

          if (fromFilled && toFilled) break
        }

        return { fromFilled, toFilled }
      }, { from: fromDate, to: toDate })

      console.log(`[${this.name}] Date fields filled: From=${dateRangeFilled.fromFilled}, To=${dateRangeFilled.toFilled}`)

      // Alternative: Try clicking on input fields and typing
      if (!dateRangeFilled.fromFilled) {
        // Try using Playwright locators to find the date range inputs
        const fromInputs = page.locator('input[placeholder*="DD-MMM-YYYY"]')
        const count = await fromInputs.count()
        console.log(`[${this.name}] Found ${count} date inputs with DD-MMM-YYYY placeholder`)

        if (count >= 2) {
          // First one is From, second is To
          await fromInputs.nth(0).click()
          await fromInputs.nth(0).fill(fromDate)
          console.log(`[${this.name}] Filled From date via locator`)

          await fromInputs.nth(1).click()
          await fromInputs.nth(1).fill(toDate)
          console.log(`[${this.name}] Filled To date via locator`)
        }
      }

      await this.humanDelay(page, 500, 1000)
      await this.takeDebugScreenshot(page, 'dates-filled')

      // Click the search button (blue magnifying glass) in Advanced Search
      console.log(`[${this.name}] Clicking search button...`)

      // Scroll down to make sure search button is visible
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight)
      })
      await this.humanDelay(page, 500, 1000)

      // The search button is a blue/primary button at the bottom of the Advanced Search form
      // Try multiple approaches to click it
      let clicked = false

      // Method 1: Use evaluate to find and click the submit button
      clicked = await page.evaluate(() => {
        // Look for the search form's submit button - it's typically a button with search icon
        const buttons = document.querySelectorAll('button[type="submit"], input[type="submit"], .btn-primary, button.btn')
        for (const btn of buttons) {
          const el = btn as HTMLElement
          const rect = el.getBoundingClientRect()
          // Check if it's visible and clickable (has reasonable size and position)
          if (rect.width > 20 && rect.height > 20 && rect.top > 0) {
            // Check if it looks like a search button (has magnifying glass icon or "search" text)
            const hasSearchIcon = el.querySelector('.fa-search, .glyphicon-search, [class*="search"]')
            const isSubmit = el.getAttribute('type') === 'submit'
            const isPrimary = el.classList.contains('btn-primary')
            if (hasSearchIcon || isSubmit || isPrimary) {
              el.scrollIntoView({ block: 'center' })
              el.click()
              console.log('Clicked search button:', el.outerHTML.substring(0, 100))
              return true
            }
          }
        }
        // Fallback: Submit the form directly
        const form = document.querySelector('form')
        if (form) {
          const submitBtn = form.querySelector('[type="submit"]') as HTMLElement
          if (submitBtn) {
            submitBtn.click()
            console.log('Clicked form submit button')
            return true
          }
          // Last resort: submit the form
          form.submit()
          console.log('Submitted form directly')
          return true
        }
        return false
      })

      if (!clicked) {
        // Method 2: Use Playwright locator
        const searchBtn = page.locator('button[type="submit"], input[type="submit"]').first()
        if (await searchBtn.isVisible().catch(() => false)) {
          await searchBtn.scrollIntoViewIfNeeded()
          await searchBtn.click({ timeout: 5000 })
          console.log(`[${this.name}] Clicked search button via locator`)
          clicked = true
        }
      }

      console.log(`[${this.name}] Search button clicked: ${clicked}`)

      // Wait for results page to load
      await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {})
      await this.humanDelay(page, 3000, 5000)
      await this.takeDebugScreenshot(page, 'cn-results')

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
          // AusTender pagination uses ">" for next and ">>" for last page
          // The structure is: "1 2 3 4 5 ... 1168 >"
          const nextLocator = page.locator(
            '.pagination a:has-text(">"):not(:has-text(">>")), a[rel="next"], .page-link:has-text("Next"), a:has-text("Next")'
          ).first()

          // Also try to find via evaluate
          let hasNextPage = await nextLocator.isVisible().catch(() => false)

          if (!hasNextPage) {
            // Fallback: look for next page link using evaluate
            hasNextPage = await page.evaluate(() => {
              // Find pagination container
              const pagination = document.querySelector('.pagination, .pager, [class*="pagination"]')
              if (!pagination) return false

              // Look for > link that isn't >>
              const links = pagination.querySelectorAll('a')
              for (const link of links) {
                const text = link.textContent?.trim() || ''
                if (text === '>' || text === '›' || text === 'Next') {
                  // Check if it's not disabled
                  const parent = link.parentElement
                  if (!parent?.classList.contains('disabled') && !link.classList.contains('disabled')) {
                    return true
                  }
                }
              }
              return false
            })
          }

          if (!hasNextPage) {
            console.log(`[${this.name}] No visible next button, done paginating`)
            break
          }

          // Click the next page link
          const clicked = await page.evaluate(() => {
            const pagination = document.querySelector('.pagination, .pager, [class*="pagination"]')
            if (!pagination) return false

            const links = pagination.querySelectorAll('a')
            for (const link of links) {
              const text = link.textContent?.trim() || ''
              if (text === '>' || text === '›' || text === 'Next') {
                const parent = link.parentElement
                if (!parent?.classList.contains('disabled') && !link.classList.contains('disabled')) {
                  (link as HTMLElement).click()
                  console.log('Clicked next page:', text)
                  return true
                }
              }
            }
            return false
          })

          if (!clicked) {
            // Try Playwright click as fallback
            await nextLocator.click({ timeout: 5000 })
          }

          await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
          await this.humanDelay(page)
          pageNum++
          console.log(`[${this.name}] Moved to page ${pageNum + 1}`)
        } catch (navError) {
          console.log(`[${this.name}] Pagination stopped: ${navError instanceof Error ? navError.message : 'unknown'}`)
          break
        }
      }

      // Debug: Show first few entries
      console.log(`[${this.name}] Sample entries found:`)
      results.slice(0, 5).forEach((t, i) => {
        console.log(`  ${i + 1}. ${t.tender_reference}: ${t.issuing_body.substring(0, 50)}`)
      })

      // For Contract Notices, filter by healthcare-related agencies instead of title
      // Common healthcare agencies include: Health, Hospital, Medical, NDIS, Aged Care
      const healthcareAgencyPatterns = [
        /health/i,
        /hospital/i,
        /medical/i,
        /ndis/i,
        /aged care/i,
        /disability/i,
        /pharmaceutical/i,
        /therapeutic/i,
        /nursing/i,
        /ambulance/i,
      ]

      const healthcareTenders = results.filter(t => {
        // Check if issuing body or title contains healthcare keywords
        const text = `${t.issuing_body} ${t.title}`.toLowerCase()
        return healthcareAgencyPatterns.some(pattern => pattern.test(text)) ||
               this.isHealthcareRelated(t.title, t.description)
      })

      console.log(`[${this.name}] Total: ${results.length}, Healthcare-related: ${healthcareTenders.length}`)

      // Return all results for testing (healthcare filtering may be too strict for Contract Notices)
      // TODO: Refine healthcare filtering based on actual data
      if (healthcareTenders.length === 0 && results.length > 0) {
        console.log(`[${this.name}] No healthcare matches, returning all ${results.length} results for testing`)
        return results
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

        // Extract agency from the list-desc structure
        // Contract Notices: <div class="list-desc"><span>Agency:</span><div class="list-desc-inner">Agency Name</div></div>
        let agency = 'Australian Government'

        // Method 1: Look for Agency: in text and extract the value after it
        const agencyMatch = allText.match(/Agency:\s*([^\n]+)/i)
        if (agencyMatch && agencyMatch[1]) {
          const agencyName = agencyMatch[1].trim()
          if (agencyName.length > 2 && agencyName.length < 150 && !agencyName.includes('Publish Date')) {
            agency = agencyName
          }
        }

        // Method 2: Look for .list-desc-inner after Agency label
        if (agency === 'Australian Government' && container) {
          const listDescs = container.querySelectorAll('.list-desc')
          for (const desc of listDescs) {
            const label = desc.querySelector('span')?.textContent?.trim()
            if (label === 'Agency:') {
              const inner = desc.querySelector('.list-desc-inner')
              if (inner && inner.textContent) {
                const agencyName = inner.textContent.trim()
                if (agencyName.length > 2 && agencyName.length < 150) {
                  agency = agencyName
                }
              }
              break
            }
          }
        }

        // Method 3: Fallback - try .col-sm-4 for older layouts
        if (agency === 'Australian Government') {
          const leftCol = container?.querySelector('.col-sm-4')
          if (leftCol) {
            const agencyText = leftCol.textContent?.trim() || ''
            const firstLine = agencyText.split('\n')[0].trim()
            if (firstLine && firstLine.length > 2 && firstLine.length < 100) {
              agency = firstLine
            }
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
