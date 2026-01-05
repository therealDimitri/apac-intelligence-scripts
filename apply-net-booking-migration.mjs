#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function main() {
  console.log('Adding net_booking column to burc_pipeline_detail...')

  // Try to add the column by doing a test insert/update
  // First, check if column exists by querying
  const { data: testData, error: testError } = await supabase
    .from('burc_pipeline_detail')
    .select('net_booking')
    .limit(1)

  if (testError && testError.message.includes('net_booking')) {
    console.log('Column does not exist, need to add via SQL Editor')
    console.log('Please run this SQL in Supabase SQL Editor:')
    console.log('')
    console.log('ALTER TABLE burc_pipeline_detail ADD COLUMN IF NOT EXISTS net_booking DECIMAL(15,2) DEFAULT 0;')
    console.log('')
    process.exit(1)
  } else {
    console.log('✅ net_booking column already exists')
  }
}

main().catch(console.error)
