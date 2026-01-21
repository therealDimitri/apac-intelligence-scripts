import XLSX from 'xlsx'

const excelPath = '/Users/jimmy.leimonitis/Desktop/APAC 2026 Sales Budget 14Jan2026 v0.1.xlsx'

console.log('Reading Sales Budget from Desktop...\n')

try {
  const workbook = XLSX.readFile(excelPath)

  console.log('=== SHEET NAMES ===')
  console.log(workbook.SheetNames.join('\n'))
  console.log('')

  // Read each sheet with more detail
  for (const sheetName of workbook.SheetNames) {
    console.log(`\n${'='.repeat(60)}`)
    console.log(`=== SHEET: ${sheetName} ===`)
    console.log('='.repeat(60))
    const sheet = workbook.Sheets[sheetName]
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 })

    // Print first 50 rows for detailed analysis
    data.slice(0, 50).forEach((row, i) => {
      if (row && row.length > 0 && row.some(cell => cell !== null && cell !== undefined && cell !== '')) {
        console.log(`Row ${i}: ${JSON.stringify(row).substring(0, 300)}`)
      }
    })
  }

} catch (err) {
  console.error('Error reading Excel:', err.message)
}
