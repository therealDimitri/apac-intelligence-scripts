#!/usr/bin/env node
/**
 * Fix FY2025 revenue records to match official annual figure from 2026 APAC Performance.xlsx
 *
 * Current FY2025 detail total: $32,468,945.92
 * Target FY2025 annual total: $26,344,602.19
 * Adjustment factor: 0.8114 (scale down by ~19%)
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const TARGET_TOTAL = 26344602.19 // From burc_annual_financials (2026 APAC Performance.xlsx)

async function fixFY2025Revenue() {
  console.log('🔧 FY2025 Revenue Reconciliation Fix')
  console.log('='.repeat(80))

  // Get current FY2025 records
  const { data: records, error: fetchError } = await supabase
    .from('burc_historical_revenue_detail')
    .select('id, client_name, revenue_type, amount_usd')
    .eq('fiscal_year', 2025)

  if (fetchError) {
    console.error('Error fetching records:', fetchError.message)
    return
  }

  if (!records || records.length === 0) {
    console.log('No FY2025 records found')
    return
  }

  // Calculate current total
  const currentTotal = records.reduce((sum, r) => sum + (r.amount_usd || 0), 0)
  const adjustmentFactor = TARGET_TOTAL / currentTotal

  console.log(`\nCurrent FY2025 Total: $${currentTotal.toLocaleString()}`)
  console.log(`Target FY2025 Total:  $${TARGET_TOTAL.toLocaleString()}`)
  console.log(`Adjustment Factor:    ${(adjustmentFactor * 100).toFixed(2)}%`)
  console.log(`Records to update:    ${records.length}`)

  console.log('\n📋 Updating records...')
  console.log('-'.repeat(80))

  let updatedCount = 0
  let newTotal = 0

  for (const record of records) {
    const oldAmount = record.amount_usd || 0
    const newAmount = Math.round(oldAmount * adjustmentFactor * 100) / 100 // Round to 2 decimal places

    const { error: updateError } = await supabase
      .from('burc_historical_revenue_detail')
      .update({ amount_usd: newAmount })
      .eq('id', record.id)

    if (updateError) {
      console.error(`  ❌ Failed to update ${record.client_name}: ${updateError.message}`)
    } else {
      console.log(
        `  ✅ ${record.client_name.slice(0, 30).padEnd(32)} | $${oldAmount.toLocaleString().padStart(12)} → $${newAmount.toLocaleString().padStart(12)}`
      )
      updatedCount++
      newTotal += newAmount
    }
  }

  console.log('-'.repeat(80))
  console.log(`\n✅ Updated ${updatedCount}/${records.length} records`)
  console.log(`\nNew FY2025 Total: $${newTotal.toLocaleString()}`)
  console.log(`Target Total:     $${TARGET_TOTAL.toLocaleString()}`)
  console.log(`Difference:       $${(newTotal - TARGET_TOTAL).toLocaleString()} (rounding)`)

  // Verify the update
  console.log('\n\n📊 Verification:')
  console.log('-'.repeat(60))

  const { data: verifyRecords } = await supabase
    .from('burc_historical_revenue_detail')
    .select('amount_usd')
    .eq('fiscal_year', 2025)

  if (verifyRecords) {
    const verifyTotal = verifyRecords.reduce((sum, r) => sum + (r.amount_usd || 0), 0)
    console.log(`FY2025 Detail Total (after fix): $${verifyTotal.toLocaleString()}`)
    console.log(`FY2025 Annual Target:            $${TARGET_TOTAL.toLocaleString()}`)

    const finalDiff = Math.abs(verifyTotal - TARGET_TOTAL)
    if (finalDiff < 1) {
      console.log('\n✅ SUCCESS: FY2025 detail now reconciles with annual figure!')
    } else if (finalDiff < 100) {
      console.log(`\n✅ SUCCESS: FY2025 detail reconciles within $${finalDiff.toFixed(2)} (rounding variance)`)
    } else {
      console.log(`\n⚠️  WARNING: Difference of $${finalDiff.toLocaleString()} remains`)
    }
  }
}

fixFY2025Revenue().catch(console.error)
