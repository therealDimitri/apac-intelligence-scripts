#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function assignGHACse() {
  console.log('🔍 Checking GHA record in nps_clients...')

  // Find GHA record
  const { data: ghaRecord, error: fetchError } = await supabase
    .from('nps_clients')
    .select('*')
    .ilike('client_name', '%Gippsland%')
    .single()

  if (fetchError) {
    console.error('❌ Error fetching GHA:', fetchError)
    process.exit(1)
  }

  console.log('📋 Current GHA record:')
  console.log(JSON.stringify(ghaRecord, null, 2))

  // Update CSE to Tracey Bland
  console.log('\n📝 Updating CSE to Tracey Bland...')
  const { data: updatedRecord, error: updateError } = await supabase
    .from('nps_clients')
    .update({ cse: 'Tracey Bland' })
    .eq('id', ghaRecord.id)
    .select()
    .single()

  if (updateError) {
    console.error('❌ Error updating GHA:', updateError)
    process.exit(1)
  }

  console.log('✅ Successfully assigned Tracey Bland as CSE for GHA')
  console.log('📋 Updated record:')
  console.log(JSON.stringify(updatedRecord, null, 2))

  // Refresh materialized view
  console.log('\n🔄 Refreshing materialized view...')
  const { error: refreshError } = await supabase.rpc('exec', {
    sql: 'REFRESH MATERIALIZED VIEW CONCURRENTLY client_health_summary;'
  })

  if (refreshError) {
    console.log('⚠️  Could not refresh via RPC, please run manually:')
    console.log('   REFRESH MATERIALIZED VIEW CONCURRENTLY client_health_summary;')
  } else {
    console.log('✅ Materialized view refreshed')
  }
}

assignGHACse().catch(console.error)
