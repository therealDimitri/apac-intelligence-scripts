#!/usr/bin/env node
/**
 * Test reading XLSB file
 */

import XLSX from 'xlsx'
import fs from 'fs'
import { BURC_BASE, burcFile, requireOneDrive } from './lib/onedrive-paths.mjs'

requireOneDrive()

const filePath = burcFile(2023, 'Dec 23/2023 12 BURC File.xlsb')

console.log('Testing XLSB file read...')
console.log('File exists:', fs.existsSync(filePath))

if (!fs.existsSync(filePath)) {
  // Try alternative paths
  const altPaths = [
    burcFile(2023, '2023 12 BURC File.xlsb'),
    burcFile(2023, 'Dec/2023 12 BURC File.xlsb')
  ]

  for (const alt of altPaths) {
    if (fs.existsSync(alt)) {
      console.log('Found at:', alt)
    }
  }

  // List 2023 folder contents
  const folder2023 = `${BURC_BASE}/2023`
  if (fs.existsSync(folder2023)) {
    console.log('\n2023 folder contents:')
    const contents = fs.readdirSync(folder2023)
    contents.forEach(f => console.log('  -', f))

    // Check subfolders
    contents.forEach(f => {
      const subPath = `${folder2023}/${f}`
      if (fs.statSync(subPath).isDirectory()) {
        console.log(`\n  ${f}/ contents:`)
        fs.readdirSync(subPath).forEach(sf => console.log('    -', sf))
      }
    })
  }
  process.exit(0)
}

try {
  // Try with different options
  console.log('\nAttempting to read with default options...')
  const workbook = XLSX.readFile(filePath, {
    type: 'binary',
    cellFormula: false,
    cellHTML: false,
    cellStyles: false
  })

  console.log('Success! Sheets:', workbook.SheetNames.length)
  workbook.SheetNames.forEach((name, i) => {
    console.log(`  [${i+1}] ${name}`)
  })

} catch (err) {
  console.log('Error:', err.message)

  // Try reading as buffer
  console.log('\nTrying buffer read...')
  try {
    const buffer = fs.readFileSync(filePath)
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    console.log('Buffer read success! Sheets:', workbook.SheetNames.length)
  } catch (err2) {
    console.log('Buffer read error:', err2.message)
  }
}
