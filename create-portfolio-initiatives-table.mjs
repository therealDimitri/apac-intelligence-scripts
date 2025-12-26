#!/usr/bin/env node

/**
 * Create portfolio_initiatives table in Supabase
 * Uses the Supabase SQL Editor via browser automation
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '../.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function checkAndCreateTable() {
  console.log('Checking if portfolio_initiatives table exists...')

  // Check if table exists
  const { data: checkData, error: checkError } = await supabase
    .from('portfolio_initiatives')
    .select('id')
    .limit(1)

  if (!checkError) {
    console.log('portfolio_initiatives table already exists!')

    // Count existing records
    const { count } = await supabase
      .from('portfolio_initiatives')
      .select('*', { count: 'exact', head: true })

    console.log(`Table has ${count || 0} records`)
    return true
  }

  if (checkError.code === 'PGRST205' || checkError.message.includes('does not exist')) {
    console.log('Table does not exist. Please create it manually using the SQL in:')
    console.log('docs/migrations/20251217_create_portfolio_initiatives_table.sql')
    console.log('')
    console.log('Supabase SQL Editor URL:')
    console.log('https://supabase.com/dashboard/project/usoyxsunetvxdjdglkmn/sql/new')
    console.log('')

    // Read and display the SQL
    const sqlPath = join(__dirname, '../docs/migrations/20251217_create_portfolio_initiatives_table.sql')
    if (fs.existsSync(sqlPath)) {
      const sql = fs.readFileSync(sqlPath, 'utf-8')
      console.log('SQL to execute:')
      console.log('-'.repeat(60))
      console.log(sql)
      console.log('-'.repeat(60))
    }

    return false
  }

  console.error('Unexpected error:', checkError)
  return false
}

checkAndCreateTable()
  .then(success => {
    process.exit(success ? 0 : 1)
  })
  .catch(err => {
    console.error('Error:', err)
    process.exit(1)
  })
