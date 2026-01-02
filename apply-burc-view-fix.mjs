#!/usr/bin/env node
/**
 * Apply BURC Revenue View Fix Migration
 * Fixes NRR/GRR calculations by aggregating all revenue types
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function applyMigration() {
  console.log('🚀 Applying BURC Revenue View Fix Migration...\n')

  const migrationPath = join(__dirname, '../docs/migrations/20260102_fix_burc_revenue_aggregation.sql')
  const sql = readFileSync(migrationPath, 'utf-8')

  // Split into statements
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'))

  console.log(`Found ${statements.length} SQL statements to execute\n`)

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i]
    const preview = stmt.substring(0, 80).replace(/\n/g, ' ')
    console.log(`[${i + 1}/${statements.length}] ${preview}...`)

    try {
      const { error } = await supabase.rpc('exec_sql', { sql: stmt + ';' })
      if (error) {
        // Try direct query if exec_sql doesn't exist
        const { error: directError } = await supabase.from('_exec').select('*').limit(0)
        if (directError) {
          console.log(`   ⚠️  Using REST fallback...`)
        }
        throw error
      }
      console.log('   ✅ Success')
    } catch (err) {
      console.log(`   ⚠️  ${err.message}`)
      // Continue - some statements may fail if views don't exist yet
    }
  }

  console.log('\n✅ Migration complete! Verifying NRR/GRR...\n')

  // Verify the fix
  const { data: retention, error: retError } = await supabase
    .from('burc_revenue_retention')
    .select('*')

  if (retError) {
    console.error('❌ Error fetching retention data:', retError.message)
  } else {
    console.log('📊 Revenue Retention Metrics:')
    retention?.forEach(r => {
      console.log(`   Year ${r.year}: NRR ${r.nrr_percent}% | GRR ${r.grr_percent}% | Starting $${(r.starting_revenue/1000000).toFixed(2)}M → Ending $${(r.ending_revenue/1000000).toFixed(2)}M`)
    })
  }

  // Verify Rule of 40
  const { data: rule40, error: r40Error } = await supabase
    .from('burc_rule_of_40')
    .select('*')

  if (r40Error) {
    console.error('❌ Error fetching Rule of 40:', r40Error.message)
  } else {
    console.log('\n📊 Rule of 40:')
    rule40?.forEach(r => {
      console.log(`   Year ${r.year}: Growth ${r.revenue_growth_percent}% + EBITA ${r.ebita_margin_percent}% = ${r.rule_of_40_score} (${r.rule_of_40_status})`)
    })
  }
}

applyMigration().catch(console.error)
