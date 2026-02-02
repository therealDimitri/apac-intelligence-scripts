/**
 * Tender Scraper Types
 */

export interface TenderResult {
  tender_reference: string
  issuing_body: string
  title: string
  description: string | null
  region: string
  close_date: string | null
  estimated_value: string | null
  source_url: string
  portal: string
}

export interface ScraperResult {
  portal: string
  success: boolean
  tendersFound: number
  tendersInserted: number
  duration: number
  error?: string
}

export interface ScraperConfig {
  name: string
  enabled: boolean
  baseUrl: string
  searchKeywords: string[]
  maxPages: number
  timeout: number
}

export const PORTAL_CONFIGS: Record<string, ScraperConfig> = {
  austender: {
    name: 'AusTender',
    enabled: true,
    baseUrl: 'https://www.tenders.gov.au',
    searchKeywords: ['health', 'hospital', 'medical', 'clinical', 'healthcare'],
    maxPages: 5,
    timeout: 30000,
  },
  victoria: {
    name: 'Victoria Tenders',
    enabled: true,
    baseUrl: 'https://www.tenders.vic.gov.au',
    searchKeywords: ['health'],
    maxPages: 3,
    timeout: 30000,
  },
  nsw: {
    name: 'NSW eTendering',
    enabled: true,
    baseUrl: 'https://buy.nsw.gov.au',
    searchKeywords: ['health'],
    maxPages: 3,
    timeout: 30000,
  },
  qld: {
    name: 'QLD QTenders',
    enabled: true,
    baseUrl: 'https://qtenders.hpw.qld.gov.au',
    searchKeywords: ['health'],
    maxPages: 3,
    timeout: 45000, // Blazor needs more time
  },
}
