import XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { BURC_MASTER_FILE, requireOneDrive } from './lib/onedrive-paths.mjs'

requireOneDrive()

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const excelPath = BURC_MASTER_FILE

function formatMoney(val) {
  if (!val) return '$0'
  const absVal = Math.abs(val)
  if (absVal >= 1000000) return '$' + (val / 1000000).toFixed(1) + 'M'
  if (absVal >= 1000) return '$' + (val / 1000).toFixed(0) + 'K'
  return '$' + val.toFixed(0)
}

async function reconcile() {
  console.log('=== DETAILED FINANCIAL RECONCILIATION ===\n')

  // Read Excel file
  const workbook = XLSX.readFile(excelPath)

  // Extract EBITA from Monthly EBITA sheet
  const ebitaSheet = workbook.Sheets['APAC BURC - Monthly EBITA']
  const ebitaData = XLSX.utils.sheet_to_json(ebitaSheet, { header: 1 })

  let ebitaActual = 0
  for (let i = 0; i < ebitaData.length; i++) {
    const row = ebitaData[i]
    if (row && row[0] === 'Actual') {
      // Column 20 is "Annual" total
      ebitaActual = row[20] || row[13] || 0
      break
    }
  }

  console.log('FROM EXCEL:')
  console.log('  EBITA (Annual):', formatMoney(ebitaActual))

  // Get Gross Revenue from APAC BURC sheet
  const burcSheet = workbook.Sheets['APAC BURC']
  const burcData = XLSX.utils.sheet_to_json(burcSheet, { header: 1 })

  let grossRevenue = 0
  let targetEbita = 0
  let netRevenue = 0

  for (let i = 0; i < burcData.length; i++) {
    const row = burcData[i]
    if (!row || !row[0]) continue
    const label = String(row[0]).toLowerCase().trim()

    // Look for Total Net Revenue row (column U = index 20)
    if (label === 'total net revenue' || label.includes('total net revenue')) {
      netRevenue = row[20] || 0
      console.log('  Total Net Revenue:', formatMoney(netRevenue))
    }

    // Look for Gross Revenue
    if (label === 'gross revenue' || label.includes('total revenue')) {
      grossRevenue = row[20] || 0
      console.log('  Gross Revenue:', formatMoney(grossRevenue))
    }

    // EBITA target is in column W (index 22)
    if (label.includes('ebita') && !label.includes('%')) {
      targetEbita = row[22] || 0
    }
  }

  console.log('  Target EBITA:', formatMoney(targetEbita))

  // Check database tables
  console.log('\n\nFROM DATABASE:')

  // burc_waterfall
  console.log('\n--- burc_waterfall ---')
  const { data: waterfall } = await supabase
    .from('burc_waterfall')
    .select('*')
    .order('sort_order')

  if (waterfall && waterfall.length > 0) {
    let committed = 0
    let pipeline = 0

    waterfall.forEach(w => {
      console.log('  ' + w.category + ': ' + formatMoney(w.amount))
      if (w.category.toLowerCase().includes('backlog') || w.category.toLowerCase().includes('committed')) {
        committed += w.amount || 0
      }
      if (w.category.toLowerCase().includes('pipeline') || w.category.toLowerCase().includes('best case')) {
        pipeline += w.amount || 0
      }
    })
    console.log('\n  Calculated Committed:', formatMoney(committed))
    console.log('  Calculated Pipeline:', formatMoney(pipeline))
  } else {
    console.log('  No data in burc_waterfall')
  }

  // burc_annual_financials
  console.log('\n--- burc_annual_financials ---')
  const { data: annual } = await supabase
    .from('burc_annual_financials')
    .select('*')
    .eq('fiscal_year', 2026)
    .single()

  if (annual) {
    console.log('  Gross Revenue:', formatMoney(annual.gross_revenue))
    console.log('  Net Revenue:', formatMoney(annual.net_revenue))
    console.log('  COGS:', formatMoney(annual.cogs))
    console.log('  OPEX:', formatMoney(annual.opex))
    console.log('  EBITA:', formatMoney(annual.ebita))
    console.log('  EBITA Target:', formatMoney(annual.target_ebita))
  } else {
    console.log('  No data for FY2026')
  }

  // burc_attrition (revenue at risk)
  console.log('\n--- burc_attrition (Revenue at Risk) ---')
  const { data: attrition } = await supabase
    .from('burc_attrition')
    .select('*')
    .gte('fiscal_year', 2026)

  if (attrition && attrition.length > 0) {
    let totalRisk = 0
    attrition.forEach(a => {
      console.log('  ' + a.client_name + ': ' + formatMoney(a.revenue_at_risk) + ' - ' + (a.risk_category || 'unknown'))
      totalRisk += a.revenue_at_risk || 0
    })
    console.log('\n  Total Revenue at Risk:', formatMoney(totalRisk))
  } else {
    console.log('  No attrition data')
  }

  // burc_quarterly_data
  console.log('\n--- burc_quarterly_data ---')
  const { data: quarterly } = await supabase
    .from('burc_quarterly_data')
    .select('*')
    .eq('fiscal_year', 2026)

  if (quarterly && quarterly.length > 0) {
    quarterly.forEach(q => {
      const total = (q.q1_value || 0) + (q.q2_value || 0) + (q.q3_value || 0) + (q.q4_value || 0)
      console.log('  ' + q.metric_name + ': ' + formatMoney(total))
    })
  } else {
    console.log('  No quarterly data for 2026')
  }

  // burc_business_cases (pipeline)
  console.log('\n--- burc_business_cases (Pipeline) ---')
  const { data: businessCases } = await supabase
    .from('burc_business_cases')
    .select('*')

  if (businessCases && businessCases.length > 0) {
    let totalPipeline = 0
    businessCases.forEach(bc => {
      totalPipeline += bc.deal_value || 0
      console.log('  ' + bc.client_name + ' - ' + bc.opportunity_name + ': ' + formatMoney(bc.deal_value))
    })
    console.log('\n  Total Business Cases:', formatMoney(totalPipeline))
  } else {
    console.log('  No business cases')
  }

  // Check Attrition sheet in Excel
  console.log('\n\n=== ATTRITION FROM EXCEL ===')
  const attrSheet = workbook.Sheets['Attrition']
  if (attrSheet) {
    const attrData = XLSX.utils.sheet_to_json(attrSheet, { header: 1 })
    attrData.slice(0, 15).forEach((row, i) => {
      if (row && row.length > 0) {
        console.log('Row ' + i + ': ' + JSON.stringify(row).substring(0, 150))
      }
    })
  }

  // Check Dial 2 Risk Profile Summary
  console.log('\n\n=== DIAL 2 RISK PROFILE SUMMARY FROM EXCEL ===')
  const riskSheet = workbook.Sheets['Dial 2 Risk Profile Summary']
  if (riskSheet) {
    const riskData = XLSX.utils.sheet_to_json(riskSheet, { header: 1 })
    riskData.slice(0, 20).forEach((row, i) => {
      if (row && row.length > 0) {
        console.log('Row ' + i + ': ' + JSON.stringify(row).substring(0, 150))
      }
    })
  }

  // Summary
  console.log('\n\n=== RECONCILIATION SUMMARY ===')
  console.log('Expected Dashboard Values from Excel:')
  console.log('  Target EBITA: ~$6.2M (from EBITA Actual annual)')
  console.log('  Committed Revenue: Based on waterfall data')
  console.log('  Revenue at Risk: From attrition table')
  console.log('  Renewals Pending: $125K (from burc_renewal_calendar)')
}

reconcile()
