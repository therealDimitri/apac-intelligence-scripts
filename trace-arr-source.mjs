#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function main() {
  // Check waterfall for Total ARR source
  const { data: waterfall } = await supabase
    .from('burc_waterfall')
    .select('*')
    .order('sort_order')

  console.log('=== BURC Waterfall Items ===')
  let total = 0
  waterfall?.forEach(w => {
    console.log(`${w.category}: $${(w.amount / 1000000).toFixed(2)}M`)
    const cat = w.category.toLowerCase()
    if (cat.indexOf('cogs') === -1 && cat.indexOf('opex') === -1 && cat.indexOf('target') === -1 && cat.indexOf('fx') === -1) {
      total += w.amount
    }
  })
  console.log(`\nNon-cost items total: $${(total / 1000000).toFixed(2)}M`)

  // Check the view definition for total_arr
  console.log('\n=== Checking where Total ARR comes from ===')

  // The view probably calculates from committed + best_case
  const committed = waterfall?.find(w => w.category === 'committed_gross_rev')?.amount || 0
  const backlog = waterfall?.find(w => w.category === 'backlog_runrate')?.amount || 0
  const bcPS = waterfall?.find(w => w.category === 'best_case_ps')?.amount || 0
  const bcMaint = waterfall?.find(w => w.category === 'best_case_maint')?.amount || 0
  const pipeline = (waterfall?.find(w => w.category === 'pipeline_sw')?.amount || 0) +
                   (waterfall?.find(w => w.category === 'pipeline_ps')?.amount || 0)
  const other = waterfall?.find(w => w.category === 'other_rev')?.amount || 0

  console.log(`Committed Gross Rev: $${(committed / 1000000).toFixed(2)}M`)
  console.log(`Backlog Runrate: $${(backlog / 1000000).toFixed(2)}M`)
  console.log(`Best Case PS: $${(bcPS / 1000000).toFixed(2)}M`)
  console.log(`Best Case Maint: $${(bcMaint / 1000000).toFixed(2)}M`)
  console.log(`Pipeline: $${(pipeline / 1000000).toFixed(2)}M`)
  console.log(`Other: $${(other / 1000000).toFixed(2)}M`)

  // This might be Total ARR
  console.log('\n=== Possible Total ARR calculations ===')
  console.log(`Backlog only: $${(backlog / 1000000).toFixed(2)}M`)
  console.log(`Backlog + Committed: $${((backlog + committed) / 1000000).toFixed(2)}M`)
  console.log(`Backlog + Committed + Best Case: $${((backlog + committed + bcPS + bcMaint) / 1000000).toFixed(2)}M`)
  console.log(`All revenue items: $${((backlog + committed + bcPS + bcMaint + pipeline + other) / 1000000).toFixed(2)}M`)

  // The Executive Summary shows $34.27M - let's see if we can match it
  const targetARR = 34268986.4
  console.log(`\nTarget to match: $${(targetARR / 1000000).toFixed(2)}M`)

  // Check if it's the total pipeline
  const { data: summary } = await supabase
    .from('burc_executive_summary')
    .select('*')
    .single()

  console.log('\n=== Executive Summary View Values ===')
  console.log(`total_arr: $${(summary?.total_arr / 1000000).toFixed(2)}M`)
  console.log(`total_pipeline: $${(summary?.total_pipeline / 1000000).toFixed(2)}M`)
  console.log(`weighted_pipeline: $${(summary?.weighted_pipeline / 1000000).toFixed(2)}M`)
  console.log(`total_contract_value: $${(summary?.total_contract_value / 1000000).toFixed(2)}M`)

  // The total_arr might just be one of the waterfall values
  console.log('\n=== Searching for $34.27M source ===')
  if (Math.abs(committed + backlog - targetARR) < 100000) {
    console.log('✅ MATCH: total_arr = backlog_runrate + committed_gross_rev')
  } else if (Math.abs(backlog + committed + bcPS + bcMaint - targetARR) < 100000) {
    console.log('✅ MATCH: total_arr = backlog + committed + best_case (PS + Maint)')
  } else {
    console.log('❓ Could not determine exact source')
    console.log(`   Closest match: backlog + committed = $${((backlog + committed) / 1000000).toFixed(2)}M`)
    console.log(`   Difference: $${((Math.abs(backlog + committed - targetARR)) / 1000000).toFixed(2)}M`)
  }
}

main().catch(console.error)
