#!/usr/bin/env node
/**
 * Backfill Priority Matrix Assignments from localStorage to Database
 *
 * This script reads the localStorage data exported from the browser
 * and inserts it into the priority_matrix_assignments table.
 *
 * Usage:
 * 1. In browser console, run:
 *    console.log(JSON.stringify({
 *      owners: JSON.parse(localStorage.getItem('priority-matrix-item-owners') || '{}'),
 *      positions: JSON.parse(localStorage.getItem('priority-matrix-item-positions') || '{}'),
 *      clientAssignments: JSON.parse(localStorage.getItem('priority-matrix-client-assignments') || '{}')
 *    }))
 *
 * 2. Copy the JSON output and save to a file (e.g., localStorage-export.json)
 *
 * 3. Run: node scripts/backfill-priority-matrix-assignments.mjs ./localStorage-export.json
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { readFileSync, existsSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Default data if no file provided - you can paste your localStorage data here
const DEFAULT_DATA = {
  owners: {},
  positions: {},
  clientAssignments: {}
}

async function backfillAssignments(data) {
  console.log('🚀 Backfilling Priority Matrix assignments...\n')

  const { owners, positions, clientAssignments } = data

  // Collect all unique item IDs
  const allItemIds = new Set([
    ...Object.keys(owners),
    ...Object.keys(positions),
    ...Object.keys(clientAssignments)
  ])

  console.log(`📊 Found ${allItemIds.size} unique items to backfill`)
  console.log(`   - Owners: ${Object.keys(owners).length}`)
  console.log(`   - Positions: ${Object.keys(positions).length}`)
  console.log(`   - Client Assignments: ${Object.keys(clientAssignments).length}`)
  console.log('')

  let success = 0
  let failed = 0
  let skipped = 0

  for (const itemId of allItemIds) {
    const owner = owners[itemId] || null
    const quadrant = positions[itemId] || null
    const clientAssignment = clientAssignments[itemId] || {}

    // Skip if no meaningful data
    if (!owner && !quadrant && Object.keys(clientAssignment).length === 0) {
      skipped++
      continue
    }

    try {
      const { error } = await supabase
        .from('priority_matrix_assignments')
        .upsert({
          item_id: itemId,
          owner,
          quadrant,
          client_assignments: clientAssignment,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'item_id',
          ignoreDuplicates: false
        })

      if (error) {
        console.error(`❌ Failed to upsert ${itemId}:`, error.message)
        failed++
      } else {
        console.log(`✅ ${itemId} -> owner: ${owner || 'none'}, quadrant: ${quadrant || 'none'}`)
        success++
      }
    } catch (err) {
      console.error(`❌ Error upserting ${itemId}:`, err.message)
      failed++
    }
  }

  console.log('\n📋 Backfill complete!')
  console.log(`   ✅ Success: ${success}`)
  console.log(`   ❌ Failed: ${failed}`)
  console.log(`   ⏭️  Skipped (no data): ${skipped}`)

  // Verify by fetching count
  const { count } = await supabase
    .from('priority_matrix_assignments')
    .select('*', { count: 'exact', head: true })

  console.log(`\n📊 Total records in database: ${count}`)
}

// Main execution
const args = process.argv.slice(2)
let data = DEFAULT_DATA

if (args[0] && existsSync(args[0])) {
  console.log(`📁 Reading data from: ${args[0]}`)
  try {
    const fileContent = readFileSync(args[0], 'utf-8')
    data = JSON.parse(fileContent)
    console.log('✅ File parsed successfully\n')
  } catch (err) {
    console.error('❌ Failed to parse file:', err.message)
    process.exit(1)
  }
} else if (args[0]) {
  // Try to parse as inline JSON
  try {
    data = JSON.parse(args[0])
    console.log('✅ Inline JSON parsed successfully\n')
  } catch {
    console.log('ℹ️  No valid data file or JSON provided')
    console.log('ℹ️  Using default empty data\n')
    console.log('To export your localStorage, run this in browser console:')
    console.log(`
console.log(JSON.stringify({
  owners: JSON.parse(localStorage.getItem('priority-matrix-item-owners') || '{}'),
  positions: JSON.parse(localStorage.getItem('priority-matrix-item-positions') || '{}'),
  clientAssignments: JSON.parse(localStorage.getItem('priority-matrix-client-assignments') || '{}')
}))
`)
  }
}

backfillAssignments(data).catch(console.error)
