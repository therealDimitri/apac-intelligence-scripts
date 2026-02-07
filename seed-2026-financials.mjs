#!/usr/bin/env node
/**
 * Seed 2026 Financial Data
 *
 * Imports data from the 2026 APAC Performance Excel file into:
 * - client_financials: Revenue breakdown by client
 * - contract_renewals: Opal maintenance contracts
 * - attrition_risk: Known attrition risks
 * - business_case_pipeline: SA Health business cases
 */

import { createClient } from '@supabase/supabase-js'
import XLSX from 'xlsx'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
})

const excelPath = '/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth/APAC Leadership Team - General/Performance/Financials/BURC/2026/Budget Planning/2026 APAC Performance.xlsx'

async function seedData() {
  console.log('🚀 Seeding 2026 Financial Data...\n')

  // Read Excel file
  console.log('📊 Reading Excel file...')
  const workbook = XLSX.readFile(excelPath)

  // =========================================================
  // 1. SEED CLIENT FINANCIALS (from Maint Pivot sheet)
  // =========================================================
  console.log('\n📝 Seeding client_financials...\n')

  // Annual maintenance revenue by client (from Maint Pivot)
  const clientFinancials = [
    { client_name: 'SA Health', revenue_maintenance: 6538846, primary_solution: 'Sunrise' },
    { client_name: 'SingHealth', revenue_maintenance: 4689528, primary_solution: 'Sunrise' },
    { client_name: 'GHA', revenue_maintenance: 1626506, primary_solution: 'Sunrise' },
    { client_name: 'SLMC', revenue_maintenance: 677311, primary_solution: 'Sunrise' },
    { client_name: 'GRMC', revenue_maintenance: 581061, primary_solution: 'Sunrise' },
    { client_name: 'NCS', revenue_maintenance: 528145, primary_solution: 'Sunrise' },
    { client_name: 'Waikato', revenue_maintenance: 320002, primary_solution: 'iPro' },
    { client_name: 'MAH', revenue_maintenance: 302673, primary_solution: 'Sunrise' },
    { client_name: 'BWH', revenue_maintenance: 249286, primary_solution: 'Opal' },
    { client_name: 'Parkway', revenue_maintenance: 193889, primary_solution: 'Sunrise' },
    { client_name: 'EPH', revenue_maintenance: 181704, primary_solution: 'Opal' },
    { client_name: 'GHRA', revenue_maintenance: 181347, primary_solution: 'Opal' },
    { client_name: 'AWH', revenue_maintenance: 133730, primary_solution: 'Opal' },
    { client_name: 'Western Health', revenue_maintenance: 88967, primary_solution: 'Opal' },
    { client_name: 'RVEEH', revenue_maintenance: 77435, primary_solution: 'Opal' },
    { client_name: 'WA Health', revenue_maintenance: 577935, primary_solution: 'Opal' },
  ]

  for (const client of clientFinancials) {
    const { error } = await supabase.from('client_financials').upsert({
      client_name: client.client_name,
      fiscal_year: 2026,
      fiscal_quarter: null, // Annual total
      revenue_maintenance: client.revenue_maintenance,
      revenue_category: 'backlog',
      primary_solution: client.primary_solution,
      source_document: '2026 APAC Performance.xlsx'
    }, {
      onConflict: 'client_name,fiscal_year,fiscal_quarter,revenue_category'
    })

    if (error) {
      console.log(`   ❌ ${client.client_name}: ${error.message}`)
    } else {
      console.log(`   ✅ ${client.client_name}: $${client.revenue_maintenance.toLocaleString()}`)
    }
  }

  // =========================================================
  // 2. SEED CONTRACT RENEWALS (from Opal Maint Contracts sheet)
  // =========================================================
  console.log('\n📝 Seeding contract_renewals...\n')

  const contractRenewals = [
    {
      client_name: 'AWH',
      contract_type: 'maintenance',
      solution: 'Opal',
      renewal_date: '2026-10-22',
      contract_end_date: '2026-10-22',
      annual_value: 140692,
      cpi_increase_percent: 5,
      notes: 'Table of charges in extension. CPI can be added'
    },
    {
      client_name: 'BWH',
      contract_type: 'maintenance',
      solution: 'Opal',
      renewal_date: '2026-09-22',
      contract_end_date: '2026-09-22',
      annual_value: 223641,
      cpi_increase_percent: 0,
      notes: '12-month autorenewal annually from 01-Oct-2024',
      auto_renewal: true
    },
    {
      client_name: 'Epworth Healthcare',
      contract_type: 'maintenance',
      solution: 'Opal',
      renewal_date: '2025-11-26',
      contract_end_date: '2025-11-26',
      annual_value: 149908,
      oracle_agreement_number: 'K'
    },
    {
      client_name: 'GHA',
      contract_type: 'maintenance',
      solution: 'Opal',
      renewal_date: '2025-07-03',
      contract_end_date: '2025-07-03',
      annual_value: 124838,
      notes: 'If consolidation done then will not renew'
    },
    {
      client_name: 'Grampians Health',
      contract_type: 'maintenance',
      solution: 'Opal',
      renewal_date: '2025-10-06',
      contract_end_date: '2025-10-06',
      annual_value: 145466,
      notes: 'includes one year auto-renewal',
      auto_renewal: true
    },
    {
      client_name: 'WA Health',
      contract_type: 'maintenance',
      solution: 'Opal',
      renewal_date: '2026-08-09',
      contract_end_date: '2026-08-09',
      annual_value: 459638,
      oracle_agreement_number: 'J3',
      notes: 'Table in contract defines base charges for sites'
    },
    {
      client_name: 'Western Health',
      contract_type: 'maintenance',
      solution: 'Opal',
      renewal_date: '2026-06-10',
      contract_end_date: '2026-06-10',
      annual_value: 126444,
      cpi_increase_percent: 4,
      oracle_agreement_number: 'M',
      notes: '4% index applied in table and includes additional sites'
    },
    {
      client_name: 'RVEEH',
      contract_type: 'maintenance',
      solution: 'Opal',
      renewal_date: '2025-01-08',
      contract_end_date: '2025-01-08',
      annual_value: 29051,
      cpi_increase_percent: 4,
      notes: '4% CPI to be applied year on year. Term is 1 Jul to 31 Dec'
    }
  ]

  for (const contract of contractRenewals) {
    const { error } = await supabase.from('contract_renewals').insert({
      ...contract,
      renewal_status: 'pending',
      renewal_probability: 80
    })

    if (error && !error.message.includes('duplicate')) {
      console.log(`   ❌ ${contract.client_name}: ${error.message}`)
    } else {
      console.log(`   ✅ ${contract.client_name}: $${contract.annual_value.toLocaleString()} (${contract.solution})`)
    }
  }

  // =========================================================
  // 3. SEED ATTRITION RISK (from Attrition sheet)
  // =========================================================
  console.log('\n📝 Seeding attrition_risk...\n')

  const attritionRisks = [
    {
      client_name: 'Parkway',
      attrition_type: 'full',
      forecast_date: '2025-10-06',
      forecast_quarter: 'Q4 2025',
      fiscal_year: 2026,
      revenue_at_risk: 646000,
      revenue_2025_impact: 92000,
      revenue_2026_impact: 554000,
      risk_level: 'critical',
      probability: 95,
      affected_solutions: ['Sunrise'],
      attrition_reason: 'Contract end - not renewing'
    },
    {
      client_name: 'GHA Regional',
      attrition_type: 'partial',
      forecast_date: '2026-06-19',
      forecast_quarter: 'Q2 2026',
      fiscal_year: 2026,
      revenue_at_risk: 200000,
      revenue_2026_impact: 83000,
      revenue_2027_impact: 117000,
      risk_level: 'high',
      probability: 70,
      affected_solutions: ['Opal'],
      attrition_reason: 'Opal consolidation'
    },
    {
      client_name: 'SingHealth KKH',
      attrition_type: 'partial',
      forecast_date: '2026-10-19',
      forecast_quarter: 'Q4 2026',
      fiscal_year: 2026,
      revenue_at_risk: 18000,
      revenue_2026_impact: 18000,
      risk_level: 'medium',
      probability: 60,
      affected_solutions: ['iPro', 'Capsule'],
      attrition_reason: 'iPro and Capsule phase-out'
    },
    {
      client_name: 'SingHealth SGH/NHCS',
      attrition_type: 'partial',
      forecast_date: '2027-04-19',
      forecast_quarter: 'Q2 2027',
      fiscal_year: 2027,
      revenue_at_risk: 330000,
      revenue_2026_impact: 120000,
      revenue_2027_impact: 210000,
      risk_level: 'high',
      probability: 75,
      affected_solutions: ['iPro', 'Capsule'],
      attrition_reason: 'iPro and Capsule phase-out'
    },
    {
      client_name: 'SingHealth CGH',
      attrition_type: 'partial',
      forecast_date: '2027-10-19',
      forecast_quarter: 'Q4 2027',
      fiscal_year: 2027,
      revenue_at_risk: 85000,
      revenue_2026_impact: 12000,
      revenue_2027_impact: 73000,
      risk_level: 'medium',
      probability: 60,
      affected_solutions: ['iPro', 'Capsule'],
      attrition_reason: 'iPro and Capsule phase-out'
    },
    {
      client_name: 'SingHealth SKH',
      attrition_type: 'partial',
      forecast_date: '2027-10-19',
      forecast_quarter: 'Q4 2027',
      fiscal_year: 2027,
      revenue_at_risk: 156000,
      revenue_2026_impact: 22000,
      revenue_2027_impact: 134000,
      risk_level: 'medium',
      probability: 60,
      affected_solutions: ['iPro', 'Capsule'],
      attrition_reason: 'iPro and Capsule phase-out'
    },
    {
      client_name: 'SingHealth Sunrise',
      attrition_type: 'full',
      forecast_date: '2028-07-28',
      forecast_quarter: 'Q3 2028',
      fiscal_year: 2028,
      revenue_at_risk: 1122000,
      revenue_2028_impact: 1122000,
      risk_level: 'critical',
      probability: 85,
      affected_solutions: ['Sunrise'],
      attrition_reason: 'Full Sunrise exit'
    }
  ]

  for (const risk of attritionRisks) {
    const { error } = await supabase.from('attrition_risk').insert({
      ...risk,
      status: 'identified',
      source_document: '2026 APAC Performance.xlsx'
    })

    if (error && !error.message.includes('duplicate')) {
      console.log(`   ❌ ${risk.client_name}: ${error.message}`)
    } else {
      console.log(`   ✅ ${risk.client_name}: $${risk.revenue_at_risk.toLocaleString()} at risk (${risk.risk_level})`)
    }
  }

  // =========================================================
  // 4. SEED BUSINESS CASE PIPELINE (from APAC Initiative sheet)
  // =========================================================
  console.log('\n📝 Seeding business_case_pipeline...\n')

  const businessCases = [
    {
      business_case_code: 'BC001',
      business_case_name: 'SA Health Renal',
      client_name: 'SA Health',
      solution: 'Sunrise',
      revenue_professional_services: 1378507,
      revenue_maintenance: 214461,
      gate_1_date: '2025-05-31',
      gate_1_criteria: 'Workshop with SA Health conducted and agreed Client Roadmap',
      gate_2_date: '2025-12-31',
      scenario: 'base',
      status: 'active'
    },
    {
      business_case_code: 'BC002',
      business_case_name: 'SA Health Meds Management',
      client_name: 'SA Health',
      solution: 'Sunrise',
      revenue_software: 1908790,
      revenue_professional_services: 1094400,
      revenue_maintenance: 902460,
      gate_1_date: '2025-05-31',
      gate_1_criteria: 'SAH continue PS Staff Augmentation contract',
      gate_2_date: '2025-12-31',
      scenario: 'base',
      status: 'active',
      notes: 'SW Payment milestones = 40% lic only'
    },
    {
      business_case_code: 'BC008',
      business_case_name: 'SA Health Sunrise AI Scribe Connector',
      client_name: 'SA Health',
      solution: 'Sunrise',
      revenue_professional_services: 60000,
      revenue_maintenance: 50000,
      scenario: 'base',
      status: 'active'
    },
    {
      business_case_code: 'BC009',
      business_case_name: 'APAC Sunrise AI Scribe Connector',
      client_name: 'APAC',
      solution: 'Sunrise',
      revenue_professional_services: 60000,
      revenue_maintenance: 50000,
      scenario: 'base',
      status: 'active'
    },
    {
      business_case_code: 'BC010',
      business_case_name: 'SA Health Referral Workflow',
      client_name: 'SA Health',
      solution: 'Sunrise',
      revenue_professional_services: 60000,
      revenue_maintenance: 50000,
      scenario: 'base',
      status: 'active'
    },
    {
      business_case_code: 'BC014',
      business_case_name: 'GHA SCM PBS Prescription Pad',
      client_name: 'GHA',
      solution: 'Sunrise',
      revenue_professional_services: 60000,
      revenue_maintenance: 100000,
      scenario: 'base',
      status: 'active'
    }
  ]

  for (const bc of businessCases) {
    const { error } = await supabase.from('business_case_pipeline').insert({
      ...bc,
      current_gate: 0
    })

    if (error && !error.message.includes('duplicate')) {
      console.log(`   ❌ ${bc.business_case_code}: ${error.message}`)
    } else {
      const totalRev = (bc.revenue_software || 0) + (bc.revenue_professional_services || 0) + (bc.revenue_maintenance || 0)
      console.log(`   ✅ ${bc.business_case_code} - ${bc.business_case_name}: $${totalRev.toLocaleString()}`)
    }
  }

  // =========================================================
  // SUMMARY
  // =========================================================
  console.log('\n' + '='.repeat(60))
  console.log('📊 Seed Summary')
  console.log('='.repeat(60))

  // Count records
  const counts = await Promise.all([
    supabase.from('client_financials').select('id', { count: 'exact' }),
    supabase.from('contract_renewals').select('id', { count: 'exact' }),
    supabase.from('attrition_risk').select('id', { count: 'exact' }),
    supabase.from('business_case_pipeline').select('id', { count: 'exact' })
  ])

  console.log(`\n✅ client_financials: ${counts[0].count || 0} records`)
  console.log(`✅ contract_renewals: ${counts[1].count || 0} records`)
  console.log(`✅ attrition_risk: ${counts[2].count || 0} records`)
  console.log(`✅ business_case_pipeline: ${counts[3].count || 0} records`)

  console.log('\n✨ Seed complete!\n')
}

seedData().catch(err => {
  console.error('❌ Error:', err)
  process.exit(1)
})
