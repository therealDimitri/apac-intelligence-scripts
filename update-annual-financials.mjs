#!/usr/bin/env node
/**
 * Update burc_annual_financials with correct values from source of truth files:
 * - 2024: 2024 APAC Performance.xlsx (Total: $29,351,719)
 * - 2025: 2026 APAC Performance.xlsx (Total: $26,344,602.19) - already correct
 * - 2026: 2026 APAC Performance.xlsx (Total: $33,738,278.35) - already correct
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Source of truth values extracted from Excel files
const CORRECT_VALUES = {
  2024: {
    gross_revenue: 29351719, // From 2024 APAC Performance.xlsx, Row 24 Total column
    source_file: '2024 APAC Performance.xlsx',
    breakdown: {
      licence: 3189829,
      professional_services: 9249757,
      maintenance: 16663942,
      hardware_other: 248190,
    },
  },
  // 2025 and 2026 are already correct from previous analysis
}

async function updateAnnualFinancials() {
  console.log('📊 Updating burc_annual_financials with Source of Truth Values')
  console.log('='.repeat(70))

  // Get current values
  const { data: current } = await supabase
    .from('burc_annual_financials')
    .select('*')
    .order('fiscal_year')

  console.log('\n📋 Current values:')
  console.log('-'.repeat(70))
  console.log('Year     | Current Gross Revenue | Source')
  console.log('-'.repeat(70))
  current?.forEach(row => {
    console.log(
      `FY${row.fiscal_year}  | $${row.gross_revenue?.toLocaleString().padStart(18)} | ${row.source_file || 'N/A'}`
    )
  })

  // Update FY2024
  console.log('\n\n📝 Updating FY2024...')

  const { error: updateError } = await supabase
    .from('burc_annual_financials')
    .update({
      gross_revenue: CORRECT_VALUES[2024].gross_revenue,
      source_file: CORRECT_VALUES[2024].source_file,
      updated_at: new Date().toISOString(),
    })
    .eq('fiscal_year', 2024)

  if (updateError) {
    console.error('Error updating FY2024:', updateError.message)

    // Try insert if update failed
    const { error: insertError } = await supabase.from('burc_annual_financials').upsert({
      fiscal_year: 2024,
      gross_revenue: CORRECT_VALUES[2024].gross_revenue,
      source_file: CORRECT_VALUES[2024].source_file,
      updated_at: new Date().toISOString(),
    })

    if (insertError) {
      console.error('Error inserting FY2024:', insertError.message)
    } else {
      console.log('✅ FY2024 inserted successfully')
    }
  } else {
    console.log('✅ FY2024 updated: $36,004,016.52 → $29,351,719')
  }

  // Verify updates
  console.log('\n\n📊 Verified values:')
  console.log('-'.repeat(70))

  const { data: verified } = await supabase
    .from('burc_annual_financials')
    .select('*')
    .order('fiscal_year')

  console.log('Year     | Gross Revenue        | Source')
  console.log('-'.repeat(70))
  verified?.forEach(row => {
    console.log(
      `FY${row.fiscal_year}  | $${row.gross_revenue?.toLocaleString().padStart(18)} | ${row.source_file || 'N/A'}`
    )
  })

  // Show breakdown for FY2024
  console.log('\n\n📋 FY2024 Revenue Breakdown (from source file):')
  console.log('-'.repeat(50))
  const b = CORRECT_VALUES[2024].breakdown
  console.log(`Licence:               $${b.licence.toLocaleString().padStart(12)}`)
  console.log(`Professional Services: $${b.professional_services.toLocaleString().padStart(12)}`)
  console.log(`Maintenance:           $${b.maintenance.toLocaleString().padStart(12)}`)
  console.log(`Hardware/Other:        $${b.hardware_other.toLocaleString().padStart(12)}`)
  console.log('-'.repeat(50))
  const total = b.licence + b.professional_services + b.maintenance + b.hardware_other
  console.log(`Total:                 $${total.toLocaleString().padStart(12)}`)
}

updateAnnualFinancials().catch(console.error)
