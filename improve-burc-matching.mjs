#!/usr/bin/env node

/**
 * Improved BURC Matching Script
 *
 * Fixes matching issues between Sales Budget and BURC pipeline opportunities.
 *
 * Improvements over original:
 * 1. Client name normalization (WA Health = Western Australia Department Of Health)
 * 2. Opportunity name normalization (underscores, case refs like CS18946561)
 * 3. Oracle quote number matching (exact match = high confidence)
 * 4. Levenshtein distance for better fuzzy matching
 * 5. Keyword extraction matching
 * 6. Multiple matching strategies with confidence levels
 *
 * Usage:
 *   node scripts/improve-burc-matching.mjs --dry-run   # Preview matches
 *   node scripts/improve-burc-matching.mjs             # Apply matches
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '..', '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const VERBOSE = args.includes('--verbose')

// ============================================================================
// Client Name Normalisation Map
// ============================================================================

const CLIENT_NORMALISATION = {
  // WA Health variations
  'western australia department of health': 'wa health',
  'wa department of health': 'wa health',
  'department of health wa': 'wa health',
  'wa health': 'wa health',

  // SA Health variations
  'minister for health aka south australia health': 'sa health',
  'south australia health': 'sa health',
  'sa health (ipro)': 'sa health',
  'sa health (iqemo)': 'sa health',
  'sa health (sunrise)': 'sa health',
  'sa health': 'sa health',

  // GRMC variations
  'strategic asia pacific partners, incorporated': 'grmc',
  'strategic asia pacific partners incorporated': 'grmc',
  'guam regional medical city (grmc)': 'grmc',
  'guam regional medical city': 'grmc',
  'grmc': 'grmc',

  // Barwon Health
  'barwon health australia': 'barwon health',
  'barwon health': 'barwon health',

  // Mount Alvernia
  'mount alvernia hospital': 'mount alvernia',
  'mah': 'mount alvernia',

  // Albury Wodonga
  'albury wodonga health': 'awh',
  'awh': 'awh',

  // GHA
  'gippsland health alliance (gha)': 'gha',
  'gippsland health alliance': 'gha',
  'gha': 'gha',

  // NCS/MinDef
  'ncs/mindef singapore': 'ncs mindef',
  'mindef': 'ncs mindef',
  'ncs': 'ncs mindef',

  // Synapxe
  'synapxe pte ltd': 'synapxe',
  'synapxe': 'synapxe',

  // Te Whatu Ora
  'te whatu ora waikato': 'waikato',
  'waikato': 'waikato',

  // Department of Health - Victoria
  'department of health - victoria': 'doh victoria',
  'department of health victoria': 'doh victoria',
  'doh victoria': 'doh victoria',
  'doh': 'doh victoria',

  // St Luke's Medical Center
  "st luke's medical center global city inc": 'st lukes',
  "st luke's medical centre global city inc": 'st lukes',
  "st luke's medical center": 'st lukes',
  "st luke's medical centre": 'st lukes',
  'slmc': 'st lukes',
  'st lukes': 'st lukes',

  // NCS additional variations
  'ncs pte ltd': 'ncs mindef',
  'ncs pte': 'ncs mindef',

  // SingHealth variations
  'singhealth': 'singhealth',
  'sing health': 'singhealth',

  // Parkway
  'parkway hospitals singapore pte ltd': 'parkway',
  'parkway hospitals': 'parkway',
  'parkway': 'parkway',

  // Epworth
  'epworth healthcare': 'epworth',
  'epworth': 'epworth',

  // Western Health
  'western health': 'western health',

  // Grampians Health
  'grampians health': 'grampians',
  'grampians': 'grampians',

  // KK Women's and Children's
  "kk women's and children's hospital": 'kkh',
  'kkh': 'kkh',

  // Singapore General Hospital
  'singapore general hospital pte ltd': 'sgh',
  'singapore general hospital': 'sgh',
  'sgh': 'sgh',

  // Changi General Hospital
  'changi general hospital': 'cgh',
  'cgh': 'cgh',

  // Sengkang General Hospital
  'sengkang general hospital pte. ltd.': 'skh',
  'sengkang general hospital': 'skh',
  'skh': 'skh',
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Normalise client name using the mapping
 */
function normaliseClientName(name) {
  if (!name) return ''
  const lower = name.toLowerCase().trim()
  return CLIENT_NORMALISATION[lower] || lower
}

/**
 * Normalise opportunity name for comparison
 * - Convert underscores to spaces
 * - Remove case reference numbers (CS12345678)
 * - Standardise common abbreviations
 */
function normaliseOpportunityName(name) {
  if (!name) return ''
  return name
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/cs\d{8,}/gi, '') // Remove case refs like CS18946561
    .replace(/\s+/g, ' ')
    .replace(/prof\s*srvs/gi, 'professional services')
    .replace(/maint/gi, 'maintenance')
    .replace(/impl/gi, 'implementation')
    .replace(/ccr\s*\d+/gi, '') // Remove CCR numbers
    .replace(/\d{8}/g, '') // Remove date-like numbers (20250519)
    .trim()
}

/**
 * Extract keywords from opportunity name
 */
function extractKeywords(name) {
  if (!name) return new Set()
  const normalised = normaliseOpportunityName(name)

  // Remove common stop words and short words
  const stopWords = new Set(['the', 'and', 'for', 'to', 'in', 'of', 'on', 'a', 'an', 'is', 'at', 'by', 'from'])

  const words = normalised
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w))
    .map(w => w.replace(/[^a-z0-9]/g, ''))
    .filter(w => w.length > 2)

  return new Set(words)
}

/**
 * Levenshtein distance between two strings
 */
function levenshteinDistance(s1, s2) {
  if (!s1 || !s2) return Infinity
  const a = s1.toLowerCase()
  const b = s2.toLowerCase()

  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  const matrix = []

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        )
      }
    }
  }

  return matrix[b.length][a.length]
}

/**
 * Normalised Levenshtein similarity (0-1)
 */
function levenshteinSimilarity(s1, s2) {
  if (!s1 || !s2) return 0
  const maxLen = Math.max(s1.length, s2.length)
  if (maxLen === 0) return 1
  const distance = levenshteinDistance(s1, s2)
  return 1 - distance / maxLen
}

/**
 * Jaccard similarity on keywords
 */
function keywordSimilarity(keywords1, keywords2) {
  if (keywords1.size === 0 || keywords2.size === 0) return 0

  const intersection = [...keywords1].filter(w => keywords2.has(w)).length
  const union = new Set([...keywords1, ...keywords2]).size

  return union > 0 ? intersection / union : 0
}

/**
 * Check if Oracle quote numbers match
 */
function oracleQuoteMatches(quote1, quote2) {
  if (!quote1 || !quote2) return false
  const q1 = String(quote1).trim()
  const q2 = String(quote2).trim()
  if (q1.length < 3 || q2.length < 3) return false // Too short to be meaningful
  return q1 === q2
}

// ============================================================================
// Matching Logic
// ============================================================================

/**
 * Find best BURC match for a Sales Budget opportunity
 */
function findBurcMatch(salesOpp, burcPipeline) {
  const salesClient = normaliseClientName(salesOpp.account_name)
  const salesName = normaliseOpportunityName(salesOpp.opportunity_name)
  const salesKeywords = extractKeywords(salesOpp.opportunity_name)

  let bestMatch = null
  let bestScore = 0
  let bestConfidence = null
  let matchReason = ''

  for (const burc of burcPipeline) {
    const burcClient = normaliseClientName(burc.client_name)
    const burcName = normaliseOpportunityName(burc.opportunity_name)
    const burcKeywords = extractKeywords(burc.opportunity_name)

    let score = 0
    let reason = []

    // 1. Oracle quote number match (highest confidence)
    if (oracleQuoteMatches(salesOpp.oracle_quote_number, burc.oracle_agreement_number)) {
      return {
        id: burc.id,
        confidence: 'oracle',
        score: 1.0,
        reason: `Oracle quote match: ${salesOpp.oracle_quote_number}`
      }
    }

    // 2. Exact normalised name match
    if (salesName && burcName && salesName === burcName) {
      return {
        id: burc.id,
        confidence: 'exact',
        score: 1.0,
        reason: 'Exact name match after normalisation'
      }
    }

    // 3. Client must match (or be very similar)
    const clientMatch = salesClient === burcClient
    const clientSimilarity = levenshteinSimilarity(salesClient, burcClient)

    if (!clientMatch && clientSimilarity < 0.5) {
      continue // Skip if client doesn't match
    }

    if (clientMatch) {
      score += 0.3
      reason.push('client match')
    } else if (clientSimilarity >= 0.5) {
      score += clientSimilarity * 0.2
      reason.push(`client similar (${(clientSimilarity * 100).toFixed(0)}%)`)
    }

    // 4. Name similarity (Levenshtein)
    const nameSimilarity = levenshteinSimilarity(salesName, burcName)
    if (nameSimilarity >= 0.7) {
      score += nameSimilarity * 0.4
      reason.push(`name similar (${(nameSimilarity * 100).toFixed(0)}%)`)
    }

    // 5. Keyword overlap
    const kwSimilarity = keywordSimilarity(salesKeywords, burcKeywords)
    if (kwSimilarity >= 0.3) {
      score += kwSimilarity * 0.3
      reason.push(`keywords (${(kwSimilarity * 100).toFixed(0)}%)`)
    }

    // 6. ACV proximity (within 20% or $5000)
    if (salesOpp.total_acv > 0 && burc.acv > 0) {
      const acvDiff = Math.abs(salesOpp.total_acv - burc.acv)
      const acvPercent = acvDiff / Math.max(salesOpp.total_acv, burc.acv)

      if (acvDiff < 5000 || acvPercent < 0.2) {
        score += 0.15
        reason.push('ACV match')
      }
    }

    if (score > bestScore) {
      bestScore = score
      bestMatch = burc
      matchReason = reason.join(', ')

      if (score >= 0.8) {
        bestConfidence = 'high'
      } else if (score >= 0.6) {
        bestConfidence = 'medium'
      } else {
        bestConfidence = 'low'
      }
    }
  }

  // Only return if score is high enough
  if (bestMatch && bestScore >= 0.5) {
    return {
      id: bestMatch.id,
      confidence: bestConfidence,
      score: bestScore,
      reason: matchReason,
      matchedName: bestMatch.opportunity_name
    }
  }

  return null
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('🔄 Improved BURC Matching')
  console.log('='.repeat(60))
  console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN' : '🚀 LIVE'}`)
  console.log('')

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // Load unmatched Sales Budget opportunities
  console.log('📥 Loading unmatched Sales Budget opportunities...')
  const { data: unmatched, error: unmatchedError } = await supabase
    .from('sales_pipeline_opportunities')
    .select('*')
    .eq('burc_matched', false)

  if (unmatchedError) {
    console.error('Error loading unmatched:', unmatchedError.message)
    process.exit(1)
  }

  console.log(`   Found ${unmatched.length} unmatched opportunities`)

  // Load BURC pipeline
  console.log('📥 Loading BURC pipeline...')
  const { data: burcPipeline, error: burcError } = await supabase
    .from('pipeline_opportunities')
    .select('id, opportunity_name, client_name, acv, close_date, oracle_agreement_number')

  if (burcError) {
    console.error('Error loading BURC:', burcError.message)
    process.exit(1)
  }

  console.log(`   Loaded ${burcPipeline.length} BURC opportunities`)
  console.log('')

  // Find matches
  const newMatches = []
  const stillUnmatched = []

  for (const opp of unmatched) {
    const match = findBurcMatch(opp, burcPipeline)

    if (match) {
      newMatches.push({
        id: opp.id,
        opportunity_name: opp.opportunity_name,
        account_name: opp.account_name,
        burc_pipeline_id: match.id,
        confidence: match.confidence,
        score: match.score,
        reason: match.reason,
        matched_to: match.matchedName
      })
    } else {
      stillUnmatched.push(opp)
    }
  }

  // Report results
  console.log('📊 Results')
  console.log('-'.repeat(60))
  console.log(`New matches found: ${newMatches.length}`)
  console.log(`Still unmatched: ${stillUnmatched.length}`)
  console.log('')

  if (newMatches.length > 0) {
    console.log('✅ NEW MATCHES:')
    console.log('-'.repeat(60))

    // Group by confidence
    const byConfidence = { oracle: [], exact: [], high: [], medium: [], low: [] }
    newMatches.forEach(m => {
      byConfidence[m.confidence] = byConfidence[m.confidence] || []
      byConfidence[m.confidence].push(m)
    })

    for (const [conf, matches] of Object.entries(byConfidence)) {
      if (matches.length === 0) continue

      console.log(`\n  ${conf.toUpperCase()} confidence (${matches.length}):`)
      for (const m of matches) {
        console.log(`    • ${m.opportunity_name.substring(0, 50)}`)
        console.log(`      → ${m.matched_to?.substring(0, 50) || 'N/A'}`)
        console.log(`      Score: ${(m.score * 100).toFixed(0)}%, Reason: ${m.reason}`)
      }
    }
  }

  if (VERBOSE && stillUnmatched.length > 0) {
    console.log('\n❌ STILL UNMATCHED:')
    console.log('-'.repeat(60))
    for (const opp of stillUnmatched.slice(0, 20)) {
      console.log(`  • ${opp.opportunity_name}`)
      console.log(`    Client: ${opp.account_name}`)
    }
    if (stillUnmatched.length > 20) {
      console.log(`  ... and ${stillUnmatched.length - 20} more`)
    }
  }

  // Apply matches
  if (!DRY_RUN && newMatches.length > 0) {
    console.log('\n🗄️  Applying matches to database...')

    let updated = 0
    for (const match of newMatches) {
      const { error } = await supabase
        .from('sales_pipeline_opportunities')
        .update({
          burc_matched: true,
          burc_pipeline_id: match.burc_pipeline_id,
          burc_match_confidence: match.confidence
        })
        .eq('id', match.id)

      if (error) {
        console.error(`  Error updating ${match.opportunity_name}:`, error.message)
      } else {
        updated++
      }
    }

    console.log(`   ✅ Updated ${updated}/${newMatches.length} opportunities`)
  }

  console.log('\n✅ Done!')
}

main().catch(console.error)
