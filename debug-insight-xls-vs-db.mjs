#!/usr/bin/env node
/**
 * Debug script to compare Insight Touch Points data between XLS and Database
 *
 * This script:
 * 1. Parses the source Excel file for Insight Touch Point events
 * 2. Queries the database for the same data
 * 3. Compares them to identify discrepancies
 */

import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '..', 'data')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// Find the most recent Excel file
function findExcelFile() {
  const files = ['APAC_Intl_10Nov2025.xlsx', 'APAC Intel 13 October 2025.xlsx']
  for (const file of files) {
    try {
      const path = join(DATA_DIR, file)
      readFileSync(path)
      return path
    } catch {
      continue
    }
  }
  throw new Error('No Excel file found')
}

// Parse Insight Touch Points from XLS
function parseInsightTouchPointsFromXLS(filePath) {
  console.log(`\n📊 Parsing Excel file: ${filePath}`)

  const workbook = XLSX.readFile(filePath)

  // Look for sheets that might contain the segmentation events
  const sheetNames = workbook.SheetNames
  console.log('Available sheets:', sheetNames)

  const results = {
    clientTotals: new Map(), // client -> { total: count by month }
    allEvents: []
  }

  // Try to find segmentation events sheet
  const segmentationSheet = sheetNames.find(name =>
    name.toLowerCase().includes('segment') ||
    name.toLowerCase().includes('event')
  )

  if (segmentationSheet) {
    console.log(`Found segmentation sheet: ${segmentationSheet}`)
    const sheet = workbook.Sheets[segmentationSheet]
    const data = XLSX.utils.sheet_to_json(sheet, { defval: '' })

    console.log(`Total rows in sheet: ${data.length}`)

    // Look for Insight Touch Point events
    data.forEach((row, idx) => {
      const rowStr = JSON.stringify(row).toLowerCase()
      if (rowStr.includes('insight touch') || rowStr.includes('touchpoint')) {
        results.allEvents.push({ row: idx, data: row })
      }
    })

    console.log(`Found ${results.allEvents.length} potential Insight Touch Point rows`)
    if (results.allEvents.length > 0) {
      console.log('Sample row:', JSON.stringify(results.allEvents[0].data, null, 2))
    }
  }

  // Also check for a compliance or tier sheet
  const complianceSheet = sheetNames.find(name =>
    name.toLowerCase().includes('compliance') ||
    name.toLowerCase().includes('tier')
  )

  if (complianceSheet) {
    console.log(`\nFound compliance sheet: ${complianceSheet}`)
    const sheet = workbook.Sheets[complianceSheet]
    const data = XLSX.utils.sheet_to_json(sheet, { defval: '' })

    // Look for columns that might be Insight Touch Point totals
    if (data.length > 0) {
      const columns = Object.keys(data[0])
      console.log('Compliance sheet columns:', columns)

      // Find Insight Touch Point column
      const itpColumn = columns.find(col =>
        col.toLowerCase().includes('insight') ||
        col.toLowerCase().includes('touch')
      )

      if (itpColumn) {
        console.log(`Found ITP column: ${itpColumn}`)
        data.forEach(row => {
          const client = row['Client'] || row['client'] || row['Client Name'] || row['client_name']
          const itpValue = row[itpColumn]
          if (client && itpValue !== undefined && itpValue !== '') {
            results.clientTotals.set(client, itpValue)
          }
        })
      }
    }
  }

  return results
}

// Query database for Insight Touch Points
async function getInsightTouchPointsFromDB() {
  console.log('\n🗄️  Querying database...')

  // Get the event type ID for Insight Touch Points
  const { data: eventTypes, error: eventTypesError } = await supabase
    .from('segmentation_event_types')
    .select('*')
    .ilike('event_name', '%Insight Touch Point%')

  if (eventTypesError) {
    console.error('Error fetching event types:', eventTypesError)
    return null
  }

  if (!eventTypes || eventTypes.length === 0) {
    console.log('No Insight Touch Point event type found')
    return null
  }

  const eventTypeId = eventTypes[0].id
  console.log(`Found event type: ${eventTypes[0].event_name} (${eventTypeId})`)

  // Get compliance records
  const { data: compliance, error: complianceError } = await supabase
    .from('segmentation_event_compliance')
    .select('*')
    .eq('event_type_id', eventTypeId)
    .eq('year', 2025)
    .order('client_name')

  if (complianceError) {
    console.error('Error fetching compliance:', complianceError)
    return null
  }

  // Get actual events
  const { data: events, error: eventsError } = await supabase
    .from('segmentation_events')
    .select('*')
    .eq('event_type_id', eventTypeId)
    .gte('event_date', '2025-01-01')
    .lte('event_date', '2025-12-31')
    .order('event_date', { ascending: false })

  if (eventsError) {
    console.error('Error fetching events:', eventsError)
    return null
  }

  return {
    compliance,
    events,
    eventType: eventTypes[0]
  }
}

// Main comparison
async function main() {
  console.log('=== Insight Touch Points: XLS vs Database Comparison ===')

  // Parse XLS
  try {
    const xlsPath = findExcelFile()
    const xlsData = parseInsightTouchPointsFromXLS(xlsPath)

    console.log('\n📋 XLS Client Totals:')
    if (xlsData.clientTotals.size > 0) {
      for (const [client, total] of xlsData.clientTotals) {
        console.log(`  ${client}: ${total}`)
      }
    } else {
      console.log('  No client totals found in XLS')
    }
  } catch (e) {
    console.log('Could not parse XLS:', e.message)
  }

  // Query DB
  const dbData = await getInsightTouchPointsFromDB()

  if (dbData) {
    console.log('\n📋 Database Compliance Records:')
    let totalExpected = 0
    let totalActual = 0
    let incompleteCount = 0
    let missingEvents = 0

    const incompleteClients = []

    dbData.compliance.forEach(record => {
      const status = record.actual_count >= record.expected_count ? '✅' : '❌'
      console.log(`  ${status} ${record.client_name}: ${record.actual_count}/${record.expected_count}`)
      totalExpected += record.expected_count
      totalActual += record.actual_count

      if (record.actual_count < record.expected_count) {
        incompleteCount++
        const missing = record.expected_count - record.actual_count
        missingEvents += missing
        incompleteClients.push({
          name: record.client_name,
          actual: record.actual_count,
          expected: record.expected_count,
          missing
        })
      }
    })

    console.log('\n📊 Summary:')
    console.log(`  Total Expected: ${totalExpected}`)
    console.log(`  Total Actual: ${totalActual}`)
    console.log(`  Completion: ${Math.round((totalActual / totalExpected) * 100)}%`)
    console.log(`  Incomplete Clients: ${incompleteCount}`)
    console.log(`  Total Missing Events: ${missingEvents}`)

    console.log('\n❌ Incomplete Clients Detail:')
    incompleteClients.forEach(c => {
      console.log(`  ${c.name}: ${c.actual}/${c.expected} (${c.missing} missing)`)
    })

    // Count events by client in events table
    console.log('\n📋 Events by Client (from segmentation_events table):')
    const eventsByClient = new Map()
    dbData.events.forEach(event => {
      const client = event.client_name
      const count = eventsByClient.get(client) || 0
      eventsByClient.set(client, count + 1)
    })

    for (const [client, count] of eventsByClient) {
      console.log(`  ${client}: ${count} events`)
    }

    // Compare compliance vs actual events
    console.log('\n🔍 Compliance vs Actual Events Comparison:')
    const clientsInCompliance = new Set(dbData.compliance.map(c => c.client_name))
    const clientsInEvents = new Set(eventsByClient.keys())

    // Clients in compliance but not in events
    const missingFromEvents = [...clientsInCompliance].filter(c => !clientsInEvents.has(c))
    if (missingFromEvents.length > 0) {
      console.log('  Clients in compliance but no events:')
      missingFromEvents.forEach(c => console.log(`    - ${c}`))
    }

    // Clients in events but not in compliance
    const missingFromCompliance = [...clientsInEvents].filter(c => !clientsInCompliance.has(c))
    if (missingFromCompliance.length > 0) {
      console.log('  Clients with events but no compliance record:')
      missingFromCompliance.forEach(c => console.log(`    - ${c}`))
    }

    // Check for mismatches
    console.log('\n⚠️  Mismatches (compliance actual_count vs events count):')
    let hasMismatch = false
    dbData.compliance.forEach(record => {
      const eventsCount = eventsByClient.get(record.client_name) || 0
      if (eventsCount !== record.actual_count) {
        hasMismatch = true
        console.log(`  ${record.client_name}: compliance=${record.actual_count}, events=${eventsCount}`)
      }
    })
    if (!hasMismatch) {
      console.log('  No mismatches found!')
    }
  }
}

main().catch(console.error)
