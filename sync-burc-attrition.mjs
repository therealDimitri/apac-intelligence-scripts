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

async function sync() {
  console.log('=== SYNCING BURC_ATTRITION TABLE ===\n')

  // Read Excel
  const workbook = XLSX.readFile(excelPath)
  const attrSheet = workbook.Sheets['Attrition']
  const attrData = XLSX.utils.sheet_to_json(attrSheet, { header: 1 })

  const records = []

  for (let i = 3; i < attrData.length; i++) {
    const row = attrData[i]
    if (!row || !row[0]) continue

    const clientName = row[0]
    const rev2025 = typeof row[3] === 'number' ? row[3] * 1000 : 0
    const rev2026 = typeof row[4] === 'number' ? row[4] * 1000 : 0
    const rev2027 = typeof row[5] === 'number' ? row[5] * 1000 : 0
    const rev2028 = typeof row[6] === 'number' ? row[6] * 1000 : 0

    // Only use columns that exist: client_name, fiscal_year, revenue_at_risk
    if (rev2025 > 0) records.push({ client_name: clientName, fiscal_year: 2025, revenue_at_risk: rev2025 })
    if (rev2026 > 0) records.push({ client_name: clientName, fiscal_year: 2026, revenue_at_risk: rev2026 })
    if (rev2027 > 0) records.push({ client_name: clientName, fiscal_year: 2027, revenue_at_risk: rev2027 })
    if (rev2028 > 0) records.push({ client_name: clientName, fiscal_year: 2028, revenue_at_risk: rev2028 })
  }

  console.log('Records to insert: ' + records.length)

  // Delete all existing
  await supabase.from('burc_attrition').delete().neq('id', '00000000-0000-0000-0000-000000000000')

  // Insert new
  for (const r of records) {
    const { error } = await supabase.from('burc_attrition').insert(r)
    if (error) {
      console.error('Error inserting ' + r.client_name + ' FY' + r.fiscal_year + ': ' + error.message)
    } else {
      console.log('Inserted: ' + r.client_name + ' FY' + r.fiscal_year + ' $' + (r.revenue_at_risk/1000) + 'K')
    }
  }

  // Verify
  const { data: final } = await supabase
    .from('burc_attrition')
    .select('*')
    .gte('fiscal_year', 2026)

  console.log('\n--- Final totals (2026+) ---')
  const byYear = {}
  if (final) {
    final.forEach(f => {
      byYear[f.fiscal_year] = (byYear[f.fiscal_year] || 0) + f.revenue_at_risk
    })
    Object.entries(byYear).forEach(([y, t]) => console.log('FY' + y + ': $' + (t/1000) + 'K'))
  }
}

sync()
