/**
 * Base Tender Scraper
 * Abstract class that all portal scrapers extend
 */

import type { Page } from 'playwright'
import type { TenderResult, ScraperConfig } from '../types'
import { isHealthcareRelated } from '../utils/healthcare-filter'
import * as fs from 'fs'
import * as path from 'path'

export abstract class BaseTenderScraper {
  abstract name: string
  abstract portalKey: string
  abstract config: ScraperConfig

  /**
   * Main scraping method - implemented by each portal scraper
   */
  abstract scrape(page: Page): Promise<TenderResult[]>

  /**
   * Parse Australian date formats to ISO
   * Handles: DD/MM/YYYY, DD Month YYYY, YYYY-MM-DD
   */
  protected parseAustralianDate(dateStr: string | undefined | null): string | null {
    if (!dateStr) return null

    const cleaned = dateStr.trim()
    if (!cleaned) return null

    // Try ISO format first
    if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) {
      return cleaned.split('T')[0]
    }

    // Try DD/MM/YYYY format
    const ddmmyyyy = cleaned.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
    if (ddmmyyyy) {
      const [, day, month, year] = ddmmyyyy
      const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0]
      }
    }

    // Try DD Month YYYY format
    const dmyMatch = cleaned.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/)
    if (dmyMatch) {
      try {
        const date = new Date(`${dmyMatch[2]} ${dmyMatch[1]}, ${dmyMatch[3]}`)
        if (!isNaN(date.getTime())) {
          return date.toISOString().split('T')[0]
        }
      } catch {
        // Continue
      }
    }

    // Try native Date parsing as fallback
    try {
      const date = new Date(cleaned)
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0]
      }
    } catch {
      // Continue
    }

    return null
  }

  /**
   * Check if tender is healthcare-related
   */
  protected isHealthcareRelated(title: string, description?: string | null): boolean {
    return isHealthcareRelated(title, description)
  }

  /**
   * Wait for page content with retry
   */
  protected async waitForContent(
    page: Page,
    selector: string,
    options: { timeout?: number; retries?: number } = {}
  ): Promise<boolean> {
    const { timeout = 15000, retries = 2 } = options

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        await page.waitForSelector(selector, { timeout })
        return true
      } catch (error) {
        if (attempt < retries) {
          console.log(`[${this.name}] Retry ${attempt + 1}/${retries} waiting for ${selector}`)
          await page.waitForTimeout(2000)
        }
      }
    }
    return false
  }

  /**
   * Take debug screenshot on error
   */
  protected async takeDebugScreenshot(page: Page, name: string): Promise<void> {
    const screenshotDir = path.join(__dirname, '..', 'screenshots')
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true })
    }

    const filename = `${this.portalKey}-${name}-${Date.now()}.png`
    const filepath = path.join(screenshotDir, filename)

    try {
      await page.screenshot({ path: filepath, fullPage: true })
      console.log(`[${this.name}] Debug screenshot saved: ${filename}`)
    } catch (error) {
      console.error(`[${this.name}] Failed to take screenshot:`, error)
    }
  }

  /**
   * Add random delay to appear more human
   */
  protected async humanDelay(page: Page, minMs = 1000, maxMs = 3000): Promise<void> {
    const delay = minMs + Math.random() * (maxMs - minMs)
    await page.waitForTimeout(delay)
  }

  /**
   * Scroll page to load lazy content
   */
  protected async scrollToLoadContent(page: Page): Promise<void> {
    await page.evaluate(async () => {
      const scrollHeight = document.body.scrollHeight
      const viewportHeight = window.innerHeight

      for (let i = 0; i < scrollHeight; i += viewportHeight) {
        window.scrollTo(0, i)
        await new Promise(r => setTimeout(r, 200))
      }

      // Scroll back to top
      window.scrollTo(0, 0)
    })
  }

  /**
   * Generate unique reference if none found
   */
  protected generateReference(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }
}
