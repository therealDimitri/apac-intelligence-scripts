#!/usr/bin/env tsx
import * as fs from 'fs'
import * as path from 'path'
import { config } from 'dotenv'

// Load environment variables
config({ path: path.join(__dirname, '../.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function executeSQL(sqlFile: string) {
  try {
    console.log(`🚀 Executing SQL from ${sqlFile}...`)

    // Read SQL file
    const sqlPath = path.join(__dirname, '../docs/migrations', sqlFile)
    const sql = fs.readFileSync(sqlPath, 'utf8')

    console.log('📄 SQL file loaded')
    console.log(`📊 File size: ${sql.length} bytes`)

    // Execute via Supabase Management API
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ query: sql })
    })

    if (response.ok) {
      console.log('✅ SQL executed successfully!')
      const text = await response.text()
      if (text) console.log('Response:', text)
    } else {
      const error = await response.text()
      console.error('❌ SQL execution failed!')
      console.error('Status:', response.status, response.statusText)
      console.error('Error:', error)

      // Alternative: Try using psql connection
      console.log('\n⚠️  REST API execution failed. Please execute manually:')
      console.log(`   1. Open Supabase SQL Editor: ${SUPABASE_URL.replace('https://', 'https://supabase.com/dashboard/project/')}/sql/new`)
      console.log(`   2. Copy and paste SQL from: docs/migrations/${sqlFile}`)
      console.log('   3. Click "Run"')
    }
  } catch (error) {
    console.error('❌ Unexpected error:', error)
    process.exit(1)
  }
}

// Get SQL file from command line args
const sqlFile = process.argv[2] || '20260105_regional_benchmarks.sql'
executeSQL(sqlFile)
