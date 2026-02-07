#!/usr/bin/env node

/**
 * File Watcher for Segmentation Events Excel
 *
 * Monitors the APAC Client Segmentation Activity Register Excel file
 * and automatically imports changes to the database when the file is updated.
 *
 * The database trigger will then auto-sync the compliance table.
 *
 * Usage:
 *   node scripts/watch-segmentation-file.mjs
 *
 * To run in background:
 *   nohup node scripts/watch-segmentation-file.mjs > /tmp/segmentation-watcher.log 2>&1 &
 */

import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { ACTIVITY_REGISTER_2025, requireOneDrive } from './lib/onedrive-paths.mjs'

requireOneDrive()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Configuration
const EXCEL_PATH = ACTIVITY_REGISTER_2025
const IMPORT_SCRIPT = path.join(__dirname, 'import-segmentation-events-2025.mjs')
const DEBOUNCE_MS = 5000 // Wait 5 seconds after last change before importing

let debounceTimer = null
let isImporting = false
let lastImportTime = 0

function log(message) {
  const timestamp = new Date().toISOString()
  console.log(`[${timestamp}] ${message}`)
}

function runImport() {
  if (isImporting) {
    log('⏳ Import already in progress, skipping...')
    return
  }

  // Prevent rapid re-imports (minimum 30 seconds between imports)
  const now = Date.now()
  if (now - lastImportTime < 30000) {
    log('⏳ Too soon since last import, skipping...')
    return
  }

  isImporting = true
  lastImportTime = now
  log('🚀 Starting import...')

  const importProcess = spawn('node', [IMPORT_SCRIPT], {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit'
  })

  importProcess.on('close', (code) => {
    isImporting = false
    if (code === 0) {
      log('✅ Import completed successfully')
      log('📊 Compliance table auto-synced via database trigger')
    } else {
      log(`❌ Import failed with code ${code}`)
    }
  })

  importProcess.on('error', (err) => {
    isImporting = false
    log(`❌ Import error: ${err.message}`)
  })
}

function handleFileChange(eventType) {
  log(`📁 File ${eventType}: ${path.basename(EXCEL_PATH)}`)

  // Clear existing debounce timer
  if (debounceTimer) {
    clearTimeout(debounceTimer)
  }

  // Set new debounce timer
  debounceTimer = setTimeout(() => {
    log('⏰ Debounce complete, triggering import...')
    runImport()
  }, DEBOUNCE_MS)
}

function startWatcher() {
  // Check if file exists
  if (!fs.existsSync(EXCEL_PATH)) {
    log(`❌ File not found: ${EXCEL_PATH}`)
    process.exit(1)
  }

  log('=' .repeat(60))
  log('🔍 Segmentation File Watcher Started')
  log('=' .repeat(60))
  log(`📄 Watching: ${EXCEL_PATH}`)
  log(`⏱️  Debounce: ${DEBOUNCE_MS}ms`)
  log('')
  log('The import will run automatically when the file changes.')
  log('Press Ctrl+C to stop.')
  log('=' .repeat(60))
  log('')

  // Watch the file
  const watcher = fs.watch(EXCEL_PATH, (eventType) => {
    handleFileChange(eventType)
  })

  // Also watch the directory in case file is replaced
  const dirPath = path.dirname(EXCEL_PATH)
  const fileName = path.basename(EXCEL_PATH)

  fs.watch(dirPath, (eventType, changedFile) => {
    if (changedFile === fileName) {
      handleFileChange(eventType)
    }
  })

  // Handle process termination
  process.on('SIGINT', () => {
    log('')
    log('👋 Watcher stopped')
    watcher.close()
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    log('👋 Watcher terminated')
    watcher.close()
    process.exit(0)
  })
}

// Start the watcher
startWatcher()
