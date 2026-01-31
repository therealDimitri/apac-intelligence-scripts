#!/usr/bin/env node
/**
 * BURC Contracts Sync Script
 *
 * Syncs contract data from "Opal Maint Contracts and Value" sheet in BURC Excel
 * to the burc_contracts table in Supabase.
 *
 * Source: 2026 APAC Performance.xlsx - "Opal Maint Contracts and Value" sheet
 * Target: burc_contracts table
 *
 * Usage:
 *   node scripts/sync-burc-contracts.mjs [--dry-run]
 */

import { createClient } from '@supabase/supabase-js'
import XLSX from 'xlsx'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const BURC_FILE = '/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth/APAC Leadership Team - General/Performance/Financials/BURC/2026/2026 APAC Performance.xlsx'
const SHEET_NAME = 'Opal Maint Contracts and Value'

// Parse command line arguments
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')

/**
 * Convert Excel serial date to JavaScript Date
 * Excel serial dates start from 1900-01-01 (serial = 1)
 */
function excelDateToJS(serial) {
  if (!serial || typeof serial !== 'number') return null
  // Excel date serial: days since 1900-01-01 (with a bug for 1900 being a leap year)
  const utcDays = Math.floor(serial - 25569) // 25569 = days from 1900 to 1970
  const date = new Date(utcDays * 86400 * 1000)
  return date.toISOString().split('T')[0] // Return YYYY-MM-DD
}

/**
 * Parse number value, handling various formats
 */
function parseNumber(val) {
  if (val === null || val === undefined || val === '' || val === '-') return null
  if (typeof val === 'number') return val
  const str = String(val).replace(/[$,()]/g, '').trim()
  if (str.startsWith('(') || str.startsWith('-')) {
    return -Math.abs(parseFloat(str.replace(/[()]/g, '')) || 0)
  }
  return parseFloat(str) || 0
}

/**
 * Parse comments to extract auto-renewal and CPI info
 */
function parseContractFeatures(comments) {
  const commentLower = (comments || '').toLowerCase()
  return {
    autoRenewal: commentLower.includes('auto') && commentLower.includes('renew'),
    cpiApplicable: commentLower.includes('cpi') || commentLower.includes('index') || commentLower.includes('inex')
  }
}

/**
 * Determine contract status based on renewal date
 */
function determineContractStatus(renewalDate) {
  if (!renewalDate) return 'active'
  const renewal = new Date(renewalDate)
  const today = new Date()
  const thirtyDaysFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)

  if (renewal < today) {
    return 'expired'
  } else if (renewal <= thirtyDaysFromNow) {
    return 'pending_renewal'
  }
  return 'active'
}

async function syncContracts() {
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('  BURC Contracts Sync')
  console.log('  Source:', SHEET_NAME)
  console.log('  Target: burc_contracts table')
  console.log('  Mode:', dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log()

  // Check if file exists
  if (!fs.existsSync(BURC_FILE)) {
    console.error('❌ BURC file not found:', BURC_FILE)
    process.exit(1)
  }

  // Read Excel file
  console.log('📖 Reading Excel file...')
  const workbook = XLSX.readFile(BURC_FILE)

  const sheet = workbook.Sheets[SHEET_NAME]
  if (!sheet) {
    console.error('❌ Sheet not found:', SHEET_NAME)
    console.log('   Available sheets:', workbook.SheetNames.join(', '))
    process.exit(1)
  }

  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  console.log(`   Found ${data.length} rows in sheet`)

  // Find header row (contains "Client" and "Annual Value")
  let headerRowIndex = -1
  for (let i = 0; i < Math.min(10, data.length); i++) {
    const row = data[i]
    const rowStr = row.map(c => String(c).toLowerCase()).join(' ')
    if (rowStr.includes('client') && rowStr.includes('annual') && rowStr.includes('value')) {
      headerRowIndex = i
      break
    }
  }

  if (headerRowIndex === -1) {
    console.error('❌ Could not find header row')
    process.exit(1)
  }

  const headers = data[headerRowIndex]
  console.log(`   Header row found at index ${headerRowIndex}:`, headers.slice(0, 5))

  // Map column indexes
  const clientCol = 0
  const audCol = 1
  const usdCol = 2
  const renewalCol = 3
  const commentsCol = 4
  const exchRateCol = headers.findIndex(h => String(h).toLowerCase().includes('exch'))

  // Extract contract records
  const contracts = []
  for (let i = headerRowIndex + 1; i < data.length; i++) {
    const row = data[i]
    const clientName = String(row[clientCol] || '').trim()

    // Skip empty rows, header rows, and total rows
    if (!clientName ||
        clientName.toLowerCase() === 'client' ||
        clientName.toLowerCase() === 'total' ||
        clientName.toLowerCase().includes('2024') ||
        clientName.toLowerCase().includes('opal')) {
      continue
    }

    const annualValueAud = parseNumber(row[audCol])
    const annualValueUsd = parseNumber(row[usdCol])
    const renewalDateSerial = parseNumber(row[renewalCol])
    const comments = String(row[commentsCol] || '').trim()
    const exchangeRate = parseNumber(row[exchRateCol]) || 0.64

    // Skip if no financial data
    if (!annualValueAud && !annualValueUsd) {
      continue
    }

    const renewalDate = excelDateToJS(renewalDateSerial)
    const { autoRenewal, cpiApplicable } = parseContractFeatures(comments)
    const contractStatus = determineContractStatus(renewalDate)

    contracts.push({
      client_name: clientName,
      annual_value_aud: annualValueAud,
      annual_value_usd: annualValueUsd || (annualValueAud * exchangeRate),
      renewal_date: renewalDate,
      comments: comments || null,
      exchange_rate: exchangeRate,
      auto_renewal: autoRenewal,
      cpi_applicable: cpiApplicable,
      contract_status: contractStatus,
      last_synced: new Date().toISOString()
    })
  }

  console.log(`\n📋 Found ${contracts.length} contract records to sync:`)
  contracts.forEach(c => {
    console.log(`   • ${c.client_name}: $${c.annual_value_usd?.toLocaleString()} USD (renewal: ${c.renewal_date || 'N/A'})`)
  })

  if (dryRun) {
    console.log('\n⚠️  DRY RUN - No changes made to database')
    console.log('\nContract data that would be synced:')
    console.log(JSON.stringify(contracts, null, 2))
    return
  }

  // Sync to database - delete existing records for these clients first, then insert
  console.log('\n💾 Syncing to database...')

  let inserted = 0
  let updated = 0
  let errors = 0

  // Get list of client names to sync
  const clientNames = contracts.map(c => c.client_name)

  // Delete existing records for these clients (to avoid duplicates)
  console.log('   Clearing existing records for synced clients...')
  const { error: deleteError } = await supabase
    .from('burc_contracts')
    .delete()
    .in('client_name', clientNames)

  if (deleteError) {
    console.error('   ⚠️  Warning: Could not clear existing records:', deleteError.message)
  }

  // Insert all contracts
  for (const contract of contracts) {
    try {
      const { data: result, error } = await supabase
        .from('burc_contracts')
        .insert(contract)
        .select()

      if (error) {
        console.error(`   ❌ Error syncing ${contract.client_name}:`, error.message)
        errors++
      } else {
        console.log(`   ✓ ${contract.client_name} synced`)
        inserted++
      }
    } catch (err) {
      console.error(`   ❌ Error syncing ${contract.client_name}:`, err.message)
      errors++
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════')
  console.log('  Sync Complete')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log(`  ✓ Records synced: ${inserted}`)
  console.log(`  ✗ Errors: ${errors}`)

  // Verify by querying the table
  const { data: contractCount, error: countError } = await supabase
    .from('burc_contracts')
    .select('*', { count: 'exact', head: true })

  if (!countError) {
    console.log(`  📊 Total records in burc_contracts: ${contractCount}`)
  }

  // Test the renewal calendar view
  console.log('\n📅 Testing burc_renewal_calendar view...')
  const { data: renewalCalendar, error: viewError } = await supabase
    .from('burc_renewal_calendar')
    .select('*')
    .limit(5)

  if (viewError) {
    console.error('   ❌ Error querying renewal calendar view:', viewError.message)
  } else if (renewalCalendar && renewalCalendar.length > 0) {
    console.log('   ✓ Renewal calendar view is working:')
    renewalCalendar.forEach(r => {
      console.log(`     • ${r.renewal_period}: ${r.contract_count} contracts, $${r.total_value_usd?.toLocaleString()} USD`)
    })
  } else {
    console.log('   ⚠️  Renewal calendar view returned no data')
  }

  // Log to sync audit
  const { error: auditError } = await supabase
    .from('burc_sync_audit')
    .insert({
      sync_id: crypto.randomUUID(),
      table_name: 'burc_contracts',
      operation: 'sync',
      record_count: contracts.length,
      records_inserted: inserted,
      records_updated: 0,
      records_deleted: 0,
      error_message: errors > 0 ? `${errors} records failed` : null,
      metadata: {
        source_file: BURC_FILE,
        source_sheet: SHEET_NAME,
        dry_run: dryRun
      }
    })

  if (auditError) {
    console.log('   ⚠️  Could not log to sync audit:', auditError.message)
  }

  console.log('\n✅ Done!')
}

// Run the sync
syncContracts().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
