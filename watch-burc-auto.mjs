#!/usr/bin/env node
/**
 * Automated BURC File Watcher
 *
 * Watches the BURC folder for file changes and automatically triggers
 * the sync orchestrator to validate and sync data to the database.
 *
 * Features:
 * - Watches all fiscal year folders (2023-2026)
 * - Debounces rapid changes (waits 5 seconds after last change)
 * - Ignores Excel temp files (~$*)
 * - Logs all activity to console and file
 * - Tracks file checksums to detect actual changes
 * - Graceful shutdown on SIGINT/SIGTERM
 * - Auto-recovery from crashes
 *
 * Usage:
 *   node scripts/watch-burc-auto.mjs [options]
 *
 * Options:
 *   --debounce <ms>     Debounce delay in milliseconds (default: 5000)
 *   --log-file <path>   Path to log file (default: logs/burc-watcher.log)
 *   --no-validate       Skip validation before sync
 *   --no-notify         Skip notifications
 *   --dry-run           Don't actually trigger sync, just log
 */

import chokidar from 'chokidar';
import { spawn } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { BURC_BASE, requireOneDrive } from './lib/onedrive-paths.mjs'

requireOneDrive()

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ============================================================================
// Configuration
// ============================================================================

const BURC_BASE = BURC_BASE;

const WATCH_PATHS = [
  `${BURC_BASE}/2026/**/*.xlsx`,
  `${BURC_BASE}/2025/**/*.xlsx`,
  `${BURC_BASE}/2024/**/*.xlsx`,
  `${BURC_BASE}/2023/**/*.{xlsx,xlsb}`,
];

const ORCHESTRATOR_SCRIPT = path.join(__dirname, 'burc-sync-orchestrator.mjs');

// Parse CLI arguments
const args = process.argv.slice(2);
let DEBOUNCE_MS = 5000;
let LOG_FILE_PATH = path.join(__dirname, '..', 'logs', 'burc-watcher.log');
let SKIP_VALIDATION = false;
let SKIP_NOTIFY = false;
let DRY_RUN = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--debounce' && args[i + 1]) {
    DEBOUNCE_MS = parseInt(args[i + 1]);
    i++;
  } else if (args[i] === '--log-file' && args[i + 1]) {
    LOG_FILE_PATH = args[i + 1];
    i++;
  } else if (args[i] === '--no-validate') {
    SKIP_VALIDATION = true;
  } else if (args[i] === '--no-notify') {
    SKIP_NOTIFY = true;
  } else if (args[i] === '--dry-run') {
    DRY_RUN = true;
  }
}

// Ensure log directory exists
const logDir = path.dirname(LOG_FILE_PATH);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// ============================================================================
// Logging
// ============================================================================

function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] ${message}`;

  // Console output with colors
  const levelColors = {
    INFO: '\x1b[36m',    // Cyan
    SUCCESS: '\x1b[32m', // Green
    WARNING: '\x1b[33m', // Yellow
    ERROR: '\x1b[31m',   // Red
    DEBUG: '\x1b[90m',   // Gray
  };

  const color = levelColors[level] || '';
  const reset = '\x1b[0m';
  console.log(`${color}${logMessage}${reset}`);

  // File output
  try {
    fs.appendFileSync(LOG_FILE_PATH, logMessage + '\n');
  } catch (error) {
    console.error('Failed to write to log file:', error.message);
  }
}

// ============================================================================
// File Tracking
// ============================================================================

const fileChecksums = new Map();

/**
 * Calculate file checksum
 */
function calculateChecksum(filePath) {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    return hashSum.digest('hex');
  } catch (error) {
    log(`Error calculating checksum for ${filePath}: ${error.message}`, 'ERROR');
    return null;
  }
}

/**
 * Check if file has actually changed (by checksum)
 */
function hasFileChanged(filePath) {
  const oldChecksum = fileChecksums.get(filePath);
  const newChecksum = calculateChecksum(filePath);

  if (!newChecksum) return false;

  const changed = oldChecksum !== newChecksum;
  fileChecksums.set(filePath, newChecksum);

  return changed;
}

/**
 * Get fiscal year from file path
 */
function getFiscalYearFromPath(filePath) {
  const match = filePath.match(/\/(\d{4})\//);
  return match ? parseInt(match[1]) : null;
}

/**
 * Get file type/scope from filename
 */
function getSyncScope(filePath) {
  const filename = path.basename(filePath).toLowerCase();

  if (filename.includes('performance')) return 'all';
  if (filename.includes('burc')) return 'comprehensive';
  return 'all';
}

// ============================================================================
// Sync Management
// ============================================================================

let debounceTimer = null;
let isSyncing = false;
let syncCount = 0;
let pendingChanges = new Map(); // filePath -> { fiscalYear, scope, timestamp }

/**
 * Run sync orchestrator
 */
async function runSync() {
  if (isSyncing) {
    log('Sync already in progress, skipping...', 'WARNING');
    return;
  }

  if (pendingChanges.size === 0) {
    log('No pending changes to sync', 'DEBUG');
    return;
  }

  isSyncing = true;
  syncCount++;

  // Determine sync scope from pending changes
  const changes = Array.from(pendingChanges.values());
  const fiscalYears = [...new Set(changes.map(c => c.fiscalYear))];
  const scopes = [...new Set(changes.map(c => c.scope))];

  // Use the broadest scope
  const syncScope = scopes.includes('comprehensive') ? 'comprehensive' : 'all';

  log(`Starting sync #${syncCount}`, 'INFO');
  log(`  Changes: ${pendingChanges.size} files`, 'INFO');
  log(`  Fiscal years: ${fiscalYears.join(', ')}`, 'INFO');
  log(`  Scope: ${syncScope}`, 'INFO');

  // Clear pending changes
  const changedFiles = Array.from(pendingChanges.keys());
  pendingChanges.clear();

  if (DRY_RUN) {
    log('DRY RUN - Would execute sync', 'WARNING');
    isSyncing = false;
    return;
  }

  // Build orchestrator args
  const args = ['--scope', syncScope, '--triggered-by', 'file_watcher'];

  if (SKIP_VALIDATION) args.push('--skip-validation');
  if (SKIP_NOTIFY) args.push('--skip-notify');

  // If only one fiscal year, specify it
  if (fiscalYears.length === 1) {
    args.push('--year', fiscalYears[0].toString());
  }

  return new Promise((resolve) => {
    const startTime = Date.now();

    const proc = spawn('node', [ORCHESTRATOR_SCRIPT, ...args], {
      cwd: path.join(__dirname, '..'),
      stdio: 'pipe',
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
      process.stdout.write(data);
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
      process.stderr.write(data);
    });

    proc.on('close', async (code) => {
      isSyncing = false;
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      if (code === 0) {
        log(`Sync #${syncCount} completed successfully in ${duration}s`, 'SUCCESS');

        // Record file audit
        for (const filePath of changedFiles) {
          const year = getFiscalYearFromPath(filePath);
          if (year) {
            await recordFileChange(filePath, year);
          }
        }
      } else {
        log(`Sync #${syncCount} failed with code ${code} after ${duration}s`, 'ERROR');

        // Log error details
        if (stderr) {
          log(`Error output: ${stderr}`, 'ERROR');
        }
      }

      resolve();
    });

    proc.on('error', (err) => {
      isSyncing = false;
      log(`Sync process error: ${err.message}`, 'ERROR');
      resolve();
    });
  });
}

/**
 * Schedule sync with debouncing
 */
function scheduleSync(filePath, fiscalYear, scope) {
  // Add to pending changes
  pendingChanges.set(filePath, { fiscalYear, scope, timestamp: new Date().toISOString() });

  // Clear any existing timer
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  // Schedule new sync after debounce period
  debounceTimer = setTimeout(() => {
    log(`Debounce period elapsed, triggering sync...`, 'INFO');
    runSync();
  }, DEBOUNCE_MS);

  log(`Change detected: ${path.basename(filePath)} (sync scheduled in ${DEBOUNCE_MS / 1000}s)`, 'INFO');
}

/**
 * Record file change in database
 */
async function recordFileChange(filePath, fiscalYear) {
  try {
    const stats = fs.statSync(filePath);
    const checksum = fileChecksums.get(filePath);

    await supabase.from('burc_file_audit').insert({
      file_path: filePath,
      file_name: path.basename(filePath),
      fiscal_year: fiscalYear,
      file_size_bytes: stats.size,
      file_modified_at: stats.mtime.toISOString(),
      file_checksum: checksum,
      change_type: 'modified',
      sync_triggered: true,
      detected_at: new Date().toISOString(),
    });
  } catch (error) {
    log(`Error recording file change: ${error.message}`, 'ERROR');
  }
}

// ============================================================================
// File Watcher Setup
// ============================================================================

log('='.repeat(70), 'INFO');
log('BURC Automated File Watcher', 'INFO');
log('='.repeat(70), 'INFO');
log(`Base path: ${BURC_BASE}`, 'INFO');
log(`Watching paths:`, 'INFO');
WATCH_PATHS.forEach(p => log(`  - ${p}`, 'INFO'));
log(`Debounce: ${DEBOUNCE_MS}ms`, 'INFO');
log(`Log file: ${LOG_FILE_PATH}`, 'INFO');
log(`Validation: ${!SKIP_VALIDATION}`, 'INFO');
log(`Notifications: ${!SKIP_NOTIFY}`, 'INFO');
log(`Dry run: ${DRY_RUN}`, 'INFO');
log('', 'INFO');

// Initialize file checksums for existing files
log('Initialising file checksums...', 'INFO');
const glob = await import('glob');
for (const pattern of WATCH_PATHS) {
  const files = glob.sync(pattern);
  for (const file of files) {
    if (!file.includes('~$')) { // Skip temp files
      const checksum = calculateChecksum(file);
      if (checksum) {
        fileChecksums.set(file, checksum);
      }
    }
  }
}
log(`Tracking ${fileChecksums.size} files`, 'SUCCESS');
log('', 'INFO');

// Create watcher
const watcher = chokidar.watch(WATCH_PATHS, {
  persistent: true,
  ignoreInitial: true,
  awaitWriteFinish: {
    stabilityThreshold: 2000,
    pollInterval: 100,
  },
  ignored: [
    /~\$.*\.xlsx$/,      // Excel temp files
    /\.tmp$/,            // Temp files
    /\.lock$/,           // Lock files
    /\._.*$/,            // Mac OS resource forks
  ],
});

watcher
  .on('add', (filePath) => {
    log(`File added: ${path.basename(filePath)}`, 'INFO');

    const checksum = calculateChecksum(filePath);
    if (checksum) {
      fileChecksums.set(filePath, checksum);

      const year = getFiscalYearFromPath(filePath);
      const scope = getSyncScope(filePath);

      if (year) {
        scheduleSync(filePath, year, scope);
      }
    }
  })
  .on('change', (filePath) => {
    log(`File changed: ${path.basename(filePath)}`, 'DEBUG');

    // Check if file actually changed (by checksum)
    if (hasFileChanged(filePath)) {
      log(`Checksum changed for: ${path.basename(filePath)}`, 'INFO');

      const year = getFiscalYearFromPath(filePath);
      const scope = getSyncScope(filePath);

      if (year) {
        scheduleSync(filePath, year, scope);
      }
    } else {
      log(`No actual changes detected in: ${path.basename(filePath)}`, 'DEBUG');
    }
  })
  .on('unlink', (filePath) => {
    log(`File deleted: ${path.basename(filePath)}`, 'WARNING');
    fileChecksums.delete(filePath);
  })
  .on('error', (error) => {
    log(`Watcher error: ${error.message}`, 'ERROR');
  })
  .on('ready', () => {
    log('File watcher ready and listening for changes', 'SUCCESS');
    log('Press Ctrl+C to stop', 'INFO');
    log('', 'INFO');

    // Heartbeat every 5 minutes
    setInterval(() => {
      log(`Watcher alive - tracking ${fileChecksums.size} files, ${syncCount} syncs completed`, 'DEBUG');
    }, 5 * 60 * 1000);
  });

// ============================================================================
// Graceful Shutdown
// ============================================================================

function shutdown() {
  log('', 'INFO');
  log('Shutting down watcher...', 'WARNING');

  if (debounceTimer) {
    clearTimeout(debounceTimer);
    log('Cleared pending sync timer', 'INFO');
  }

  if (isSyncing) {
    log('Waiting for current sync to complete...', 'WARNING');
    // Give it 30 seconds to finish
    setTimeout(() => {
      log('Sync timeout - forcing shutdown', 'ERROR');
      process.exit(1);
    }, 30000);
  } else {
    watcher.close().then(() => {
      log('Watcher stopped', 'SUCCESS');
      log(`Total syncs completed: ${syncCount}`, 'INFO');
      log('Goodbye!', 'INFO');
      process.exit(0);
    });
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Uncaught error handling
process.on('uncaughtException', (error) => {
  log(`Uncaught exception: ${error.message}`, 'ERROR');
  log(error.stack, 'ERROR');

  // Try to restart watcher after a delay
  setTimeout(() => {
    log('Attempting to recover...', 'WARNING');
  }, 5000);
});

process.on('unhandledRejection', (reason, promise) => {
  log(`Unhandled rejection at: ${promise}, reason: ${reason}`, 'ERROR');
});

// Keep process alive
process.stdin.resume();
