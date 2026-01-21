import XLSX from 'xlsx'

const wb = XLSX.readFile('/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth/APAC Leadership Team - General/Performance/Financials/BURC/2026/Budget Planning/APAC 2026 Budget GAP_ver3.xlsx')

console.log('Sheet names:', wb.SheetNames)

wb.SheetNames.forEach(sheetName => {
  console.log(`\n\n=== ${sheetName} ===`)
  const sheet = wb.Sheets[sheetName]
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 'A1:L40' })
  data.forEach((row, i) => {
    if (row.length > 0 && row.some(c => c !== undefined && c !== '')) {
      const formatted = row.slice(0, 10).map(c => {
        if (c === undefined || c === '') return ''
        if (typeof c === 'number') {
          if (Math.abs(c) > 100000) return '$' + (c/1000000).toFixed(2) + 'M'
          if (Math.abs(c) > 1) return c.toFixed(1)
          return (c * 100).toFixed(1) + '%'
        }
        return String(c).substring(0, 22)
      }).join(' | ')
      console.log(`${i+1}: ${formatted}`)
    }
  })
})
