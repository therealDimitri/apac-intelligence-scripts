#!/usr/bin/env node

/**
 * Apply Email Template Design Studio migration
 * Creates tables: email_templates, brand_kits, email_signatures, email_template_analytics
 * Run: node scripts/apply-email-template-studio-migration.mjs
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { readFileSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
})

// Read migration SQL from file
const migrationPath = join(__dirname, '..', 'docs', 'migrations', '20251225_email_template_studio.sql')
let migrationSQL
try {
  migrationSQL = readFileSync(migrationPath, 'utf-8')
} catch (err) {
  console.error('❌ Could not read migration file:', err.message)
  process.exit(1)
}

async function checkTableExists(tableName) {
  const { error } = await supabase.from(tableName).select('id').limit(1)
  return !error || error.code !== '42P01'
}

async function applyMigration() {
  console.log('🚀 Applying Email Template Design Studio migration...\n')

  // Check if tables already exist
  const emailTemplatesExists = await checkTableExists('email_templates')
  const brandKitsExists = await checkTableExists('brand_kits')
  const signaturesExists = await checkTableExists('email_signatures')
  const analyticsExists = await checkTableExists('email_template_analytics')

  console.log('📊 Table status:')
  console.log(`   email_templates: ${emailTemplatesExists ? '✅ exists' : '❌ needs creation'}`)
  console.log(`   brand_kits: ${brandKitsExists ? '✅ exists' : '❌ needs creation'}`)
  console.log(`   email_signatures: ${signaturesExists ? '✅ exists' : '❌ needs creation'}`)
  console.log(`   email_template_analytics: ${analyticsExists ? '✅ exists' : '❌ needs creation'}`)

  if (emailTemplatesExists && brandKitsExists && signaturesExists && analyticsExists) {
    console.log('\n✅ All tables already exist!')

    // Show counts
    const { count: templatesCount } = await supabase.from('email_templates').select('*', { count: 'exact', head: true })
    const { count: brandKitsCount } = await supabase.from('brand_kits').select('*', { count: 'exact', head: true })
    const { count: signaturesCount } = await supabase.from('email_signatures').select('*', { count: 'exact', head: true })

    console.log(`\n📈 Current data:`)
    console.log(`   Templates: ${templatesCount || 0}`)
    console.log(`   Brand Kits: ${brandKitsCount || 0}`)
    console.log(`   Signatures: ${signaturesCount || 0}`)

    return true
  }

  // Try to create via exec_sql RPC
  console.log('\n⏳ Attempting to create tables via exec_sql RPC...')
  const { error: rpcError } = await supabase.rpc('exec_sql', { query: migrationSQL })

  if (rpcError) {
    console.log('⚠️  RPC not available:', rpcError.message)
    console.log('\n📋 Please run the migration SQL manually in Supabase Dashboard:')
    console.log(`   URL: https://supabase.com/dashboard/project/usoyxsunetvxdjdglkmn/sql/new`)
    console.log(`   File: ${migrationPath}`)

    // Try opening browser
    try {
      const { exec } = await import('child_process')
      exec('open "https://supabase.com/dashboard/project/usoyxsunetvxdjdglkmn/sql/new"')
      console.log('\n🌐 Opening Supabase SQL Editor in browser...')
    } catch {
      // Ignore
    }
    return false
  }

  // Verify tables were created
  console.log('\n🔍 Verifying table creation...')

  const tablesCreated = {
    email_templates: await checkTableExists('email_templates'),
    brand_kits: await checkTableExists('brand_kits'),
    email_signatures: await checkTableExists('email_signatures'),
    email_template_analytics: await checkTableExists('email_template_analytics'),
  }

  const allCreated = Object.values(tablesCreated).every(Boolean)

  if (allCreated) {
    console.log('✅ All tables created successfully!')

    // Check if default brand kit was seeded
    const { data: defaultKit } = await supabase
      .from('brand_kits')
      .select('*')
      .eq('is_default', true)
      .single()

    if (defaultKit) {
      console.log(`\n🎨 Default brand kit seeded: "${defaultKit.name}"`)
    }

    return true
  } else {
    console.log('\n❌ Some tables failed to create:')
    Object.entries(tablesCreated).forEach(([table, exists]) => {
      console.log(`   ${table}: ${exists ? '✅' : '❌'}`)
    })
    return false
  }
}

applyMigration()
  .then(success => {
    if (success) {
      console.log('\n🎉 Migration complete!')
    }
    process.exit(success ? 0 : 1)
  })
  .catch(err => {
    console.error('❌ Error:', err)
    process.exit(1)
  })
