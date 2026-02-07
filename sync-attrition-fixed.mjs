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

async function syncAttrition() {
  console.log('=== SYNCING ATTRITION DATA FROM EXCEL ===\n')

  // Read Excel file
  const workbook = XLSX.readFile(excelPath)
  const attrSheet = workbook.Sheets['Attrition']

  if (!attrSheet) {
    console.error('Attrition sheet not found!')
    return
  }

  const attrData = XLSX.utils.sheet_to_json(attrSheet, { header: 1 })

  // Row 1 is headers: ["Client","Type (Full/Partial)","Forecast Date",2025,2026,2027,2028,"Total"]
  // Rows 3+ are individual clients

  const attritionRecords = []
  const alertRecords = []

  for (let i = 3; i < attrData.length; i++) {
    const row = attrData[i]
    if (!row || !row[0]) continue

    const clientName = row[0]
    const attrType = row[1] // Full/Partial
    const rev2025 = typeof row[3] === 'number' ? row[3] * 1000 : 0
    const rev2026 = typeof row[4] === 'number' ? row[4] * 1000 : 0
    const rev2027 = typeof row[5] === 'number' ? row[5] * 1000 : 0
    const rev2028 = typeof row[6] === 'number' ? row[6] * 1000 : 0

    console.log(`${clientName}: 2025=$${rev2025/1000}K, 2026=$${rev2026/1000}K, 2027=$${rev2027/1000}K, 2028=$${rev2028/1000}K (${attrType})`)

    // Add to burc_attrition for each year with values
    if (rev2025 > 0) {
      attritionRecords.push({ client_name: clientName, fiscal_year: 2025, revenue_at_risk: rev2025, risk_category: attrType })
    }
    if (rev2026 > 0) {
      attritionRecords.push({ client_name: clientName, fiscal_year: 2026, revenue_at_risk: rev2026, risk_category: attrType })
      // Also create financial_alert for 2026 attrition (current year)
      alertRecords.push({
        alert_type: 'attrition_risk',
        severity: attrType === 'Full' ? 'critical' : 'high',
        priority_score: attrType === 'Full' ? 95 : 75,
        client_name: clientName,
        title: `Attrition Risk: ${clientName}`,
        description: `${attrType} attrition expected in FY2026 - $${(rev2026/1000).toFixed(0)}K revenue at risk`,
        financial_impact: rev2026,
        status: 'open',
        source_table: 'burc_attrition',
        source_sheet: 'Attrition'
      })
    }
    if (rev2027 > 0) {
      attritionRecords.push({ client_name: clientName, fiscal_year: 2027, revenue_at_risk: rev2027, risk_category: attrType })
    }
    if (rev2028 > 0) {
      attritionRecords.push({ client_name: clientName, fiscal_year: 2028, revenue_at_risk: rev2028, risk_category: attrType })
    }
  }

  // Calculate totals
  const total2026 = attritionRecords.filter(r => r.fiscal_year === 2026).reduce((s, r) => s + r.revenue_at_risk, 0)
  console.log('\n--- Summary ---')
  console.log(`Total 2026 Revenue at Risk: $${(total2026/1000).toFixed(0)}K`)
  console.log(`Attrition records to sync: ${attritionRecords.length}`)
  console.log(`Alert records to sync: ${alertRecords.length}`)

  // Update burc_attrition table
  console.log('\n--- Updating burc_attrition ---')

  // Delete existing
  await supabase.from('burc_attrition').delete().neq('id', '00000000-0000-0000-0000-000000000000')

  // Insert new
  for (const record of attritionRecords) {
    const { error } = await supabase.from('burc_attrition').insert(record)
    if (error) {
      console.error(`Insert error for ${record.client_name} FY${record.fiscal_year}:`, error.message)
    }
  }
  console.log(`Inserted ${attritionRecords.length} records to burc_attrition`)

  // Update financial_alerts table
  console.log('\n--- Updating financial_alerts (attrition_risk) ---')

  // Delete existing attrition_risk alerts
  await supabase.from('financial_alerts').delete().eq('alert_type', 'attrition_risk')

  // Insert new alerts
  for (const alert of alertRecords) {
    const { error } = await supabase.from('financial_alerts').insert(alert)
    if (error) {
      console.error(`Alert insert error for ${alert.client_name}:`, error.message)
    }
  }
  console.log(`Inserted ${alertRecords.length} attrition alerts`)

  // Verify final state
  console.log('\n--- Final State ---')

  const { data: finalAttr } = await supabase
    .from('burc_attrition')
    .select('*')
    .eq('fiscal_year', 2026)

  let finalTotal = 0
  if (finalAttr) {
    finalAttr.forEach(a => {
      finalTotal += a.revenue_at_risk
      console.log(`burc_attrition: ${a.client_name} FY2026: $${a.revenue_at_risk/1000}K`)
    })
  }
  console.log(`burc_attrition 2026 Total: $${finalTotal/1000}K`)

  const { data: finalAlerts } = await supabase
    .from('financial_alerts')
    .select('*')
    .eq('alert_type', 'attrition_risk')

  let alertTotal = 0
  if (finalAlerts) {
    finalAlerts.forEach(a => {
      alertTotal += a.financial_impact
      console.log(`financial_alerts: ${a.client_name}: $${a.financial_impact/1000}K`)
    })
  }
  console.log(`financial_alerts attrition_risk Total: $${alertTotal/1000}K`)
}

syncAttrition()
