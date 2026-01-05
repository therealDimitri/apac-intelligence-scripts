#!/usr/bin/env node
/**
 * Apply BURC Pipeline Sections Migration
 * Adds section_color, pipeline_status, in_forecast columns
 */

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

async function applyMigration() {
  console.log('🚀 Applying BURC Pipeline Sections Migration...\n')

  // Step 1: Check if columns already exist by trying to query them
  console.log('1️⃣ Checking existing schema...')
  const { data: testData, error: testError } = await supabase
    .from('burc_pipeline_detail')
    .select('section_color, pipeline_status, in_forecast')
    .limit(1)

  if (testError && testError.message.includes('column')) {
    console.log('   Columns do not exist yet - need SQL migration')
    console.log('\n⚠️ Please run the following SQL in Supabase SQL Editor:')
    console.log('   File: docs/migrations/20260105_burc_pipeline_sections.sql')
    console.log('\n   Or run these commands:')
    console.log(`
ALTER TABLE burc_pipeline_detail ADD COLUMN IF NOT EXISTS section_color VARCHAR(20) DEFAULT 'pipeline';
ALTER TABLE burc_pipeline_detail ADD COLUMN IF NOT EXISTS pipeline_status VARCHAR(30) DEFAULT 'active';
ALTER TABLE burc_pipeline_detail ADD COLUMN IF NOT EXISTS in_forecast BOOLEAN DEFAULT false;
ALTER TABLE burc_pipeline_detail ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE burc_pipeline_detail ADD COLUMN IF NOT EXISTS last_updated TIMESTAMPTZ DEFAULT NOW();
    `)
    return
  }

  console.log('   ✅ Columns already exist\n')

  // Step 2: Update section_color based on probability
  console.log('2️⃣ Updating section_color based on probability...')

  const { data: deals } = await supabase
    .from('burc_pipeline_detail')
    .select('id, probability, section_color')
    .eq('fiscal_year', 2026)

  if (deals && deals.length > 0) {
    const updates = deals.map(d => {
      let section_color = 'pipeline'
      let in_forecast = false

      if (d.probability >= 0.85) {
        section_color = 'green'
        in_forecast = true
      } else if (d.probability >= 0.45) {
        section_color = 'yellow'
        in_forecast = true
      } else if (d.probability >= 0.25) {
        section_color = 'pipeline'
        in_forecast = false
      } else {
        section_color = 'red'
        in_forecast = false
      }

      return { id: d.id, section_color, in_forecast, pipeline_status: 'active' }
    })

    // Update in batches
    for (let i = 0; i < updates.length; i += 50) {
      const batch = updates.slice(i, i + 50)
      for (const update of batch) {
        await supabase
          .from('burc_pipeline_detail')
          .update({
            section_color: update.section_color,
            in_forecast: update.in_forecast,
            pipeline_status: update.pipeline_status
          })
          .eq('id', update.id)
      }
    }

    console.log(`   ✅ Updated ${updates.length} deals\n`)

    // Summary
    const summary = {
      green: updates.filter(u => u.section_color === 'green').length,
      yellow: updates.filter(u => u.section_color === 'yellow').length,
      pipeline: updates.filter(u => u.section_color === 'pipeline').length,
      red: updates.filter(u => u.section_color === 'red').length
    }

    console.log('3️⃣ Section Summary:')
    console.log(`   🟢 Green (90%): ${summary.green} deals`)
    console.log(`   🟡 Yellow (50%): ${summary.yellow} deals`)
    console.log(`   📊 Pipeline (30%): ${summary.pipeline} deals`)
    console.log(`   🔴 Red (20%): ${summary.red} deals`)
  }

  console.log('\n✅ Migration complete!')
}

applyMigration().catch(console.error)
