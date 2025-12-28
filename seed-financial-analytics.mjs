#!/usr/bin/env node

/**
 * Seed Financial Analytics Tables
 *
 * Populates the enhanced financial analytics tables with sample data
 * for development and testing purposes.
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

const currentYear = 2026
const currentMonth = 1

// Sample data generators
function generateSalesPipeline() {
  const stages = ['prospect', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost']
  return stages.map((stage, index) => ({
    year: currentYear,
    month: currentMonth,
    stage,
    deal_count: Math.floor(Math.random() * 20) + 5,
    total_value: Math.floor(Math.random() * 1000000) + 100000,
    weighted_value: Math.floor(Math.random() * 500000) + 50000,
    avg_deal_size: Math.floor(Math.random() * 50000) + 10000,
    avg_days_in_stage: Math.floor(Math.random() * 30) + 5,
    conversion_rate: Math.random() * 0.5 + 0.1,
  }))
}

function generateLicenceBookings() {
  return {
    year: currentYear,
    month: currentMonth,
    new_bookings_acv: 450000,
    renewal_bookings_acv: 800000,
    expansion_bookings_acv: 150000,
    total_bookings_acv: 1400000,
    deals_closed: 12,
    avg_deal_size: 116667,
    win_rate: 35.5,
    sales_cycle_days: 45,
  }
}

function generateMaintenanceChurn() {
  return {
    year: currentYear,
    month: currentMonth,
    starting_arr: 12000000,
    churned_arr: 80000,
    downgrade_arr: 20000,
    upgrade_arr: 50000,
    new_arr: 120000,
    ending_arr: 12070000,
    gross_churn_rate: 0.83,
    net_churn_rate: 0.33,
    customer_count_start: 150,
    customer_count_end: 152,
    customers_churned: 2,
  }
}

function generateHeadcount() {
  const departments = [
    { dept: 'ps', fte: 25, contractors: 5, open: 3 },
    { dept: 'sales', fte: 15, contractors: 2, open: 2 },
    { dept: 'marketing', fte: 8, contractors: 1, open: 1 },
    { dept: 'rd', fte: 35, contractors: 8, open: 5 },
    { dept: 'support', fte: 12, contractors: 2, open: 1 },
    { dept: 'ga', fte: 10, contractors: 1, open: 0 },
    { dept: 'management', fte: 8, contractors: 0, open: 0 },
  ]

  return departments.map(d => ({
    year: currentYear,
    month: currentMonth,
    department: d.dept,
    fte_count: d.fte,
    contractor_count: d.contractors,
    total_headcount: d.fte + d.contractors,
    open_positions: d.open,
    attrition_count: Math.floor(Math.random() * 2),
    new_hires: Math.floor(Math.random() * 3),
    avg_tenure_months: Math.floor(Math.random() * 36) + 12,
    cost_per_head: Math.floor(Math.random() * 50000) + 80000,
  }))
}

function generatePSUtilisation() {
  return {
    year: currentYear,
    month: currentMonth,
    total_available_hours: 4200,
    billable_hours: 3150,
    non_billable_hours: 1050,
    utilisation_rate: 75,
    target_utilisation: 80,
    billable_headcount: 25,
    avg_bill_rate: 175,
    revenue_per_consultant: 22050,
    backlog_hours: 8500,
    backlog_value: 1487500,
  }
}

function generateRDAllocation() {
  const projects = [
    { name: 'Next Gen Platform', type: 'new_product', spend: 450000, headcount: 12 },
    { name: 'Mobile App Enhancement', type: 'enhancement', spend: 280000, headcount: 8 },
    { name: 'Security Updates', type: 'maintenance', spend: 150000, headcount: 5 },
    { name: 'Legacy Modernisation', type: 'technical_debt', spend: 120000, headcount: 4 },
    { name: 'AI/ML Research', type: 'research', spend: 100000, headcount: 3 },
  ]

  const totalSpend = projects.reduce((sum, p) => sum + p.spend, 0)

  return projects.map(p => ({
    year: currentYear,
    month: currentMonth,
    project_name: p.name,
    project_type: p.type,
    headcount_allocated: p.headcount,
    spend_allocated: p.spend,
    percent_of_total: (p.spend / totalSpend) * 100,
    status: 'active',
    expected_revenue_impact: p.spend * 3,
  }))
}

function generateProductARR() {
  const products = [
    { name: 'MedSuite Enterprise', licence: 3500000, maint: 2100000, ps: 500000 },
    { name: 'LabConnect Pro', licence: 2200000, maint: 1320000, ps: 300000 },
    { name: 'PatientPortal', licence: 1800000, maint: 1080000, ps: 200000 },
    { name: 'Analytics Plus', licence: 1200000, maint: 720000, ps: 150000 },
    { name: 'Mobile Health', licence: 800000, maint: 480000, ps: 100000 },
  ]

  return products.map(p => ({
    year: currentYear,
    month: currentMonth,
    product_line: p.name,
    licence_arr: p.licence,
    maintenance_arr: p.maint,
    ps_revenue: p.ps,
    total_arr: p.licence + p.maint,
    customer_count: Math.floor(Math.random() * 30) + 10,
    avg_arr_per_customer: Math.floor((p.licence + p.maint) / (Math.random() * 30 + 10)),
    growth_rate_yoy: (Math.random() * 30) - 5,
  }))
}

function generateCustomerHealth() {
  const segments = ['enterprise', 'mid_market', 'smb']
  return segments.map(seg => ({
    year: currentYear,
    month: currentMonth,
    segment: seg,
    total_customers: seg === 'enterprise' ? 25 : seg === 'mid_market' ? 55 : 75,
    healthy_customers: seg === 'enterprise' ? 20 : seg === 'mid_market' ? 45 : 60,
    at_risk_customers: seg === 'enterprise' ? 3 : seg === 'mid_market' ? 7 : 10,
    churned_customers: seg === 'enterprise' ? 2 : seg === 'mid_market' ? 3 : 5,
    nps_score: seg === 'enterprise' ? 45 : seg === 'mid_market' ? 38 : 32,
    csat_score: seg === 'enterprise' ? 4.2 : seg === 'mid_market' ? 3.9 : 3.6,
    avg_health_score: seg === 'enterprise' ? 78 : seg === 'mid_market' ? 72 : 65,
    retention_rate: seg === 'enterprise' ? 96 : seg === 'mid_market' ? 92 : 88,
    expansion_rate: seg === 'enterprise' ? 15 : seg === 'mid_market' ? 10 : 5,
  }))
}

function generateSupportMetrics() {
  return {
    year: currentYear,
    month: currentMonth,
    tickets_opened: 450,
    tickets_closed: 420,
    tickets_escalated: 25,
    avg_resolution_hours: 18,
    first_response_hours: 2,
    customer_satisfaction: 4.1,
    tickets_per_customer: 2.9,
    cost_per_ticket: 85,
    p1_tickets: 15,
    p2_tickets: 45,
  }
}

function generateCostCentre() {
  const items = [
    { dept: 'ps', cat: 'salaries', amt: 250000, disc: false, var: true },
    { dept: 'ps', cat: 'travel', amt: 35000, disc: true, var: true },
    { dept: 'sales', cat: 'salaries', amt: 180000, disc: false, var: true },
    { dept: 'sales', cat: 'marketing', amt: 50000, disc: true, var: true },
    { dept: 'rd', cat: 'salaries', amt: 420000, disc: false, var: true },
    { dept: 'rd', cat: 'software', amt: 25000, disc: true, var: false },
    { dept: 'rd', cat: 'cloud', amt: 45000, disc: false, var: true },
    { dept: 'support', cat: 'salaries', amt: 140000, disc: false, var: true },
    { dept: 'ga', cat: 'salaries', amt: 110000, disc: false, var: true },
    { dept: 'ga', cat: 'facilities', amt: 65000, disc: false, var: false },
  ]

  return items.map(i => ({
    year: currentYear,
    month: currentMonth,
    department: i.dept,
    cost_category: i.cat,
    amount: i.amt,
    is_discretionary: i.disc,
    is_variable: i.var,
    budget_amount: i.amt * (1 + (Math.random() * 0.2 - 0.1)),
    variance_amount: i.amt * (Math.random() * 0.2 - 0.1),
    variance_percent: (Math.random() * 20 - 10),
  }))
}

function generateCloudCosts() {
  const items = [
    { provider: 'aws', service: 'compute', cost: 25000 },
    { provider: 'aws', service: 'storage', cost: 8000 },
    { provider: 'aws', service: 'database', cost: 12000 },
    { provider: 'azure', service: 'compute', cost: 15000 },
    { provider: 'azure', service: 'ai_ml', cost: 5000 },
  ]

  return items.map(i => ({
    year: currentYear,
    month: currentMonth,
    provider: i.provider,
    service_type: i.service,
    cost: i.cost,
    usage_units: Math.floor(Math.random() * 10000) + 1000,
    cost_per_unit: i.cost / (Math.floor(Math.random() * 10000) + 1000),
    budget_amount: i.cost * 1.1,
    yoy_growth_percent: (Math.random() * 30) - 5,
  }))
}

function generateProposalActivity() {
  return {
    year: currentYear,
    month: currentMonth,
    proposals_sent: 18,
    proposals_value: 2500000,
    proposals_won: 6,
    proposals_lost: 4,
    proposals_pending: 8,
    avg_proposal_value: 138889,
    win_rate: 33.3,
    avg_days_to_decision: 28,
  }
}

function generateRenewalPipeline() {
  return {
    year: currentYear,
    quarter: 1,
    contracts_due: 25,
    arr_due: 3200000,
    renewed_count: 15,
    renewed_arr: 1920000,
    churned_count: 2,
    churned_arr: 180000,
    pending_count: 8,
    pending_arr: 1100000,
    early_renewal_count: 5,
    expansion_arr: 120000,
  }
}

function generateImplementationBacklog() {
  return {
    year: currentYear,
    month: currentMonth,
    total_backlog_hours: 8500,
    total_backlog_value: 1487500,
    projects_in_backlog: 18,
    avg_project_size_hours: 472,
    projects_starting_next_30_days: 4,
    projects_starting_next_90_days: 10,
    backlog_months_of_revenue: 3.5,
  }
}

function generateCashMetrics() {
  return {
    year: currentYear,
    month: currentMonth,
    days_sales_outstanding: 42,
    days_payable_outstanding: 35,
    cash_conversion_cycle: 7,
    accounts_receivable: 2800000,
    accounts_receivable_over_90: 180000,
    bad_debt_expense: 15000,
    collections_rate: 94,
  }
}

async function seedData() {
  console.log('🌱 Seeding Financial Analytics data...\n')

  const tables = [
    { name: 'burc_sales_pipeline', data: generateSalesPipeline() },
    { name: 'burc_licence_bookings', data: [generateLicenceBookings()] },
    { name: 'burc_maintenance_churn', data: [generateMaintenanceChurn()] },
    { name: 'burc_headcount', data: generateHeadcount() },
    { name: 'burc_ps_utilisation', data: [generatePSUtilisation()] },
    { name: 'burc_rd_allocation', data: generateRDAllocation() },
    { name: 'burc_product_arr', data: generateProductARR() },
    { name: 'burc_customer_health', data: generateCustomerHealth() },
    { name: 'burc_support_metrics', data: [generateSupportMetrics()] },
    { name: 'burc_cost_centre', data: generateCostCentre() },
    { name: 'burc_cloud_costs', data: generateCloudCosts() },
    { name: 'burc_proposal_activity', data: [generateProposalActivity()] },
    { name: 'burc_renewal_pipeline', data: [generateRenewalPipeline()] },
    { name: 'burc_implementation_backlog', data: [generateImplementationBacklog()] },
    { name: 'burc_cash_metrics', data: [generateCashMetrics()] },
  ]

  for (const table of tables) {
    try {
      const { error } = await supabase
        .from(table.name)
        .upsert(table.data, { onConflict: 'id' })

      if (error) {
        console.error(`❌ Error seeding ${table.name}:`, error.message)
      } else {
        console.log(`✅ Seeded ${table.name} (${table.data.length} records)`)
      }
    } catch (err) {
      console.error(`❌ Failed to seed ${table.name}:`, err.message)
    }
  }

  console.log('\n✨ Seeding complete!')
}

seedData().catch(console.error)
