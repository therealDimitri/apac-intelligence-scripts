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

console.log('Reading Excel file:', excelPath)
console.log('')

try {
  const workbook = XLSX.readFile(excelPath)

  console.log('=== SHEET NAMES ===')
  console.log(workbook.SheetNames.join('\n'))
  console.log('')

  // Look for relevant sheets
  for (const sheetName of workbook.SheetNames) {
    console.log(`\n=== SHEET: ${sheetName} ===`)
    const sheet = workbook.Sheets[sheetName]
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 })

    // Print first 20 rows to understand structure
    data.slice(0, 20).forEach((row, i) => {
      if (row && row.length > 0) {
        console.log(`Row ${i}: ${JSON.stringify(row).substring(0, 200)}`)
      }
    })
  }

} catch (err) {
  console.error('Error reading Excel:', err.message)
}
