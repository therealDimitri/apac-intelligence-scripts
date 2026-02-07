#!/usr/bin/env node
/**
 * Detailed analysis of APAC Revenue 2019-2024.xlsx
 */

import XLSX from 'xlsx'
import { BURC_BASE, requireOneDrive } from './lib/onedrive-paths.mjs'

requireOneDrive()

const filePath = `${BURC_BASE}/APAC Revenue 2019 - 2024.xlsx`

const fmt = (v) => {
  if (v === undefined || v === null || isNaN(v)) return ''
  if (Math.abs(v) >= 1000000) return '$' + (v/1000000).toFixed(2) + 'M'
  if (Math.abs(v) >= 1000) return '$' + (v/1000).toFixed(1) + 'K'
  return '$' + v.toFixed(0)
}

console.log('='.repeat(80))
console.log('APAC REVENUE 2019-2024 DETAILED ANALYSIS')
console.log('='.repeat(80))

const workbook = XLSX.readFile(filePath)
console.log('Sheets:', workbook.SheetNames.join(', '))

// Analyze Customer Level Summary
console.log('\n' + '='.repeat(80))
console.log('CUSTOMER LEVEL SUMMARY')
console.log('='.repeat(80))

const summaryData = XLSX.utils.sheet_to_json(workbook.Sheets['Customer Level Summary'], { header: 1 })
const summaryHeaders = summaryData[0] || []
console.log('Headers:', summaryHeaders.join(' | '))
console.log('Total rows:', summaryData.length)

// Get unique customers
const customers = new Set()
const revenueByCustomer = {}

for (let i = 1; i < summaryData.length; i++) {
  const row = summaryData[i]
  if (!row || !row[1]) continue

  const customer = row[1]
  customers.add(customer)

  if (!revenueByCustomer[customer]) {
    revenueByCustomer[customer] = { 2019: 0, 2020: 0, 2021: 0, 2022: 0, 2023: 0, 2024: 0 }
  }

  // Sum up revenue (assuming columns 3-8 are years 2019-2024)
  for (let y = 0; y < 6; y++) {
    const val = row[3 + y]
    if (typeof val === 'number') {
      revenueByCustomer[customer][2019 + y] += val
    }
  }
}

console.log('\nUnique customers:', customers.size)
console.log('\nTop 15 customers by 2024 revenue:')
const sorted = Object.entries(revenueByCustomer)
  .sort((a, b) => (b[1][2024] || 0) - (a[1][2024] || 0))
  .slice(0, 15)

sorted.forEach(([name, years]) => {
  console.log(`  ${name.substring(0, 30).padEnd(32)}: 2023=${fmt(years[2023]).padEnd(10)} 2024=${fmt(years[2024])}`)
})

// Analyze Data sheet (detailed transactions)
console.log('\n' + '='.repeat(80))
console.log('DATA SHEET (DETAILED TRANSACTIONS)')
console.log('='.repeat(80))

const detailData = XLSX.utils.sheet_to_json(workbook.Sheets['Data'], { header: 1 })
const detailHeaders = detailData[0] || []
console.log('Total rows:', detailData.length)
console.log('Headers:', detailHeaders.slice(0, 15).join(' | '))

// Find column indices
const colIndices = {}
detailHeaders.forEach((h, i) => {
  const hLower = String(h || '').toLowerCase()
  if (hLower.includes('customer')) colIndices.customer = i
  if (hLower.includes('year') && !colIndices.year) colIndices.year = i
  if (hLower.includes('period') && hLower.includes('name')) colIndices.period = i
  if (hLower.includes('product')) colIndices.product = i
  if (hLower.includes('revenue') || hLower.includes('amount')) colIndices.amount = i
  if (hLower.includes('usd') || hLower.includes('accounted')) colIndices.usd = i
  if (hLower.includes('category') || hLower.includes('type')) colIndices.category = i
})

console.log('\nColumn indices found:', colIndices)

// Sample 10 rows to understand structure
console.log('\nSample rows (first 10 data rows):')
for (let i = 1; i <= 10 && i < detailData.length; i++) {
  const row = detailData[i]
  if (!row) continue
  console.log(`Row ${i}:`, row.slice(0, 12).map((c, idx) => {
    if (c === undefined || c === null) return ''
    if (typeof c === 'number') return fmt(c) || String(c).substring(0, 10)
    return String(c).substring(0, 15)
  }).join(' | '))
}

// Aggregate by year and category
console.log('\n' + '='.repeat(80))
console.log('REVENUE AGGREGATION BY YEAR')
console.log('='.repeat(80))

const byYear = {}
const byCategory = {}
const byCustomerYear = {}

for (let i = 1; i < detailData.length; i++) {
  const row = detailData[i]
  if (!row) continue

  // Find year - could be in Period Year column
  let year = null
  let amount = null
  let customer = null
  let category = null

  // Check each column
  for (let j = 0; j < row.length; j++) {
    const val = row[j]
    const header = String(detailHeaders[j] || '').toLowerCase()

    if (header.includes('period') && header.includes('year') && typeof val === 'number' && val >= 2019 && val <= 2026) {
      year = val
    }
    if ((header.includes('accounted') || header.includes('usd') || header.includes('amount')) && typeof val === 'number') {
      amount = val
    }
    if (header.includes('customer') && typeof val === 'string') {
      customer = val
    }
    if (header.includes('pnl') || header.includes('category') || header.includes('type')) {
      category = val
    }
  }

  if (year && amount) {
    byYear[year] = (byYear[year] || 0) + amount

    if (category) {
      const key = `${year}-${category}`
      byCategory[key] = (byCategory[key] || 0) + amount
    }

    if (customer) {
      if (!byCustomerYear[customer]) byCustomerYear[customer] = {}
      byCustomerYear[customer][year] = (byCustomerYear[customer][year] || 0) + amount
    }
  }
}

console.log('\nTotal revenue by year:')
Object.entries(byYear).sort((a, b) => a[0] - b[0]).forEach(([year, total]) => {
  console.log(`  ${year}: ${fmt(total)}`)
})

console.log('\nRevenue by category (2024):')
Object.entries(byCategory)
  .filter(([k]) => k.startsWith('2024'))
  .sort((a, b) => b[1] - a[1])
  .forEach(([key, total]) => {
    const cat = key.replace('2024-', '')
    console.log(`  ${cat.padEnd(30)}: ${fmt(total)}`)
  })

console.log('\nTop 20 customers by all-time revenue:')
const customerTotals = Object.entries(byCustomerYear)
  .map(([name, years]) => ({
    name,
    total: Object.values(years).reduce((a, b) => a + b, 0),
    y2024: years[2024] || 0,
    y2023: years[2023] || 0
  }))
  .sort((a, b) => b.total - a.total)
  .slice(0, 20)

customerTotals.forEach(c => {
  console.log(`  ${c.name.substring(0, 35).padEnd(37)}: Total=${fmt(c.total).padEnd(10)} 2024=${fmt(c.y2024).padEnd(10)} 2023=${fmt(c.y2023)}`)
})

console.log('\n' + '='.repeat(80))
console.log('ANALYSIS COMPLETE')
console.log('='.repeat(80))
