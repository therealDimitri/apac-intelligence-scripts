/**
 * AusTender ATM Scraper
 * Federal government tender portal: tenders.gov.au
 *
 * Scrapes the Current ATM List at /atm — all currently open Approaches to Market.
 * No search form needed; the list page shows all open ATMs with pagination.
 */

import type { Page } from 'playwright'
import { BaseTenderScraper } from './base-scraper'
import type { TenderResult, ScraperConfig } from '../types'
import { PORTAL_CONFIGS } from '../types'

export class AusTenderScraper extends BaseTenderScraper {
  name = 'AusTender'
  portalKey = 'austender'
  config: ScraperConfig = PORTAL_CONFIGS.austender

  async scrape(page: Page): Promise<TenderResult[]> {
    const results: TenderResult[] = []

    console.log(`[${this.name}] Starting ATM scrape...`)

    try {
      // Navigate to Current ATM List (no search form needed)
      console.log(`[${this.name}] Navigating to Current ATM List`)
      await page.goto(`${this.config.baseUrl}/atm`, {
        waitUntil: 'networkidle',
        timeout: this.config.timeout,
      })

      await this.humanDelay(page, 2000, 3000)
      await this.takeDebugScreenshot(page, 'atm-list')

      // Check if page loaded successfully
      const pageTitle = await page.title()
      console.log(`[${this.name}] Page title: ${pageTitle}`)

      const hasError = await page.locator('text=Cannot Be Found').count()
      if (hasError > 0) {
        throw new Error('ATM list page returned 404 — site may have restructured')
      }

      // Parse results with pagination
      let pageNum = 0
      const maxPages = this.config.maxPages

      while (pageNum < maxPages) {
        console.log(`[${this.name}] Parsing page ${pageNum + 1}...`)

        const pageResults = await this.parseResultsPage(page)
        results.push(...pageResults)

        console.log(`[${this.name}] Found ${pageResults.length} tenders on page ${pageNum + 1}`)

        if (pageResults.length === 0) break

        // Check for next page
        const hasNextPage = await this.clickNextPage(page)
        if (!hasNextPage) {
          console.log(`[${this.name}] No more pages`)
          break
        }

        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
        await this.humanDelay(page)
        pageNum++
        console.log(`[${this.name}] Moved to page ${pageNum + 1}`)
      }

      // Log sample
      console.log(`[${this.name}] Sample entries:`)
      results.slice(0, 5).forEach((t, i) => {
        console.log(`  ${i + 1}. ${t.tender_reference}: ${t.title.substring(0, 80)}`)
      })

      // Filter by healthcare keywords
      const healthcareTenders = results.filter(t => {
        const text = `${t.issuing_body} ${t.title} ${t.description || ''}`.toLowerCase()
        return this.isHealthcareRelated(t.title, t.description) ||
          /health|hospital|medical|ndis|aged care|disability|pharmaceutical|therapeutic|nursing|ambulance/i.test(text)
      })

      console.log(`[${this.name}] Total: ${results.length}, Healthcare-related: ${healthcareTenders.length}`)

      // Return healthcare matches, or all results if none match (for testing)
      if (healthcareTenders.length === 0 && results.length > 0) {
        console.log(`[${this.name}] No healthcare matches, returning all ${results.length} results`)
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
    const tenderData = await page.evaluate(() => {
      const results: Array<{
        reference: string
        url: string
        title: string
        agency: string
        closeDate: string | null
        description: string | null
      }> = []

      const seenRefs = new Set<string>()

      // ATM links use /Atm/Show/{guid}
      const atmLinks = document.querySelectorAll('a[href*="/Atm/Show/"]')

      for (const link of atmLinks) {
        const href = link.getAttribute('href')
        if (!href) continue

        const atmMatch = href.match(/\/Atm\/Show\/([a-f0-9-]+)/i)
        if (!atmMatch) continue

        const atmGuid = atmMatch[1]
        const shortId = atmGuid.substring(0, 8)
        if (seenRefs.has(shortId)) continue
        seenRefs.add(shortId)

        const linkText = link.textContent?.trim() || ''

        // Navigate up to find the container row
        let container = link.parentElement
        for (let i = 0; i < 10 && container; i++) {
          const classes = container.className || ''
          if (classes.includes('listInner') || (classes.includes('row') && container.querySelector('.col-sm-4'))) {
            break
          }
          container = container.parentElement
        }

        if (!container) {
          container = link.parentElement?.parentElement?.parentElement || link.parentElement
        }

        const allText = container?.textContent || ''

        // Extract agency from structured .list-desc elements
        let agency = 'Australian Government'
        if (container) {
          const listDescs = container.querySelectorAll('.list-desc')
          for (const desc of listDescs) {
            const label = desc.querySelector('span')?.textContent?.trim()
            if (label === 'Agency:') {
              const inner = desc.querySelector('.list-desc-inner')
              if (inner?.textContent) {
                const agencyName = inner.textContent.trim()
                if (agencyName.length > 2 && agencyName.length < 150) {
                  agency = agencyName
                }
              }
              break
            }
          }
        }

        // Fallback agency extraction from text
        if (agency === 'Australian Government') {
          const agencyMatch = allText.match(/Agency:\s*([^\n]+)/i)
          if (agencyMatch?.[1]) {
            const name = agencyMatch[1].trim()
            if (name.length > 2 && name.length < 150 && !name.includes('Publish Date')) {
              agency = name
            }
          }
        }

        // Extract title from Description or Category fields
        let title = ''
        const descMatch = allText.match(/Description:\s*([^\n]+)/i)
        if (descMatch?.[1] && descMatch[1].trim().length > 5) {
          title = descMatch[1].trim().substring(0, 200)
        }
        if (!title) {
          const catMatch = allText.match(/Category:\s*([^\n]+)/i)
          if (catMatch?.[1] && catMatch[1].trim().length > 5) {
            title = catMatch[1].trim().substring(0, 150)
          }
        }
        if (!title) {
          title = linkText || `${agency} ATM ${shortId}`
        }

        // Extract close date
        let closeDate: string | null = null
        const dateMatch = allText.match(/Close\s*Date[^:]*:\s*(\d{1,2}[\/\-]\w{3}[\/\-]\d{4}|\d{1,2}\s+\w+\s+\d{4})/i)
        if (dateMatch) {
          closeDate = dateMatch[1]
        }

        results.push({
          reference: linkText || `ATM-${shortId}`,
          url: href,
          title,
          agency,
          closeDate,
          description: null,
        })
      }

      return results
    })

    console.log(`[${this.name}] Extracted ${tenderData.length} tenders from page`)

    return tenderData.map(item => ({
      tender_reference: item.reference,
      issuing_body: item.agency,
      title: item.title,
      description: item.description,
      region: 'Australia',
      close_date: this.parseAustralianDate(item.closeDate),
      estimated_value: null,
      source_url: item.url.startsWith('http') ? item.url : `${this.config.baseUrl}${item.url}`,
      portal: this.portalKey,
    }))
  }

  private async clickNextPage(page: Page): Promise<boolean> {
    try {
      const hasNext = await page.evaluate(() => {
        const pagination = document.querySelector('.pagination, .pager, [class*="pagination"]')
        if (!pagination) return false

        const links = pagination.querySelectorAll('a')
        for (const link of links) {
          const text = link.textContent?.trim() || ''
          if (text === '>' || text === '›' || text === 'Next') {
            const parent = link.parentElement
            if (!parent?.classList.contains('disabled') && !link.classList.contains('disabled')) {
              ;(link as HTMLElement).click()
              return true
            }
          }
        }
        return false
      })

      return hasNext
    } catch {
      return false
    }
  }
}
