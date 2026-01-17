#!/usr/bin/env node

/**
 * Add Missing BURC Entries
 *
 * Creates pipeline_opportunities entries for unmatched sales_pipeline_opportunities
 * This allows the improve-burc-matching.mjs script to match them.
 *
 * Usage:
 *   node scripts/add-missing-burc-entries.mjs --dry-run   # Preview
 *   node scripts/add-missing-burc-entries.mjs             # Apply
 */

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

const DRY_RUN = process.argv.includes('--dry-run')

// Client name mapping to EXISTING BURC client names
const CLIENT_CANONICAL_MAP = {
  // WA Health variations
  'western australia department of health': 'WA Health',
  'wa department of health': 'WA Health',
  'department of health wa': 'WA Health',

  // SA Health variations
  'minister for health aka south australia health': 'SA Health (iPro)',
  'south australia health': 'SA Health (iPro)',
  'sa health': 'SA Health (iPro)',

  // GRMC variations
  'strategic asia pacific partners, incorporated': 'Guam Regional Medical City (GRMC)',
  'strategic asia pacific partners incorporated': 'Guam Regional Medical City (GRMC)',
  'guam regional medical city': 'Guam Regional Medical City (GRMC)',

  // GHA variations
  'gippsland health alliance': 'Gippsland Health Alliance (GHA)',
  'gha': 'Gippsland Health Alliance (GHA)',

  // Singapore
  'synapxe pte ltd': 'SingHealth',
  "st luke's medical center global city inc": "Saint Luke's Medical Centre (SLMC)",
  "saint luke's medical center global city inc": "Saint Luke's Medical Centre (SLMC)",
  'singapore health services pte ltd': 'SingHealth',
  'ncs pte ltd': 'NCS/MinDef Singapore',

  // NZ
  'health new zealand - te whatu ora': 'Te Whatu Ora Waikato',
  'waikato district health board': 'Te Whatu Ora Waikato',

  // Victoria
  'department of health - victoria': 'Department of Health - Victoria',
  'the royal victorian eye and ear hospital': 'The Royal Victorian Eye and Ear Hospital',

  // Other
  'chong hua hospital': 'Chong Hua Hospital',
  'western australia primary health alliance': 'Western Australia Primary Health Alliance',
}

// CSE territory mapping - covers both existing and new clients
const CSE_TERRITORY_MAP = {
  // Australia - Victoria
  'Department of Health - Victoria': { cse: 'Tracey Bland', cam: 'Anu Pradhan' },
  'The Royal Victorian Eye and Ear Hospital': { cse: 'Tracey Bland', cam: 'Anu Pradhan' },
  'Barwon Health Australia': { cse: 'Tracey Bland', cam: 'Anu Pradhan' },
  'Gippsland Health Alliance (GHA)': { cse: 'Tracey Bland', cam: 'Anu Pradhan' },
  'Grampians Health': { cse: 'Tracey Bland', cam: 'Anu Pradhan' },
  'Albury Wodonga Health': { cse: 'Tracey Bland', cam: 'Anu Pradhan' },

  // Australia - WA
  'WA Health': { cse: 'Tracey Bland', cam: 'Anu Pradhan' },
  'Western Australia Primary Health Alliance': { cse: 'Tracey Bland', cam: 'Anu Pradhan' },

  // Australia - SA
  'SA Health (iPro)': { cse: 'Tracey Bland', cam: 'Anu Pradhan' },
  'SA Health (Sunrise)': { cse: 'Tracey Bland', cam: 'Anu Pradhan' },

  // Mount Alvernia
  'Mount Alvernia Hospital': { cse: 'Open Role', cam: 'Nikki Wei' },

  // Singapore
  'SingHealth': { cse: 'Open Role', cam: 'Nikki Wei' },
  "Saint Luke's Medical Centre (SLMC)": { cse: 'Open Role', cam: 'Nikki Wei' },
  'NCS/MinDef Singapore': { cse: 'Open Role', cam: 'Nikki Wei' },

  // Guam
  'Guam Regional Medical City (GRMC)': { cse: 'Open Role', cam: 'Nikki Wei' },

  // Philippines
  'Chong Hua Hospital': { cse: 'Open Role', cam: 'Nikki Wei' },

  // NZ
  'Te Whatu Ora Waikato': { cse: 'Tracey Bland', cam: 'Anu Pradhan' },
  'Health New Zealand - Te Whatu Ora': { cse: 'Tracey Bland', cam: 'Anu Pradhan' },
}

async function main() {
  console.log('=' .repeat(70))
  console.log('ADD MISSING BURC ENTRIES')
  console.log('=' .repeat(70))
  console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN' : '🚀 LIVE'}`)
  console.log('')

  // Get unmatched opportunities
  const { data: unmatched, error } = await supabase
    .from('sales_pipeline_opportunities')
    .select('*')
    .eq('burc_matched', false)

  if (error) {
    console.error('Error fetching unmatched:', error.message)
    process.exit(1)
  }

  console.log(`Found ${unmatched.length} unmatched opportunities`)
  console.log('')

  // Group by account
  const byAccount = {}
  for (const opp of unmatched) {
    const acct = opp.account_name || 'Unknown'
    if (byAccount[acct] === undefined) byAccount[acct] = []
    byAccount[acct].push(opp)
  }

  // Get existing BURC client names
  const { data: existingBurc } = await supabase
    .from('pipeline_opportunities')
    .select('client_name')

  const existingClients = new Set(existingBurc?.map(b => b.client_name?.toLowerCase()) || [])

  console.log('Existing BURC clients:', existingClients.size)
  console.log('')

  // ALWAYS create BURC entries for unmatched opportunities, even if client exists
  // The matching script already tried and failed to match these, so create new BURC entries
  const accountsNeedingEntries = []
  for (const [acct, opps] of Object.entries(byAccount)) {
    const normAcct = acct.toLowerCase()
    const canonicalName = CLIENT_CANONICAL_MAP[normAcct] || acct

    // Check if this client already exists in BURC (for CSE/CAM lookup)
    const hasExisting = existingClients.has(canonicalName.toLowerCase()) ||
                        existingClients.has(normAcct)

    accountsNeedingEntries.push({
      originalName: acct,
      canonicalName,
      opportunities: opps,
      totalAcv: opps.reduce((sum, o) => sum + (o.total_acv || 0), 0),
      clientExists: hasExisting
    })
  }

  console.log(`Accounts needing BURC entries: ${accountsNeedingEntries.length}`)
  console.log('-'.repeat(50))

  // Create BURC entries for each opportunity in accounts that need them
  const entriesToCreate = []

  for (const account of accountsNeedingEntries) {
    const status = account.clientExists ? '🔄' : '🆕'
    console.log(`\n${status} ${account.canonicalName}`)
    console.log(`   Original: ${account.originalName}`)
    console.log(`   Opportunities: ${account.opportunities.length}`)
    console.log(`   Total ACV: $${(account.totalAcv / 1000).toFixed(0)}k`)
    console.log(`   Client in BURC: ${account.clientExists ? 'Yes (adding new opps)' : 'No (new client)'}`)

    const territory = CSE_TERRITORY_MAP[account.canonicalName] || { cse: null, cam: null }

    for (const opp of account.opportunities) {
      const entry = {
        opportunity_name: opp.opportunity_name,
        client_name: account.canonicalName,
        assigned_cse: territory.cse,
        assigned_cam: territory.cam,
        in_target: opp.in_or_out === 'In',
        focus_deal: opp.is_focus_deal || false,
        rats_and_mice: opp.is_under_75k || false,
        close_date: opp.close_date,
        probability: 50, // Default probability
        acv: opp.total_acv || 0,
        acv_net_cogs: (opp.total_acv || 0) * 0.8,
        tcv: opp.tcv || opp.total_acv || 0,
        burc_match: true,
        burc_source_sheet: 'Auto-generated from Sales Budget',
        oracle_agreement_number: opp.oracle_quote_number,
        stage: 'Prospect',
        booking_forecast: opp.forecast_category || 'Pipeline',
        fiscal_year: 2026,
        quarter: opp.fiscal_period || 'Q1 2026',
      }
      entriesToCreate.push(entry)
    }
  }

  console.log('')
  console.log('=' .repeat(50))
  console.log(`Total entries to create: ${entriesToCreate.length}`)
  console.log('')

  if (DRY_RUN) {
    console.log('🔍 DRY RUN - No changes made')
    console.log('')
    console.log('Sample entries:')
    entriesToCreate.slice(0, 3).forEach((e, i) => {
      console.log(`\n${i + 1}. ${e.opportunity_name?.substring(0, 50)}`)
      console.log(`   Client: ${e.client_name}`)
      console.log(`   ACV: $${e.acv?.toLocaleString()}`)
      console.log(`   CSE: ${e.assigned_cse}`)
    })
    console.log('')
    console.log('Run without --dry-run to apply changes.')
    return
  }

  // Insert entries
  console.log('Inserting BURC entries...')

  const BATCH_SIZE = 50
  let inserted = 0
  let errors = 0

  for (let i = 0; i < entriesToCreate.length; i += BATCH_SIZE) {
    const batch = entriesToCreate.slice(i, i + BATCH_SIZE)
    const { error: insertError } = await supabase
      .from('pipeline_opportunities')
      .insert(batch)

    if (insertError) {
      console.error(`Batch ${Math.floor(i / BATCH_SIZE) + 1} error:`, insertError.message)
      errors += batch.length
    } else {
      inserted += batch.length
    }
  }

  console.log(`✅ Inserted: ${inserted}`)
  console.log(`❌ Errors: ${errors}`)
  console.log('')

  // Now run the matching script
  console.log('Now run: node scripts/improve-burc-matching.mjs')
  console.log('')
}

main().catch(console.error)
