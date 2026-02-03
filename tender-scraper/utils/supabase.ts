/**
 * Supabase client for tender scraper
 * Runs in GitHub Actions with service role key
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { TenderResult } from '../types'

let supabase: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (supabase) return supabase

  // Support both GitHub Actions env vars and local .env.local format
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    console.error('Environment check:')
    console.error('  SUPABASE_URL:', process.env.SUPABASE_URL ? 'set' : 'not set')
    console.error('  NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'set' : 'not set')
    console.error('  SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'set' : 'not set')
    throw new Error('Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY environment variables')
  }

  console.log(`[Supabase] Connecting to: ${url.substring(0, 30)}...`)
  supabase = createClient(url, key)
  return supabase
}

export async function storeTenders(tenders: TenderResult[]): Promise<number> {
  if (tenders.length === 0) return 0

  const supabase = getSupabase()

  // Get existing tender references for deduplication
  const references = tenders.map(t => t.tender_reference)
  const { data: existing } = await supabase
    .from('tender_opportunities')
    .select('tender_reference')
    .in('tender_reference', references)

  const existingRefs = new Set((existing || []).map(e => e.tender_reference))
  const newTenders = tenders.filter(t => !existingRefs.has(t.tender_reference))

  if (newTenders.length === 0) {
    console.log(`[Supabase] All ${tenders.length} tenders already exist`)
    return 0
  }

  // Insert new tenders
  // Note: source_url is stored in TenderResult but not in the DB schema
  // We store it in the notes field as a workaround
  const toInsert = newTenders.map(t => ({
    tender_reference: t.tender_reference,
    issuing_body: t.issuing_body,
    title: t.title,
    description: t.description,
    region: t.region,
    close_date: t.close_date,
    estimated_value: t.estimated_value,
    status: 'open',
    notes: t.source_url ? `Source: ${t.source_url}` : null,
  }))

  const { error } = await supabase.from('tender_opportunities').insert(toInsert)

  if (error) {
    throw new Error(`Failed to insert tenders: ${error.message}`)
  }

  console.log(`[Supabase] Inserted ${newTenders.length} new tenders (${existingRefs.size} duplicates skipped)`)
  return newTenders.length
}

export async function updateScraperLog(
  portal: string,
  success: boolean,
  tendersFound: number,
  tendersInserted: number,
  error?: string
): Promise<void> {
  const supabase = getSupabase()

  // Update news_sources last_fetched_at for the portal
  const portalNameMap: Record<string, string> = {
    austender: 'AusTender',
    victoria: 'Victoria Government Tenders',
    nsw: 'NSW eTendering',
    qld: 'QLD QTenders',
  }

  const sourceName = portalNameMap[portal]
  if (sourceName) {
    await supabase
      .from('news_sources')
      .update({
        last_fetched_at: new Date().toISOString(),
        config: {
          last_scrape_success: success,
          last_scrape_found: tendersFound,
          last_scrape_inserted: tendersInserted,
          last_scrape_error: error || null,
        },
      })
      .ilike('name', `%${sourceName}%`)
      .eq('source_type', 'tender_portal')
  }
}
