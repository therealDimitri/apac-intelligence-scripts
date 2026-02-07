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
  console.log('=== FINANCIAL RECONCILIATION ===\n')

  // Read Excel file
  const workbook = XLSX.readFile(excelPath)

  // Extract key data from APAC BURC sheet
  const burcSheet = workbook.Sheets['APAC BURC']
  const burcData = XLSX.utils.sheet_to_json(burcSheet, { header: 1 })

  // Find key rows - looking for EBITA and revenue totals
  let excelMetrics = {}

  for (let i = 0; i < burcData.length; i++) {
    const row = burcData[i]
    if (!row || !row[0]) continue

    const label = String(row[0]).toLowerCase()

    // Look for key metrics in column U (index 20) which is "Total" column
    // or column V (index 21) which is "2026 Target"
    if (label.includes('ebita') && !label.includes('%') && !label.includes('margin')) {
      excelMetrics.ebita = row[20] // Total column
      excelMetrics.ebitaTarget = row[22] // Target column
    }
    if (label === 'gross revenue' || label.includes('total revenue')) {
      excelMetrics.grossRevenue = row[20]
      excelMetrics.grossRevenueTarget = row[22]
    }
    if (label.includes('net revenue') && !label.includes('licence') && !label.includes('professional') && !label.includes('maintenance')) {
      excelMetrics.netRevenue = row[20]
    }
  }

  // Get Monthly EBITA sheet for annual target
  const ebitaSheet = workbook.Sheets['APAC BURC - Monthly EBITA']
  const ebitaData = XLSX.utils.sheet_to_json(ebitaSheet, { header: 1 })

  for (let i = 0; i < ebitaData.length; i++) {
    const row = ebitaData[i]
    if (!row) continue

    // Row 3 is "Actual" with column 13 being Total, column 20 being Annual
    if (row[0] === 'Actual' && i <= 5) {
      excelMetrics.ebitaActual = row[20] || row[13]
    }
  }

  // Get Net Revenue from Monthly NR Comp sheet
  const nrSheet = workbook.Sheets['APAC BURC - Monthly NR Comp']
  const nrData = XLSX.utils.sheet_to_json(nrSheet, { header: 1 })

  let licenceNR = 0, psNR = 0, maintNR = 0, hwNR = 0

  for (let i = 0; i < nrData.length; i++) {
    const row = nrData[i]
    if (!row) continue

    if (row[0] === 'Actual') {
      // Check what section we're in
      const prevRows = nrData.slice(Math.max(0, i-3), i)
      const sectionLabel = prevRows.find(r => r && r[0] && typeof r[0] === 'string')

      if (sectionLabel) {
        const section = String(sectionLabel[0]).toLowerCase()
        const annual = row[20] || row[13] // Annual or Total column

        if (section.includes('licence')) licenceNR = annual
        else if (section.includes('professional')) psNR = annual
        else if (section.includes('maintenance')) maintNR = annual
        else if (section.includes('hardware')) hwNR = annual
      }
    }
  }

  excelMetrics.totalNetRevenue = licenceNR + psNR + maintNR + hwNR
  excelMetrics.licenceNR = licenceNR
  excelMetrics.psNR = psNR
  excelMetrics.maintNR = maintNR
  excelMetrics.hwNR = hwNR

  console.log('=== FROM EXCEL (2026 APAC Performance.xlsx) ===\n')
  console.log('EBITA Actual:', formatMoney(excelMetrics.ebitaActual))
  console.log('EBITA Target:', formatMoney(excelMetrics.ebitaTarget))
  console.log('Gross Revenue:', formatMoney(excelMetrics.grossRevenue))
  console.log('Gross Revenue Target:', formatMoney(excelMetrics.grossRevenueTarget))
  console.log('')
  console.log('Net Revenue Breakdown:')
  console.log('  Licence NR:', formatMoney(excelMetrics.licenceNR))
  console.log('  PS NR:', formatMoney(excelMetrics.psNR))
  console.log('  Maintenance NR:', formatMoney(excelMetrics.maintNR))
  console.log('  Hardware NR:', formatMoney(excelMetrics.hwNR))
  console.log('  Total NR:', formatMoney(excelMetrics.totalNetRevenue))

  // Now get database values
  console.log('\n\n=== FROM DATABASE (burc_metrics) ===\n')

  const { data: dbMetrics } = await supabase
    .from('burc_metrics')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (dbMetrics) {
    console.log('Target EBITA:', formatMoney(dbMetrics.target_ebita))
    console.log('Committed Revenue:', formatMoney(dbMetrics.committed_revenue))
    console.log('Pipeline Value:', formatMoney(dbMetrics.pipeline_value))
    console.log('Revenue at Risk:', formatMoney(dbMetrics.revenue_at_risk))
    console.log('')
    console.log('Raw values:', JSON.stringify(dbMetrics, null, 2))
  } else {
    console.log('No metrics found in burc_metrics table')
  }

  // Check burc_summary if exists
  const { data: summary } = await supabase
    .from('burc_summary')
    .select('*')
    .limit(1)

  if (summary && summary.length > 0) {
    console.log('\n=== FROM DATABASE (burc_summary) ===\n')
    console.log(JSON.stringify(summary[0], null, 2))
  }

  // Check renewal alerts
  console.log('\n\n=== RENEWAL ALERTS (financial_alerts) ===\n')

  const { data: renewals } = await supabase
    .from('financial_alerts')
    .select('client_name, financial_impact, due_date, alert_type')
    .in('alert_type', ['renewal_due', 'renewal_overdue'])

  if (renewals) {
    let total = 0
    renewals.forEach(r => {
      total += r.financial_impact || 0
      console.log(r.client_name + ': ' + formatMoney(r.financial_impact) + ' - ' + r.alert_type)
    })
    console.log('\nTotal Renewals Pending:', formatMoney(total))
    console.log('Count:', renewals.length)
  }

  // Check burc_renewal_calendar
  console.log('\n\n=== RENEWAL CALENDAR (burc_renewal_calendar) ===\n')

  const { data: calendar } = await supabase
    .from('burc_renewal_calendar')
    .select('*')
    .order('renewal_year')
    .order('renewal_month')

  if (calendar) {
    const today = new Date()
    let within90Days = []

    calendar.forEach(c => {
      const renewalDate = new Date(c.renewal_year, c.renewal_month - 1, 1)
      const daysUntil = Math.floor((renewalDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      const status = daysUntil < 0 ? 'OVERDUE' : daysUntil <= 90 ? 'DUE SOON' : 'future'

      console.log(c.clients + ': ' + renewalDate.toLocaleDateString('en-AU', {month: 'short', year: 'numeric'}) + ' (' + daysUntil + ' days) - ' + formatMoney(c.total_value_usd) + ' - ' + status)

      if (daysUntil <= 90) {
        within90Days.push(c)
      }
    })

    const renewalTotal = within90Days.reduce((sum, c) => sum + (c.total_value_usd || 0), 0)
    console.log('\nWithin 90 days:', within90Days.length)
    console.log('Total value within 90 days:', formatMoney(renewalTotal))
  }

  console.log('\n\n=== RECONCILIATION SUMMARY ===\n')
  console.log('Please compare the Excel values with the database values above.')
  console.log('If there are discrepancies, the database may need to be updated.')
}

reconcile()
