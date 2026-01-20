#!/usr/bin/env node
/**
 * Update Contract Renewal Dates
 *
 * Updates renewal dates in burc_contracts table for specified clients.
 * Run: node scripts/update-contract-renewals.mjs
 */

import { createClient } from '@supabase/supabase-js'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// Updates to apply
const renewalUpdates = [
  { client_name: 'RVEEH', renewal_date: '2028-11-30', comments: 'Renewed to Nov 2028' },
  { client_name: 'GHA Regional', renewal_date: '2026-03-31', comments: 'Renewed to Mar 2026' },
  { client_name: 'Grampians', renewal_date: null, comments: 'No renewal date' },
  { client_name: 'EPH', renewal_date: '2026-11-15', comments: 'Renewed to Nov 2026' },
]

async function updateRenewalDates() {
  console.log('🔄 Updating contract renewal dates...\n')

  for (const update of renewalUpdates) {
    console.log(`📝 Updating ${update.client_name}...`)

    const { data, error } = await supabase
      .from('burc_contracts')
      .update({
        renewal_date: update.renewal_date,
        comments: update.comments
      })
      .ilike('client_name', `%${update.client_name}%`)
      .select()

    if (error) {
      console.error(`   ❌ Error: ${error.message}`)
    } else if (data && data.length > 0) {
      console.log(`   ✅ Updated ${data.length} record(s)`)
      data.forEach(record => {
        console.log(`      - ${record.client_name}: ${record.renewal_date || 'No date'}`)
      })
    } else {
      console.log(`   ⚠️  No matching records found`)
    }
  }

  // Verify final state
  console.log('\n📋 Final state of updated contracts:\n')

  const { data: contracts, error: fetchError } = await supabase
    .from('burc_contracts')
    .select('client_name, renewal_date, annual_value_aud, comments')
    .or('client_name.ilike.%RVEEH%,client_name.ilike.%GHA%,client_name.ilike.%Grampians%,client_name.ilike.%EPH%')
    .order('renewal_date', { ascending: true, nullsFirst: true })

  if (fetchError) {
    console.error('❌ Error fetching contracts:', fetchError.message)
  } else {
    contracts.forEach(c => {
      const status = c.renewal_date ?
        (new Date(c.renewal_date) < new Date() ? '🔴 OVERDUE' : '🟢 UPCOMING') :
        '⚪ NO DATE'
      console.log(`${status} ${c.client_name}`)
      console.log(`   Renewal: ${c.renewal_date || 'Not set'}`)
      console.log(`   Value: $${c.annual_value_aud?.toLocaleString() || 'N/A'}`)
      console.log(`   Comments: ${c.comments || '-'}`)
      console.log()
    })
  }

  console.log('✅ Done!')
}

updateRenewalDates().catch(console.error)
