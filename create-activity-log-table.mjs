import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Read env vars
const envContent = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
const urlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)
const keyMatch = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)

if (!urlMatch || !keyMatch) {
  console.error('Could not read env vars')
  process.exit(1)
}

const supabaseUrl = urlMatch[1].trim()
const supabaseKey = keyMatch[1].trim()

const supabase = createClient(supabaseUrl, supabaseKey)

async function createActivityLogTable() {
  console.log('Creating priority_matrix_activity_log table via REST API...\n')

  // First check if table exists
  const { error: checkError } = await supabase
    .from('priority_matrix_activity_log')
    .select('id')
    .limit(1)

  if (!checkError) {
    console.log('✅ Table priority_matrix_activity_log already exists')

    // Test insert
    const testResult = await supabase
      .from('priority_matrix_activity_log')
      .insert({
        item_id: 'test-item',
        activity_type: 'created',
        user_name: 'Test User',
        description: 'Test activity - can be deleted',
        metadata: { test: true }
      })
      .select()
      .single()

    if (testResult.error) {
      console.log('⚠️  Table exists but insert failed:', testResult.error.message)
    } else {
      console.log('✅ Insert test successful, deleting test record...')
      await supabase
        .from('priority_matrix_activity_log')
        .delete()
        .eq('id', testResult.data.id)
      console.log('✅ Test record deleted')
    }
    return
  }

  // Table doesn't exist - try to use the Management API to run SQL
  // Since direct SQL execution isn't available via REST, we'll guide the user
  console.log('❌ Table does not exist.')
  console.log('\n📋 Please run the migration SQL in Supabase Dashboard:')
  console.log('   https://supabase.com/dashboard/project/usoyxsunetvxdjdglkmn/sql/new')
  console.log('\n   Or open the migration file:')
  console.log('   docs/migrations/20251231_priority_matrix_activity_log.sql')

  // Open the Supabase SQL editor
  const openCmd = process.platform === 'darwin' ? 'open' : 'xdg-open'
  const { exec } = await import('child_process')
  exec(`${openCmd} "https://supabase.com/dashboard/project/usoyxsunetvxdjdglkmn/sql/new"`)
}

createActivityLogTable()
