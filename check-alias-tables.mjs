#!/usr/bin/env node
/**
 * Check for existing client alias/mapping tables
 */

import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function checkTables() {
  console.log('=== Checking for Existing Alias/Mapping Tables ===\n')

  const tableNames = [
    'client_name_aliases',
    'client_aliases',
    'nps_clients',
    'client_mappings',
    'name_mappings',
    'client_name_mappings',
  ]

  for (const table of tableNames) {
    const { data, error } = await supabase.from(table).select('*').limit(5)
    if (!error && data) {
      console.log(`✅ Table exists: ${table}`)
      if (data.length > 0) {
        console.log(`   Columns: ${Object.keys(data[0]).join(', ')}`)
        console.log(`   Sample rows: ${data.length}`)
        data.forEach((row, i) => {
          console.log(`   [${i + 1}] ${JSON.stringify(row)}`)
        })
      } else {
        console.log('   (empty table)')
      }
      console.log('')
    }
  }

  // Also check the database schema doc
  console.log('Checking database schema documentation...')
}

checkTables()
