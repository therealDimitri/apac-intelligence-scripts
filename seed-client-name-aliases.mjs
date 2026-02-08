#!/usr/bin/env node
/**
 * Seed Client Name Aliases
 *
 * Merges all known client code → name mappings from sync scripts into
 * the `client_name_aliases` table. This is the canonical source of truth
 * for client name resolution across the platform.
 *
 * Usage:
 *   node scripts/seed-client-name-aliases.mjs            # upsert aliases
 *   node scripts/seed-client-name-aliases.mjs --dry-run   # preview only
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const DRY_RUN = process.argv.includes('--dry-run')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/**
 * Canonical alias list — merged from:
 *   - sync-burc-data-supabase.mjs (clientNames in syncClientMaintenance)
 *   - sync-burc-data.mjs (CLIENT_NAMES in syncClientMaintenance)
 *   - activity-register-parser.ts (SHEET_NAME_TO_CLIENT)
 *
 * Format: { display_name → canonical_name }
 * The canonical_name should match what's used in the main client tables.
 */
const BURC_ALIASES = {
  // BURC Maint Pivot client codes
  'AWH': 'Albury Wodonga Health',
  'BWH': 'Barwon Health',
  'EPH': 'Epworth Healthcare',
  'GHA': 'Gippsland Health Alliance (GHA)',
  'GHRA': 'Gippsland Health Alliance (GHA)',
  'GHA Regional': 'Gippsland Health Alliance (GHA)',
  'MAH': 'Mount Alvernia Hospital',
  'NCS': 'NCS/MinDef Singapore',
  'NCS/MinDef': 'NCS/MinDef Singapore',
  'RVEEH': 'Royal Victorian Eye and Ear Hospital',
  'SA Health': 'SA Health',
  'WA Health': 'WA Health',
  'SLMC': "St Luke's Medical Center",
  'Parkway': 'Parkway (Churned)',
  'GRMC': 'Guam Regional Medical City (GRMC)',
  'Western Health': 'Western Health',
  'RBWH': 'Royal Brisbane Hospital',
  'Sing Health': 'SingHealth',
  'SingHealth': 'SingHealth',
  'Waikato': 'Waikato District Health Board',
  'Lost': '_INACTIVE_',
}

const ACTIVITY_REGISTER_ALIASES = {
  // Activity Register sheet names
  'Albury-Wodonga (AWH)': 'Albury Wodonga Health',
  'Grampians': 'Grampians Health',
  'Grampians Health Alliance': 'Grampians Health',
  'MINDEF-NCS': 'NCS/MinDef Singapore',
  'Mount Alvernia': 'Mount Alvernia Hospital',
  'SA Health iPro': 'SA Health',
  'SA Health iQemo': 'SA Health',
  'SA Health Sunrise': 'SA Health',
  'Vic Health': 'Department of Health - Victoria',
  'Epworth': 'Epworth Healthcare',
  'Barwon Health': 'Barwon Health',
}

// Merge all aliases
const ALL_ALIASES = { ...BURC_ALIASES, ...ACTIVITY_REGISTER_ALIASES }

async function seedAliases() {
  console.log('🏷️  Seeding client name aliases...')
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE'}`)
  console.log(`   Aliases to upsert: ${Object.keys(ALL_ALIASES).length}\n`)

  // Get existing aliases
  const { data: existing, error: fetchErr } = await supabase
    .from('client_name_aliases')
    .select('display_name, canonical_name')

  if (fetchErr) {
    console.error('❌ Failed to fetch existing aliases:', fetchErr.message)
    process.exit(1)
  }

  const existingMap = new Map(existing.map(a => [a.display_name, a.canonical_name]))

  let created = 0
  let updated = 0
  let skipped = 0

  for (const [displayName, canonicalName] of Object.entries(ALL_ALIASES)) {
    const current = existingMap.get(displayName)

    if (current === canonicalName) {
      skipped++
      continue
    }

    if (current) {
      console.log(`   ✏️  Update: "${displayName}" → "${canonicalName}" (was "${current}")`)
      updated++
    } else {
      console.log(`   ➕ New: "${displayName}" → "${canonicalName}"`)
      created++
    }

    if (!DRY_RUN) {
      const { error } = await supabase
        .from('client_name_aliases')
        .upsert(
          { display_name: displayName, canonical_name: canonicalName },
          { onConflict: 'display_name' }
        )

      if (error) {
        console.error(`   ❌ Error upserting "${displayName}":`, error.message)
      }
    }
  }

  console.log(`\n📊 Summary: ${created} new, ${updated} updated, ${skipped} unchanged`)

  if (DRY_RUN) {
    console.log('\n   ℹ️  Dry run — no changes were made. Run without --dry-run to apply.')
  } else {
    console.log('\n✅ Client name aliases seeded successfully!')
  }
}

seedAliases().catch(err => {
  console.error('❌ Error:', err.message)
  process.exit(1)
})
