import XLSX from 'xlsx'
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

const excelPath = '/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth/APAC Leadership Team - General/Performance/Financials/BURC/2026/2026 APAC Performance.xlsx'

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
  // Row 2 is Grand Total
  // Rows 3+ are individual clients

  console.log('Excel Attrition Data:')
  console.log('Headers:', attrData[1])
  console.log('')

  const attritionRecords = []

  for (let i = 3; i < attrData.length; i++) {
    const row = attrData[i]
    if (!row || !row[0]) continue

    const clientName = row[0]
    const attritionType = row[1] // Full/Partial
    const forecastDate = row[2] // Excel date serial number
    const rev2025 = row[3] || 0
    const rev2026 = row[4] || 0
    const rev2027 = row[5] || 0
    const rev2028 = row[6] || 0

    // Convert values - they're in thousands in Excel
    const rev2025k = typeof rev2025 === 'number' ? rev2025 * 1000 : 0
    const rev2026k = typeof rev2026 === 'number' ? rev2026 * 1000 : 0
    const rev2027k = typeof rev2027 === 'number' ? rev2027 * 1000 : 0
    const rev2028k = typeof rev2028 === 'number' ? rev2028 * 1000 : 0

    console.log(`${clientName}: 2025=$${rev2025k/1000}K, 2026=$${rev2026k/1000}K, 2027=$${rev2027k/1000}K, 2028=$${rev2028k/1000}K`)

    // Only add records for years with actual attrition
    if (rev2025k > 0) {
      attritionRecords.push({
        client_name: clientName,
        fiscal_year: 2025,
        revenue_at_risk: rev2025k,
        attrition_type: attritionType,
        risk_category: attritionType === 'Full' ? 'confirmed' : 'partial'
      })
    }
    if (rev2026k > 0) {
      attritionRecords.push({
        client_name: clientName,
        fiscal_year: 2026,
        revenue_at_risk: rev2026k,
        attrition_type: attritionType,
        risk_category: attritionType === 'Full' ? 'confirmed' : 'partial'
      })
    }
    if (rev2027k > 0) {
      attritionRecords.push({
        client_name: clientName,
        fiscal_year: 2027,
        revenue_at_risk: rev2027k,
        attrition_type: attritionType,
        risk_category: attritionType === 'Full' ? 'confirmed' : 'partial'
      })
    }
    if (rev2028k > 0) {
      attritionRecords.push({
        client_name: clientName,
        fiscal_year: 2028,
        revenue_at_risk: rev2028k,
        attrition_type: attritionType,
        risk_category: attritionType === 'Full' ? 'confirmed' : 'partial'
      })
    }
  }

  console.log('\n--- Records to sync ---')
  attritionRecords.forEach(r => {
    console.log(`${r.client_name} (FY${r.fiscal_year}): $${r.revenue_at_risk/1000}K`)
  })

  // Calculate totals by year
  const totalByYear = {}
  attritionRecords.forEach(r => {
    totalByYear[r.fiscal_year] = (totalByYear[r.fiscal_year] || 0) + r.revenue_at_risk
  })

  console.log('\n--- Totals by Year ---')
  Object.entries(totalByYear).forEach(([year, total]) => {
    console.log(`FY${year}: $${total/1000}K`)
  })

  // Compare with current database
  console.log('\n--- Current Database ---')
  const { data: currentAttr } = await supabase
    .from('burc_attrition')
    .select('*')

  if (currentAttr && currentAttr.length > 0) {
    const dbTotalByYear = {}
    currentAttr.forEach(a => {
      dbTotalByYear[a.fiscal_year] = (dbTotalByYear[a.fiscal_year] || 0) + (a.revenue_at_risk || 0)
    })
    Object.entries(dbTotalByYear).forEach(([year, total]) => {
      console.log(`FY${year}: $${total/1000}K`)
    })
  } else {
    console.log('No data in burc_attrition table')
  }

  // Update the database
  console.log('\n--- Updating database ---')

  // Delete existing records for FY2026+
  const { error: deleteError } = await supabase
    .from('burc_attrition')
    .delete()
    .gte('fiscal_year', 2025)

  if (deleteError) {
    console.error('Delete error:', deleteError.message)
    return
  }

  // Insert new records
  for (const record of attritionRecords) {
    const { error } = await supabase
      .from('burc_attrition')
      .insert(record)

    if (error) {
      console.error(`Insert error for ${record.client_name}:`, error.message)
    } else {
      console.log(`Inserted: ${record.client_name} FY${record.fiscal_year}`)
    }
  }

  // Verify final state
  console.log('\n--- Final State ---')
  const { data: finalAttr } = await supabase
    .from('burc_attrition')
    .select('*')
    .gte('fiscal_year', 2026)
    .order('fiscal_year')
    .order('revenue_at_risk', { ascending: false })

  let total2026 = 0
  if (finalAttr) {
    finalAttr.forEach(a => {
      if (a.fiscal_year === 2026) total2026 += a.revenue_at_risk
      console.log(`${a.client_name} (FY${a.fiscal_year}): $${a.revenue_at_risk/1000}K`)
    })
  }

  console.log('\nTotal 2026 Revenue at Risk: $' + (total2026/1000).toFixed(0) + 'K')
}

syncAttrition()
