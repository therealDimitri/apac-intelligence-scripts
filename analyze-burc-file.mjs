#!/usr/bin/env node

/**
 * Analyze BURC Performance File
 *
 * Reads the 2026 APAC Performance.xlsx to identify opportunities
 * that are in BURC but NOT in the Sales Budget.
 */

import xlsx from 'xlsx'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const BURC_FILE = '/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth/APAC Leadership Team - General/Performance/Financials/BURC/2026/2026 APAC Performance.xlsx'

// Normalise opportunity name for matching
function normaliseOppName(name) {
  if (!name) return ''
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Levenshtein distance
function levenshtein(s1, s2) {
  if (!s1 || !s2) return Infinity
  const a = s1.toLowerCase()
  const b = s2.toLowerCase()
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  const matrix = []
  for (let i = 0; i <= b.length; i++) matrix[i] = [i]
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j

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

function similarity(s1, s2) {
  if (!s1 || !s2) return 0
  const maxLen = Math.max(s1.length, s2.length)
  if (maxLen === 0) return 1
  return 1 - levenshtein(s1, s2) / maxLen
}

async function main() {
  console.log('=' .repeat(70))
  console.log('BURC FILE ANALYSIS - Finding Unmatched Opportunities')
  console.log('=' .repeat(70))
  console.log('')

  // Read the BURC Excel file
  console.log('Reading BURC file...')
  const workbook = xlsx.readFile(BURC_FILE)

  // Get Sales Budget opportunities for comparison
  console.log('Loading Sales Budget opportunities...')
  const { data: salesOpps, error } = await supabase
    .from('sales_pipeline_opportunities')
    .select('opportunity_name, account_name, oracle_quote_number, total_acv')

  if (error) {
    console.error('Error fetching sales opportunities:', error.message)
    process.exit(1)
  }

  console.log(`Sales Budget: ${salesOpps.length} opportunities`)

  // Create lookup structures for matching
  const salesByOracleLookup = new Map()
  const salesByNameLookup = new Map()

  for (const opp of salesOpps) {
    if (opp.oracle_quote_number) {
      salesByOracleLookup.set(opp.oracle_quote_number.toString(), opp)
    }
    const normName = normaliseOppName(opp.opportunity_name)
    if (normName) {
      salesByNameLookup.set(normName, opp)
    }
  }

  console.log(`Oracle numbers indexed: ${salesByOracleLookup.size}`)
  console.log(`Names indexed: ${salesByNameLookup.size}`)
  console.log('')

  // Parse Rats and Mice sheet (header at row 3)
  console.log('-'.repeat(50))
  console.log('PARSING: Rats and Mice Only')
  console.log('-'.repeat(50))

  const ratsSheet = workbook.Sheets['Rats and Mice Only']
  const ratsData = xlsx.utils.sheet_to_json(ratsSheet, { header: 1 })

  // Row 3 (index 3) has headers based on earlier analysis
  const ratsHeaders = ratsData[3]
  console.log('Headers:', ratsHeaders?.slice(0, 10).filter(Boolean).join(', '))

  const ratsOpportunities = []
  for (let i = 4; i < ratsData.length; i++) {
    const row = ratsData[i]
    if (!row || !row[0]) continue // Skip empty rows

    const oppName = row[0]
    const oracleNum = row[3] // Oracle Agreement #
    const acv = row[17] // Bookings ACV

    // Skip summary/total rows and header rows
    if (typeof oppName === 'string') {
      const skipPatterns = [
        'Balance', 'Total', 'Summary', 'Closed in 202', 'Lost or moved',
        'Green:', 'Yellow:', 'Red:', 'Orange:', 'Various', 'Oracle Agreement',
        'Rats and Mice -', 'Anything <', 'Anything  <', 'F/Cast Category'
      ]
      if (skipPatterns.some(p => oppName.includes(p))) continue
    }

    ratsOpportunities.push({
      opportunity_name: oppName,
      oracle_agreement_number: oracleNum,
      acv: acv || 0,
      source: 'Rats and Mice'
    })
  }

  console.log(`Parsed: ${ratsOpportunities.length} opportunities`)
  console.log('')

  // Parse Dial 2 Risk Profile Summary
  console.log('-'.repeat(50))
  console.log('PARSING: Dial 2 Risk Profile Summary')
  console.log('-'.repeat(50))

  const dial2Sheet = workbook.Sheets['Dial 2 Risk Profile Summary']
  const dial2Data = xlsx.utils.sheet_to_json(dial2Sheet, { header: 1 })

  // Show first 10 rows to understand structure
  console.log('First 10 rows:')
  for (let i = 0; i < Math.min(10, dial2Data.length); i++) {
    const row = dial2Data[i]
    if (row && row.length > 0) {
      console.log(`  ${i}: ${JSON.stringify(row.slice(0, 5))}`)
    }
  }

  // Find the actual header row (look for "Deal Name" or similar)
  let dial2HeaderRow = -1
  for (let i = 0; i < Math.min(20, dial2Data.length); i++) {
    const row = dial2Data[i]
    if (row && row.some(cell =>
      typeof cell === 'string' &&
      (cell.toLowerCase().includes('deal name') ||
       cell.toLowerCase().includes('opportunity name') ||
       cell === 'Deal Name')
    )) {
      dial2HeaderRow = i
      break
    }
  }

  const dial2Opportunities = []

  if (dial2HeaderRow >= 0) {
    const headers = dial2Data[dial2HeaderRow]
    console.log(`\nHeader row found at ${dial2HeaderRow}:`)
    console.log('  ', headers?.filter(Boolean).slice(0, 10).join(', '))

    // Find column indices
    const nameIdx = headers.findIndex(h => typeof h === 'string' &&
      (h.toLowerCase().includes('deal') || h.toLowerCase().includes('opportunity')))
    const oracleIdx = headers.findIndex(h => typeof h === 'string' &&
      h.toLowerCase().includes('oracle'))

    for (let i = dial2HeaderRow + 1; i < dial2Data.length; i++) {
      const row = dial2Data[i]
      if (!row || row.length === 0) continue

      const oppName = row[nameIdx] || row[0]
      const oracleNum = oracleIdx >= 0 ? row[oracleIdx] : row[3]

      if (!oppName || typeof oppName !== 'string') continue
      const skipPatterns = [
        'Balance', 'Total', 'Summary', 'Closed in 202', 'Lost or moved',
        'Green:', 'Yellow:', 'Red:', 'Orange:', 'Various', 'Oracle Agreement',
        'Rats and Mice -', 'Anything <', 'Anything  <', 'F/Cast Category'
      ]
      if (skipPatterns.some(p => oppName.includes(p))) continue

      dial2Opportunities.push({
        opportunity_name: oppName,
        oracle_agreement_number: oracleNum,
        acv: 0,
        source: 'Dial 2 Risk Profile'
      })
    }
  } else {
    // Try parsing without clear headers - assume col 0 is name, col 3 is oracle
    console.log('\nNo clear header row found, using column positions...')
    for (let i = 0; i < dial2Data.length; i++) {
      const row = dial2Data[i]
      if (!row || row.length === 0) continue

      const oppName = row[0]
      const oracleNum = row[3]

      if (!oppName || typeof oppName !== 'string') continue
      const skipPatterns = [
        'Balance', 'Total', 'Summary', 'Closed in 202', 'Lost or moved',
        'Green:', 'Yellow:', 'Red:', 'Orange:', 'Various', 'Oracle Agreement',
        'Rats and Mice -', 'Anything <', 'Anything  <', 'F/Cast Category',
        'Revenue', 'Deal', 'Forecast'
      ]
      if (skipPatterns.some(p => oppName.includes(p) || oppName.toLowerCase().includes(p.toLowerCase()))) continue

      dial2Opportunities.push({
        opportunity_name: oppName,
        oracle_agreement_number: oracleNum,
        acv: 0,
        source: 'Dial 2 Risk Profile'
      })
    }
  }

  console.log(`Parsed: ${dial2Opportunities.length} opportunities`)
  console.log('')

  // Combine all BURC opportunities
  const allBurcOpps = [...ratsOpportunities, ...dial2Opportunities]
  console.log('=' .repeat(50))
  console.log(`TOTAL BURC OPPORTUNITIES: ${allBurcOpps.length}`)
  console.log('=' .repeat(50))
  console.log('')

  // Match against Sales Budget
  console.log('MATCHING AGAINST SALES BUDGET...')
  console.log('')

  const matched = []
  const unmatched = []

  for (const burcOpp of allBurcOpps) {
    let isMatched = false
    let matchReason = ''

    // 1. Try Oracle number match
    const oracleStr = burcOpp.oracle_agreement_number?.toString()
    if (oracleStr && salesByOracleLookup.has(oracleStr)) {
      isMatched = true
      matchReason = 'Oracle match'
    }

    // 2. Try exact name match
    if (!isMatched) {
      const normName = normaliseOppName(burcOpp.opportunity_name)
      if (salesByNameLookup.has(normName)) {
        isMatched = true
        matchReason = 'Exact name match'
      }
    }

    // 3. Try fuzzy name match (>85% similarity)
    if (!isMatched) {
      const burcNorm = normaliseOppName(burcOpp.opportunity_name)
      for (const [salesNorm, salesOpp] of salesByNameLookup.entries()) {
        const sim = similarity(burcNorm, salesNorm)
        if (sim > 0.85) {
          isMatched = true
          matchReason = `Fuzzy match (${(sim * 100).toFixed(0)}%): ${salesOpp.opportunity_name?.substring(0, 40)}`
          break
        }
      }
    }

    // 4. Try keyword overlap match
    if (!isMatched) {
      const burcWords = new Set(normaliseOppName(burcOpp.opportunity_name).split(' ').filter(w => w.length > 3))
      for (const [salesNorm, salesOpp] of salesByNameLookup.entries()) {
        const salesWords = new Set(salesNorm.split(' ').filter(w => w.length > 3))
        const intersection = [...burcWords].filter(w => salesWords.has(w))
        const overlap = intersection.length / Math.max(burcWords.size, salesWords.size)
        if (overlap > 0.6 && intersection.length >= 2) {
          isMatched = true
          matchReason = `Keyword match (${intersection.join(', ')})`
          break
        }
      }
    }

    if (isMatched) {
      matched.push({ ...burcOpp, matchReason })
    } else {
      unmatched.push(burcOpp)
    }
  }

  console.log(`Matched: ${matched.length}`)
  console.log(`Unmatched (NOT IN SALES BUDGET): ${unmatched.length}`)
  console.log('')

  // Show unmatched opportunities
  console.log('=' .repeat(50))
  console.log('UNMATCHED OPPORTUNITIES (Not in Target)')
  console.log('=' .repeat(50))

  unmatched.forEach((opp, i) => {
    console.log(`\n${i + 1}. ${opp.opportunity_name}`)
    console.log(`   Oracle: ${opp.oracle_agreement_number || 'N/A'}`)
    console.log(`   Source: ${opp.source}`)
    console.log(`   ACV: $${(opp.acv || 0).toLocaleString()}`)
  })

  console.log('')
  console.log('=' .repeat(50))
  console.log('SUMMARY')
  console.log('=' .repeat(50))
  console.log(`Total BURC opportunities: ${allBurcOpps.length}`)
  console.log(`Matched to Sales Budget: ${matched.length} (${((matched.length / allBurcOpps.length) * 100).toFixed(1)}%)`)
  console.log(`NOT in Sales Budget: ${unmatched.length} (${((unmatched.length / allBurcOpps.length) * 100).toFixed(1)}%)`)

  // Insert unmatched opportunities into pipeline_opportunities as "Not in Target"
  if (unmatched.length > 0) {
    console.log('')
    console.log('=' .repeat(50))
    console.log('INSERTING BURC-ONLY OPPORTUNITIES')
    console.log('=' .repeat(50))

    // Extract client name from opportunity name
    function extractClientName(oppName) {
      const prefixes = [
        'Mindef', 'MinDef', 'SA Health', 'WA Health', 'WH', 'Wellington Health',
        'GHA', 'Grampians Health', 'Sing Health', 'SingHealth', 'AWH', 'Auckland West',
        'GRMC', 'GH', 'Geelong Health', 'APAC'
      ]
      for (const prefix of prefixes) {
        if (oppName.startsWith(prefix)) {
          // Map short prefixes to canonical names
          const clientMap = {
            'Mindef': 'Mindef Singapore',
            'MinDef': 'Mindef Singapore',
            'SA Health': 'SA Health',
            'WA Health': 'WA Health',
            'WH': 'Wellington Health NZ',
            'Wellington Health': 'Wellington Health NZ',
            'GHA': 'Grampians Health Alliance',
            'Grampians Health': 'Grampians Health Alliance',
            'Sing Health': 'SingHealth',
            'SingHealth': 'SingHealth',
            'AWH': 'Auckland West Health',
            'Auckland West': 'Auckland West Health',
            'GRMC': 'GRMC Australia',
            'GH': 'Geelong Health',
            'Geelong Health': 'Geelong Health',
            'APAC': 'APAC Regional'
          }
          return clientMap[prefix] || prefix
        }
      }
      return 'Unknown Client'
    }

    // Determine source sheet (Rats and Mice or Dial 2)
    function isRatsAndMice(source) {
      return source === 'Rats and Mice'
    }

    const insertData = unmatched.map(opp => ({
      opportunity_name: opp.opportunity_name,
      client_name: extractClientName(opp.opportunity_name),
      oracle_agreement_number: opp.oracle_agreement_number?.toString() || null,
      acv: typeof opp.acv === 'number' ? opp.acv * 1000000 : 0, // Convert from millions if needed
      in_target: false, // These are NOT in the Sales Budget, so "Not in Target"
      rats_and_mice: isRatsAndMice(opp.source),
      burc_source_sheet: opp.source,
      focus_deal: false,
      burc_match: true, // These ARE from BURC file
      stage: 'Identified',
      probability: 0,
      fiscal_year: 2026
    }))

    // Check for existing opportunities by Oracle number to avoid duplicates
    const existingCheck = await supabase
      .from('pipeline_opportunities')
      .select('oracle_agreement_number')

    const existingOracles = new Set(
      (existingCheck.data || [])
        .map(r => r.oracle_agreement_number?.toString())
        .filter(Boolean)
    )

    const newOpps = insertData.filter(opp => {
      const oracle = opp.oracle_agreement_number
      if (!oracle || oracle === 'N/A' || oracle.startsWith('BC')) {
        // No Oracle number or BC codes - insert anyway but check by name
        return true
      }
      return !existingOracles.has(oracle)
    })

    if (newOpps.length === 0) {
      console.log('All BURC-only opportunities already exist in database')
    } else {
      console.log(`Inserting ${newOpps.length} new BURC-only opportunities...`)

      // Check existing names to avoid duplicates
      const { data: existingByName } = await supabase
        .from('pipeline_opportunities')
        .select('opportunity_name')

      const existingNames = new Set(
        (existingByName || []).map(r => r.opportunity_name?.toLowerCase())
      )

      const trulyNewOpps = newOpps.filter(opp =>
        !existingNames.has(opp.opportunity_name?.toLowerCase())
      )

      if (trulyNewOpps.length === 0) {
        console.log('All BURC-only opportunities already exist by name')
      } else {
        console.log(`Actually inserting ${trulyNewOpps.length} opportunities...`)

        const { data: insertResult, error: insertError } = await supabase
          .from('pipeline_opportunities')
          .insert(trulyNewOpps)
          .select()

        if (insertError) {
          console.error('Insert error:', insertError.message)
        } else {
          console.log(`Successfully inserted ${insertResult?.length || trulyNewOpps.length} opportunities as "Not in Target"`)
          console.log('Inserted:')
          insertResult?.forEach(r => console.log(`  - ${r.opportunity_name} (${r.client_name})`))
        }
      }
    }
  }

  // Return unmatched for further processing
  return unmatched
}

main().catch(console.error)

