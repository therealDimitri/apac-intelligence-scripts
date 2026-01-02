#!/usr/bin/env node
/**
 * Verify BURC KPI Data
 */

import { createClient } from '@supabase/supabase-js'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function verify() {
  console.log('📊 BURC KPI Verification\n')
  console.log('=' .repeat(60))

  // Executive Summary
  console.log('\n📈 Executive Summary:')
  const { data: exec } = await supabase.from('burc_executive_summary').select('*')
  if (exec?.[0]) {
    const e = exec[0]
    console.log(`   NRR: ${e.nrr_percent}% (${e.nrr_health})`)
    console.log(`   GRR: ${e.grr_percent}% (${e.grr_health})`)
    console.log(`   Rule of 40: ${e.rule_of_40_score} (${e.rule_of_40_status})`)
    console.log(`   Active Contracts: ${e.active_contracts} ($${(e.total_contract_value/1e6).toFixed(1)}M)`)
    console.log(`   Pipeline: $${(e.total_pipeline/1e6).toFixed(1)}M (Weighted: $${(e.weighted_pipeline/1e6).toFixed(1)}M)`)
    console.log(`   Attrition Risk: $${(e.total_at_risk/1e6).toFixed(1)}M (${e.attrition_risk_count} accounts)`)
  }

  // Revenue Retention by Year
  console.log('\n📉 Revenue Retention by Year:')
  const { data: retention } = await supabase.from('burc_revenue_retention').select('*').order('year')
  for (const r of retention || []) {
    console.log(`   ${r.year}: NRR ${r.nrr_percent}% | GRR ${r.grr_percent}% | Churn $${(r.churn/1e3).toFixed(0)}K`)
  }

  // Rule of 40 by Year
  console.log('\n🎯 Rule of 40 by Year:')
  const { data: rule40 } = await supabase.from('burc_rule_of_40').select('*').order('year')
  for (const r of rule40 || []) {
    console.log(`   ${r.year}: Growth ${r.revenue_growth_percent}% + EBITA ${r.ebita_margin_percent}% = ${r.rule_of_40_score} (${r.rule_of_40_status})`)
  }

  // Attrition Summary
  console.log('\n⚠️  Attrition Summary:')
  const { data: attrition } = await supabase.from('burc_attrition_summary').select('*')
  for (const a of attrition || []) {
    console.log(`   ${a.status}: ${a.risk_count} risks, $${(a.total_at_risk_all_years/1e3).toFixed(0)}K total`)
  }

  // Pipeline by Stage
  console.log('\n💼 Pipeline by Stage:')
  const { data: pipeline } = await supabase.from('burc_pipeline_by_stage').select('*')
  for (const p of pipeline || []) {
    console.log(`   ${p.forecast_category || 'Unknown'}: ${p.opportunity_count} opps, $${(p.total_value/1e3).toFixed(0)}K (Weighted: $${(p.weighted_value/1e3).toFixed(0)}K)`)
  }

  // Renewal Calendar
  console.log('\n📅 Upcoming Renewals:')
  const { data: renewals } = await supabase.from('burc_renewal_calendar').select('*').limit(5)
  for (const r of renewals || []) {
    console.log(`   ${r.renewal_period}: ${r.contract_count} contracts, $${(r.total_value_usd/1e3).toFixed(0)}K USD`)
  }

  console.log('\n' + '='.repeat(60))
  console.log('✅ Verification complete!')
}

verify().catch(console.error)
