#!/usr/bin/env node
/**
 * Verify ChaSen learning tables exist and are functional
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function checkTable(tableName) {
  try {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .limit(1)

    if (error) {
      console.log(`❌ ${tableName}: ${error.message}`)
      return false
    }

    console.log(`✅ ${tableName}: exists (${data?.length || 0} sample rows)`)
    return true
  } catch (err) {
    console.log(`❌ ${tableName}: ${err.message}`)
    return false
  }
}

async function main() {
  console.log('🔍 Checking ChaSen learning tables...\n')

  const tables = [
    'chasen_feedback',
    'chasen_knowledge_suggestions',
    'chasen_learning_patterns'
  ]

  const results = await Promise.all(tables.map(checkTable))

  const allExist = results.every(r => r)

  console.log('\n' + (allExist
    ? '✅ All ChaSen learning tables exist!'
    : '⚠️ Some tables are missing. Run the migration in migrations/chasen-learning-tables.sql'))
}

main()
