import XLSX from 'xlsx'
import { BURC_MASTER_FILE, requireOneDrive } from './lib/onedrive-paths.mjs'

requireOneDrive()

const wb = XLSX.readFile(BURC_MASTER_FILE)

// Check APAC BURC sheet
console.log('=== APAC BURC Sheet ===\n')
const burc = wb.Sheets['APAC BURC']
const burcData = XLSX.utils.sheet_to_json(burc, { header: 1, range: 'A1:V50' })
burcData.forEach((row, i) => {
  if (row.length > 0 && row.some(c => c !== undefined && c !== '')) {
    const rowStr = row.slice(0, 8).map(c => {
      if (c === undefined || c === '') return ''
      if (typeof c === 'number') return c.toLocaleString()
      return String(c).substring(0, 20)
    }).join(' | ')
    console.log(`${i+1}: ${rowStr}`)
  }
})

// Check 26 vs 25 Q Comparison sheet for target vs actual
console.log('\n\n=== 26 vs 25 Q Comparison Sheet ===\n')
const comparison = wb.Sheets['26 vs 25 Q Comparison']
const compData = XLSX.utils.sheet_to_json(comparison, { header: 1, range: 'A1:R30' })
compData.forEach((row, i) => {
  if (row.length > 0 && row.some(c => c !== undefined && c !== '')) {
    const rowStr = row.slice(0, 10).map(c => {
      if (c === undefined || c === '') return ''
      if (typeof c === 'number') return c.toLocaleString()
      return String(c).substring(0, 18)
    }).join(' | ')
    console.log(`${i+1}: ${rowStr}`)
  }
})
