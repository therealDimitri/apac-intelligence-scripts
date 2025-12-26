/**
 * Invoice Data Scraper
 * Extracts invoice data from invoice.alteraapacai.dev and syncs to Supabase
 *
 * Usage: node scripts/scrape-invoices.mjs
 */

import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function scrapeInvoices() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  try {
    console.log('[Invoice Scraper] Navigating to invoice system...')

    // Navigate to the invoice system
    await page.goto('https://invoice.alteraapacai.dev/')

    // Wait for the page to load
    await page.waitForLoadState('networkidle')

    // Check if login is required
    const loginRequired = await page.locator('input[type="password"]').count() > 0

    if (loginRequired) {
      console.log('[Invoice Scraper] Login required - authenticating...')

      // Fill in credentials (store these in .env.local)
      await page.fill('input[type="email"]', process.env.INVOICE_EMAIL)
      await page.fill('input[type="password"]', process.env.INVOICE_PASSWORD)
      await page.click('button[type="submit"]')

      await page.waitForLoadState('networkidle')
    }

    console.log('[Invoice Scraper] Extracting invoice data...')

    // Extract invoice data from the page
    // This will need to be customized based on actual page structure
    const invoices = await page.evaluate(() => {
      const invoiceRows = document.querySelectorAll('.invoice-row, tr[data-invoice], .invoice-item')

      return Array.from(invoiceRows).map(row => {
        return {
          invoice_id: row.querySelector('[data-invoice-id], .invoice-number')?.textContent?.trim(),
          client_name: row.querySelector('[data-client], .client-name')?.textContent?.trim(),
          amount: parseFloat(row.querySelector('[data-amount], .amount')?.textContent?.replace(/[^0-9.]/g, '')),
          status: row.querySelector('[data-status], .status')?.textContent?.trim(),
          issue_date: row.querySelector('[data-date], .issue-date')?.textContent?.trim(),
          due_date: row.querySelector('[data-due], .due-date')?.textContent?.trim(),
        }
      }).filter(inv => inv.invoice_id) // Filter out invalid entries
    })

    console.log(`[Invoice Scraper] Found ${invoices.length} invoices`)

    if (invoices.length === 0) {
      console.warn('[Invoice Scraper] No invoices found - check selectors')

      // Save page screenshot for debugging
      await page.screenshot({ path: 'invoice-page-debug.png', fullPage: true })
      console.log('[Invoice Scraper] Saved debug screenshot to invoice-page-debug.png')

      // Save page HTML for inspection
      const html = await page.content()
      await require('fs').promises.writeFile('invoice-page-debug.html', html)
      console.log('[Invoice Scraper] Saved page HTML to invoice-page-debug.html')
    }

    // Sync to Supabase
    if (invoices.length > 0) {
      console.log('[Invoice Scraper] Syncing to Supabase...')

      const { data, error } = await supabase
        .from('invoices')
        .upsert(invoices.map(inv => ({
          ...inv,
          synced_at: new Date().toISOString(),
          created_at: new Date().toISOString()
        })), {
          onConflict: 'invoice_id',
          ignoreDuplicates: false
        })

      if (error) {
        console.error('[Invoice Scraper] Supabase error:', error)
        throw error
      }

      console.log(`[Invoice Scraper] ✓ Successfully synced ${invoices.length} invoices to Supabase`)
    }

  } catch (error) {
    console.error('[Invoice Scraper] Error:', error)
    throw error
  } finally {
    await browser.close()
  }
}

// Run the scraper
scrapeInvoices()
  .then(() => {
    console.log('[Invoice Scraper] Completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('[Invoice Scraper] Failed:', error)
    process.exit(1)
  })
