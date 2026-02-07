#!/usr/bin/env node
/**
 * Update Excel Source File with New Renewal Dates
 *
 * Updates the 2026 APAC Performance.xlsx file with new contract renewal dates.
 * Run: node scripts/update-excel-renewals.mjs
 */

import XLSX from 'xlsx'
import path from 'path'
import fs from 'fs'
import { BURC_BASE, requireOneDrive } from './lib/onedrive-paths.mjs'

requireOneDrive()

const BURC_BASE = BURC_BASE
const PERFORMANCE_FILE = `${BURC_BASE}/2026/2026 APAC Performance.xlsx`
const SHEET_NAME = 'Opal Maint Contracts and Value'

// Renewal updates (matching exact client names from Excel)
const renewalUpdates = {
  'RVEEH': { renewal_date: new Date('2028-11-30'), comments: 'Renewed to Nov 2028' },
  'GHA Regional': { renewal_date: new Date('2026-03-31'), comments: 'Renewed to Mar 2026' },
  'Grampians': { renewal_date: null, comments: 'No renewal date' },
  'EPH': { renewal_date: new Date('2026-11-15'), comments: 'Renewed to Nov 2026' },
}

// Convert JS Date to Excel serial number
function dateToExcelSerial(date) {
  if (!date) return null
  const excelEpoch = new Date(1899, 11, 30)
  const days = Math.floor((date - excelEpoch) / (24 * 60 * 60 * 1000))
  return days
}

async function updateExcelRenewals() {
  console.log('📂 Opening Excel file...')
  console.log(`   ${PERFORMANCE_FILE}\n`)

  if (!fs.existsSync(PERFORMANCE_FILE)) {
    console.error('❌ Excel file not found!')
    process.exit(1)
  }

  // Read the workbook
  const workbook = XLSX.readFile(PERFORMANCE_FILE)

  // Check if sheet exists
  if (!workbook.SheetNames.includes(SHEET_NAME)) {
    console.error(`❌ Sheet "${SHEET_NAME}" not found!`)
    console.log('Available sheets:', workbook.SheetNames)
    process.exit(1)
  }

  const sheet = workbook.Sheets[SHEET_NAME]

  // Get the range
  const range = XLSX.utils.decode_range(sheet['!ref'])
  console.log(`📊 Sheet range: ${sheet['!ref']}`)
  console.log(`   Rows: ${range.e.r - range.s.r + 1}`)
  console.log()

  // Find and update matching rows
  // Columns: A=Client, B=Annual Value AUD, C=Annual Value USD, D=Renewal Date, E=Comments
  let updatesApplied = 0

  for (let row = range.s.r + 1; row <= range.e.r; row++) {
    const clientCell = sheet[XLSX.utils.encode_cell({ r: row, c: 0 })]
    if (!clientCell) continue

    const clientName = String(clientCell.v).trim()

    // Check if this client needs updating
    for (const [searchName, update] of Object.entries(renewalUpdates)) {
      if (clientName.toLowerCase().includes(searchName.toLowerCase())) {
        console.log(`📝 Updating row ${row + 1}: ${clientName}`)

        // Update renewal date (column D, index 3)
        const dateCell = XLSX.utils.encode_cell({ r: row, c: 3 })
        if (update.renewal_date) {
          sheet[dateCell] = {
            t: 'n',
            v: dateToExcelSerial(update.renewal_date),
            z: 'dd/mm/yyyy'
          }
          console.log(`   ✅ Renewal date: ${update.renewal_date.toLocaleDateString('en-AU')}`)
        } else {
          sheet[dateCell] = { t: 's', v: '' }
          console.log(`   ✅ Renewal date: Cleared`)
        }

        // Update comments (column E, index 4)
        const commentCell = XLSX.utils.encode_cell({ r: row, c: 4 })
        sheet[commentCell] = { t: 's', v: update.comments }
        console.log(`   ✅ Comments: ${update.comments}`)

        updatesApplied++
        console.log()
        break
      }
    }
  }

  if (updatesApplied === 0) {
    console.log('⚠️  No matching clients found!')
    process.exit(1)
  }

  // Save the workbook
  console.log(`💾 Saving workbook with ${updatesApplied} updates...`)
  XLSX.writeFile(workbook, PERFORMANCE_FILE)

  console.log('\n✅ Excel file updated successfully!')
  console.log(`   ${PERFORMANCE_FILE}`)
}

updateExcelRenewals().catch(err => {
  console.error('❌ Error:', err.message)
  process.exit(1)
})
