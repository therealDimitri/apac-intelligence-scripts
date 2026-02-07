import XLSX from 'xlsx'
import { BURC_MASTER_FILE, burcFile, requireOneDrive } from './lib/onedrive-paths.mjs'

requireOneDrive()

const wb = XLSX.readFile(BURC_MASTER_FILE)

// Look for budget/target in Waterfall Data sheet
console.log('=== Waterfall Data Sheet ===')
const waterfall = wb.Sheets['Waterfall Data']
if (waterfall) {
  const data = XLSX.utils.sheet_to_json(waterfall, { header: 1, range: 'A1:J30' })
  data.forEach((row, i) => {
    if (row.length > 0 && row.some(c => c !== undefined && c !== '')) {
      const formatted = row.slice(0, 8).map(c => {
        if (c === undefined || c === '') return ''
        if (typeof c === 'number') return '$' + (c/1000000).toFixed(2) + 'M'
        return String(c).substring(0, 20)
      }).join(' | ')
      console.log(`${i+1}: ${formatted}`)
    }
  })
}

// Also check Budget Planning folder
console.log('\n\n=== Checking Budget Planning folder ===')
import { readdirSync } from 'fs'
const budgetPath = burcFile(2026, 'Budget Planning/')
try {
  const files = readdirSync(budgetPath)
  files.forEach(f => console.log(f))
} catch (e) {
  console.log('Could not read directory')
}
