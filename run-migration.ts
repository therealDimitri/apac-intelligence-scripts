#!/usr/bin/env tsx
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import { config } from 'dotenv'

// Load environment variables
config({ path: path.join(__dirname, '../.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

async function runMigration() {
  try {
    console.log('🚀 Running regional_benchmarks migration...')

    // Read migration SQL
    const migrationPath = path.join(__dirname, '../docs/migrations/20260105_regional_benchmarks.sql')
    const sql = fs.readFileSync(migrationPath, 'utf8')

    console.log('📄 Migration file loaded')

    // Check if table exists
    const { data: existingData, error: checkError } = await supabase
      .from('regional_benchmarks')
      .select('*')
      .limit(0)

    if (checkError && checkError.code === '42P01') {
      console.log('❌ Table does not exist yet')
      console.log('\n⚠️  Please execute the migration manually:')
      console.log(`   1. Open: ${SUPABASE_URL.replace('https://', 'https://supabase.com/dashboard/project/')}/sql/new`)
      console.log('   2. Copy the SQL from: docs/migrations/20260105_regional_benchmarks.sql')
      console.log('   3. Execute the SQL in the SQL Editor')
      console.log('\n📝 The migration file is ready and contains all necessary DDL statements.')
    } else if (!checkError) {
      console.log('✅ Table regional_benchmarks already exists!')
    } else {
      console.log('⚠️  Unexpected error:', checkError)
    }
  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  }
}

runMigration()
