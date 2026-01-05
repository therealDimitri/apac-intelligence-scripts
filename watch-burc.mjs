#!/usr/bin/env node
/**
 * BURC File Watcher Service
 *
 * Watches the 2026 APAC Performance.xlsx file for changes and triggers
 * automatic sync to the database. Part of the hybrid sync approach.
 *
 * Usage:
 *   node scripts/watch-burc.mjs
 *
 * Features:
 * - Debounces rapid changes (waits 5 seconds after last change)
 * - Ignores Excel temp files (~$*)
 * - Logs all sync attempts
 * - Graceful shutdown on SIGINT/SIGTERM
 */

import chokidar from 'chokidar';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Source of truth for 2024 actuals, 2025 actuals, and 2026 forecasts
// SharePoint: https://alteradh.sharepoint.com/teams/APACLeadershipTeam/Shared Documents/General/Performance/Financials/BURC/2026/2026 APAC Performance.xls
const BURC_PATH = '/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth(2)/APAC Leadership Team - General/Performance/Financials/BURC/2026/2026 APAC Performance.xlsx';
const SYNC_SCRIPT = path.join(__dirname, 'sync-burc-data-supabase.mjs');
const DEBOUNCE_MS = 5000; // Wait 5 seconds after last change before syncing

let debounceTimer = null;
let isSyncing = false;
let syncCount = 0;

function log(message) {
  const timestamp = new Date().toLocaleString('en-AU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  console.log(`[${timestamp}] ${message}`);
}

async function runSync() {
  if (isSyncing) {
    log('⏳ Sync already in progress, skipping...');
    return;
  }

  isSyncing = true;
  syncCount++;
  log(`🔄 Starting sync #${syncCount}...`);

  return new Promise((resolve) => {
    const proc = spawn('node', [SYNC_SCRIPT], {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
    });

    proc.on('close', (code) => {
      isSyncing = false;
      if (code === 0) {
        log(`✅ Sync #${syncCount} completed successfully`);
      } else {
        log(`❌ Sync #${syncCount} failed with code ${code}`);
      }
      resolve();
    });

    proc.on('error', (err) => {
      isSyncing = false;
      log(`❌ Sync error: ${err.message}`);
      resolve();
    });
  });
}

function scheduleSync() {
  // Clear any existing timer
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  // Schedule new sync after debounce period
  debounceTimer = setTimeout(() => {
    runSync();
  }, DEBOUNCE_MS);

  log(`📝 Change detected, sync scheduled in ${DEBOUNCE_MS / 1000}s...`);
}

// Start watching
log('👀 Starting BURC file watcher...');
log(`   Watching: ${BURC_PATH}`);
log(`   Debounce: ${DEBOUNCE_MS}ms`);
log('');

const watcher = chokidar.watch(BURC_PATH, {
  persistent: true,
  ignoreInitial: true,
  awaitWriteFinish: {
    stabilityThreshold: 2000,
    pollInterval: 100,
  },
  // Ignore Excel temp files
  ignored: /~\$.*\.xlsx$/,
});

watcher
  .on('change', (filePath) => {
    log(`📄 File changed: ${path.basename(filePath)}`);
    scheduleSync();
  })
  .on('error', (error) => {
    log(`❌ Watcher error: ${error.message}`);
  })
  .on('ready', () => {
    log('✅ Watcher ready and listening for changes');
    log('   Press Ctrl+C to stop\n');
  });

// Graceful shutdown
function shutdown() {
  log('\n🛑 Shutting down watcher...');

  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  watcher.close().then(() => {
    log('👋 Watcher stopped');
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Keep process alive
process.stdin.resume();
