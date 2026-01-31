#!/usr/bin/env node
/**
 * Seed client_name_aliases table with initial aliases
 * Generates abbreviations and common variations from client names
 *
 * Usage: node scripts/seed-client-aliases.mjs
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Words to skip when generating abbreviations
const SKIP_WORDS = ['the', 'of', 'and', 'for', 'in', 'at', 'to', 'a', 'an']

/**
 * Generate abbreviation from name (e.g., "Royal Melbourne Hospital" -> "RMH")
 */
function generateAbbreviation(name) {
  const words = name
    .split(/\s+/)
    .filter(w => !SKIP_WORDS.includes(w.toLowerCase()) && w.length > 1)

  if (words.length < 2) return null

  const abbrev = words.map(w => w[0].toUpperCase()).join('')

  // Only return if it's a reasonable length (2-6 chars)
  if (abbrev.length >= 2 && abbrev.length <= 6) {
    return abbrev
  }
  return null
}

/**
 * Generate common variations of client names
 */
function generateVariations(name) {
  const variations = []

  // Abbreviation
  const abbrev = generateAbbreviation(name)
  if (abbrev) {
    variations.push({ alias: abbrev, type: 'abbreviation' })
  }

  // Without "The" prefix
  if (name.toLowerCase().startsWith('the ')) {
    variations.push({ alias: name.slice(4), type: 'manual' })
  }

  // Hospital -> Health variations
  if (name.includes('Hospital')) {
    const healthVersion = name.replace('Hospital', 'Health').replace('Hospitals', 'Health')
    if (healthVersion !== name) {
      variations.push({ alias: healthVersion, type: 'manual' })
    }
  }

  // Saint -> St variations
  if (name.includes('Saint ')) {
    variations.push({ alias: name.replace('Saint ', 'St '), type: 'manual' })
  }
  if (name.includes('St ') || name.includes('St.')) {
    variations.push({ alias: name.replace(/St\.?\s/g, 'Saint '), type: 'manual' })
  }

  // Medical Centre -> Medical Center (US spelling) and vice versa
  if (name.includes('Centre')) {
    variations.push({ alias: name.replace('Centre', 'Center'), type: 'manual' })
  }
  if (name.includes('Center')) {
    variations.push({ alias: name.replace('Center', 'Centre'), type: 'manual' })
  }

  // Remove "Private" or "Public" for shorter search term
  if (name.includes(' Private ')) {
    variations.push({ alias: name.replace(' Private ', ' '), type: 'manual' })
  }
  if (name.includes(' Public ')) {
    variations.push({ alias: name.replace(' Public ', ' '), type: 'manual' })
  }

  return variations
}

async function seedAliases() {
  console.log('🔍 Fetching clients from nps_clients...')

  const { data: clients, error } = await supabase
    .from('nps_clients')
    .select('id, client_name')
    .order('client_name')

  if (error) {
    console.error('❌ Error fetching clients:', error.message)
    process.exit(1)
  }

  console.log(`📋 Found ${clients.length} clients`)

  const aliases = []

  for (const client of clients) {
    const variations = generateVariations(client.client_name)

    for (const v of variations) {
      // Skip if alias is same as client name
      if (v.alias.toLowerCase() === client.client_name.toLowerCase()) {
        continue
      }

      aliases.push({
        client_id: client.id,
        client_name: client.client_name,
        alias: v.alias,
        alias_type: v.type,
        is_active: true,
      })
    }
  }

  console.log(`✨ Generated ${aliases.length} aliases`)

  if (aliases.length === 0) {
    console.log('ℹ️ No aliases to insert')
    return
  }

  // Insert in batches to avoid issues
  const batchSize = 50
  let inserted = 0

  for (let i = 0; i < aliases.length; i += batchSize) {
    const batch = aliases.slice(i, i + batchSize)

    const { error: insertError } = await supabase
      .from('client_name_aliases')
      .upsert(batch, {
        onConflict: 'client_id,alias',
        ignoreDuplicates: true,
      })

    if (insertError) {
      console.error(`❌ Error inserting batch ${i / batchSize + 1}:`, insertError.message)
    } else {
      inserted += batch.length
    }
  }

  console.log(`✅ Inserted/updated ${inserted} aliases`)

  // Show sample of created aliases
  const { data: sample } = await supabase
    .from('client_name_aliases')
    .select('client_name, alias, alias_type')
    .order('client_name')
    .limit(15)

  if (sample && sample.length > 0) {
    console.log('\n📝 Sample aliases:')
    console.table(sample)
  }

  // Show total count
  const { count } = await supabase
    .from('client_name_aliases')
    .select('*', { count: 'exact', head: true })

  console.log(`\n📊 Total aliases in database: ${count}`)
}

seedAliases().catch(err => {
  console.error('❌ Script failed:', err)
  process.exit(1)
})
