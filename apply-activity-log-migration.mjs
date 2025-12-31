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

async function applyMigration() {
  console.log('Creating priority_matrix_activity_log table...\n')

  // Check if table exists first
  const { data: existingTable, error: checkError } = await supabase
    .from('priority_matrix_activity_log')
    .select('id')
    .limit(1)

  if (!checkError) {
    console.log('✅ Table priority_matrix_activity_log already exists')
    return
  }

  // Table doesn't exist, create it via REST API
  // Since we can't run raw SQL, we'll use the Management API approach
  // For now, let's just create the table structure via insert and schema inference

  // Alternative: Use the Supabase Dashboard SQL Editor to run the migration
  console.log('⚠️  Table does not exist. Please run the following SQL in Supabase Dashboard:')
  console.log('File: docs/migrations/20251231_priority_matrix_activity_log.sql\n')

  const migrationSql = readFileSync(
    join(__dirname, '..', 'docs', 'migrations', '20251231_priority_matrix_activity_log.sql'),
    'utf8'
  )
  console.log(migrationSql)

  console.log('\n📋 Migration SQL has been printed above.')
  console.log('Copy and paste it into the Supabase Dashboard SQL Editor.')
}

applyMigration()
