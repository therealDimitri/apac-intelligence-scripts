#!/usr/bin/env node
/**
 * BURC Sync Orchestrator
 *
 * Coordinates all BURC sync operations:
 * - Validates data before sync
 * - Executes appropriate sync scripts based on file type
 * - Tracks sync status in database
 * - Sends notifications on completion
 * - Handles errors and retries
 *
 * Usage:
 *   node scripts/burc-sync-orchestrator.mjs [options]
 *
 * Options:
 *   --scope <type>      Sync scope: all, monthly, historical, comprehensive (default: all)
 *   --year <year>       Specific fiscal year to sync (2023-2026)
 *   --validate          Run validation before sync (default: true)
 *   --skip-validation   Skip validation step
 *   --notify            Send notifications on completion (default: true)
 *   --skip-notify       Skip notifications
 *   --triggered-by <s>  Who/what triggered this sync (for audit)
 *
 * Environment Variables:
 *   SLACK_WEBHOOK_URL   Slack webhook for notifications (optional)
 *   TEAMS_WEBHOOK_URL   Microsoft Teams webhook (optional)
 */

import { createClient } from '@supabase/supabase-js';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
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

const SYNC_SCRIPTS = {
  all: path.join(__dirname, 'sync-burc-all-worksheets.mjs'),
  monthly: path.join(__dirname, 'sync-burc-monthly.mjs'),
  historical: path.join(__dirname, 'sync-burc-historical.mjs'),
  comprehensive: path.join(__dirname, 'sync-burc-comprehensive.mjs'),
  enhanced: path.join(__dirname, 'sync-burc-enhanced.mjs'),
};

const VALIDATION_SCRIPT = path.join(__dirname, 'burc-validate-sync.mjs');

const BURC_BASE = BURC_BASE;

const BURC_FILES = {
  2026: `${BURC_BASE}/2026/2026 APAC Performance.xlsx`,
  2025: `${BURC_BASE}/2025/2025 APAC Performance.xlsx`,
  2024: `${BURC_BASE}/2024/2024 APAC Performance.xlsx`,
  2023: `${BURC_BASE}/2023/Dec 23/2023 12 BURC File.xlsb`,
};

// ============================================================================
// Sync Status Tracking
// ============================================================================

class SyncStatusTracker {
  constructor(syncType, syncScope, triggeredBy) {
    this.syncType = syncType;
    this.syncScope = syncScope;
    this.triggeredBy = triggeredBy;
    this.statusId = null;
    this.startTime = Date.now();
    this.metrics = {
      recordsProcessed: 0,
      recordsInserted: 0,
      recordsUpdated: 0,
      recordsFailed: 0,
    };
    this.errors = [];
    this.warnings = [];
    this.tablesAffected = new Set();
    this.sourceFiles = [];
  }

  async start() {
    console.log('\n🚀 Starting BURC sync...');
    console.log(`   Type: ${this.syncType}`);
    console.log(`   Scope: ${this.syncScope}`);
    console.log(`   Triggered by: ${this.triggeredBy}`);
    console.log(`   Started at: ${new Date().toISOString()}`);

    // Create status record in database
    const { data, error } = await supabase
      .from('burc_sync_status')
      .insert({
        sync_type: this.syncType,
        sync_scope: this.syncScope,
        started_at: new Date().toISOString(),
        status: 'running',
        triggered_by: this.triggeredBy,
        trigger_metadata: {
          script: 'burc-sync-orchestrator.mjs',
          node_version: process.version,
        },
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Failed to create sync status record:', error.message);
      throw error;
    }

    this.statusId = data.id;
    console.log(`   Status ID: ${this.statusId}\n`);
    return this.statusId;
  }

  async update(updates = {}) {
    if (!this.statusId) return;

    const updateData = {
      ...updates,
      records_processed: this.metrics.recordsProcessed,
      records_inserted: this.metrics.recordsInserted,
      records_updated: this.metrics.recordsUpdated,
      records_failed: this.metrics.recordsFailed,
      tables_affected: Array.from(this.tablesAffected),
      errors: this.errors.length > 0 ? this.errors : null,
      warnings: this.warnings.length > 0 ? this.warnings : null,
      source_files: this.sourceFiles.length > 0 ? this.sourceFiles : null,
      updated_at: new Date().toISOString(),
    };

    await supabase.from('burc_sync_status').update(updateData).eq('id', this.statusId);
  }

  async complete(status = 'completed') {
    const endTime = Date.now();
    const durationSeconds = ((endTime - this.startTime) / 1000).toFixed(2);

    console.log(`\n✅ Sync ${status}`);
    console.log(`   Duration: ${durationSeconds}s`);
    console.log(`   Records processed: ${this.metrics.recordsProcessed}`);
    console.log(`   Records inserted: ${this.metrics.recordsInserted}`);
    console.log(`   Records updated: ${this.metrics.recordsUpdated}`);
    console.log(`   Records failed: ${this.metrics.recordsFailed}`);
    console.log(`   Tables affected: ${this.tablesAffected.size}`);
    console.log(`   Errors: ${this.errors.length}`);
    console.log(`   Warnings: ${this.warnings.length}`);

    await supabase
      .from('burc_sync_status')
      .update({
        completed_at: new Date().toISOString(),
        status,
        duration_seconds: parseFloat(durationSeconds),
        records_processed: this.metrics.recordsProcessed,
        records_inserted: this.metrics.recordsInserted,
        records_updated: this.metrics.recordsUpdated,
        records_failed: this.metrics.recordsFailed,
        tables_affected: Array.from(this.tablesAffected),
        errors: this.errors.length > 0 ? this.errors : null,
        warnings: this.warnings.length > 0 ? this.warnings : null,
        source_files: this.sourceFiles.length > 0 ? this.sourceFiles : null,
      })
      .eq('id', this.statusId);

    return {
      statusId: this.statusId,
      status,
      durationSeconds,
      metrics: this.metrics,
      errors: this.errors,
      warnings: this.warnings,
    };
  }

  addError(message, context = {}) {
    this.errors.push({ message, context, timestamp: new Date().toISOString() });
  }

  addWarning(message, context = {}) {
    this.warnings.push({ message, context, timestamp: new Date().toISOString() });
  }

  addTable(tableName) {
    this.tablesAffected.add(tableName);
  }

  addSourceFile(filePath, checksum = null) {
    this.sourceFiles.push({
      path: filePath,
      name: path.basename(filePath),
      checksum,
      processedAt: new Date().toISOString(),
    });
  }
}

// ============================================================================
// File Utilities
// ============================================================================

/**
 * Calculate file checksum (SHA256)
 */
function calculateChecksum(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

/**
 * Get file metadata
 */
function getFileMetadata(filePath) {
  if (!fs.existsSync(filePath)) return null;

  const stats = fs.statSync(filePath);
  const checksum = calculateChecksum(filePath);

  return {
    path: filePath,
    name: path.basename(filePath),
    size: stats.size,
    modifiedAt: stats.mtime.toISOString(),
    checksum,
  };
}

/**
 * Record file audit entry
 */
async function recordFileAudit(filePath, fiscalYear, changeType, syncStatusId) {
  const metadata = getFileMetadata(filePath);
  if (!metadata) return;

  await supabase.from('burc_file_audit').insert({
    file_path: filePath,
    file_name: metadata.name,
    fiscal_year: fiscalYear,
    file_size_bytes: metadata.size,
    file_modified_at: metadata.modifiedAt,
    file_checksum: metadata.checksum,
    change_type: changeType,
    sync_status_id: syncStatusId,
    sync_triggered: true,
  });
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Run validation before sync
 */
async function runValidation(scope, fiscalYear, tracker) {
  console.log('\n🔍 Running validation...');

  return new Promise((resolve, reject) => {
    const args = [];

    if (fiscalYear) {
      args.push('--year', fiscalYear.toString());
    }

    args.push('--report', '/tmp/burc-validation-report.json');

    const proc = spawn('node', [VALIDATION_SCRIPT, ...args], {
      cwd: path.join(__dirname, '..'),
      stdio: 'pipe',
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', data => {
      stdout += data.toString();
      process.stdout.write(data);
    });

    proc.stderr.on('data', data => {
      stderr += data.toString();
      process.stderr.write(data);
    });

    proc.on('close', code => {
      // Read validation report
      try {
        const report = JSON.parse(fs.readFileSync('/tmp/burc-validation-report.json', 'utf-8'));

        // Add validation results to tracker
        tracker.update({
          validation_passed: code === 0,
          validation_errors: report.errors.length > 0 ? report.errors : null,
        });

        // Add warnings to tracker
        report.warnings.forEach(w => tracker.addWarning(w.message, w.context));

        if (code === 0) {
          console.log('✅ Validation passed');
          resolve(true);
        } else if (code === 2) {
          console.log('⚠️  Validation passed with warnings');
          resolve(true); // Continue with warnings
        } else {
          console.log('❌ Validation failed');
          report.errors.forEach(e => tracker.addError(e.message, e.context));
          resolve(false); // Don't reject, let caller decide
        }
      } catch (error) {
        console.error('❌ Error reading validation report:', error.message);
        tracker.addError('Failed to read validation report', { error: error.message });
        resolve(false);
      }
    });

    proc.on('error', error => {
      console.error('❌ Validation process error:', error.message);
      tracker.addError('Validation process failed', { error: error.message });
      reject(error);
    });
  });
}

// ============================================================================
// Sync Execution
// ============================================================================

/**
 * Execute sync script
 */
async function executeSyncScript(scriptPath, tracker) {
  console.log(`\n⚙️  Executing sync: ${path.basename(scriptPath)}`);

  return new Promise((resolve, reject) => {
    const proc = spawn('node', [scriptPath], {
      cwd: path.join(__dirname, '..'),
      stdio: 'pipe',
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', data => {
      const text = data.toString();
      stdout += text;
      process.stdout.write(data);

      // Parse metrics from output
      // Look for patterns like "✅ 123 records synced" or "Synced 123 records"
      const syncedMatch = text.match(/(\d+)\s+(?:records?|rows?)\s+(?:synced|inserted|updated)/i);
      if (syncedMatch) {
        const count = parseInt(syncedMatch[1]);
        tracker.metrics.recordsProcessed += count;
        tracker.metrics.recordsInserted += count;
      }

      // Look for table names
      const tableMatch = text.match(/(?:from|to|into)\s+([a-z_]+)/i);
      if (tableMatch) {
        tracker.addTable(tableMatch[1]);
      }
    });

    proc.stderr.on('data', data => {
      stderr += data.toString();
      process.stderr.write(data);
    });

    proc.on('close', code => {
      if (code === 0) {
        console.log('✅ Sync script completed successfully');
        resolve({ success: true, code, stdout, stderr });
      } else {
        console.error(`❌ Sync script failed with code ${code}`);
        tracker.addError(`Sync script exited with code ${code}`, { stdout, stderr });
        resolve({ success: false, code, stdout, stderr });
      }
    });

    proc.on('error', error => {
      console.error('❌ Sync script process error:', error.message);
      tracker.addError('Sync process failed', { error: error.message });
      reject(error);
    });
  });
}

// ============================================================================
// Notifications
// ============================================================================

/**
 * Send Slack notification
 */
async function sendSlackNotification(tracker, result) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;

  const statusEmoji = result.status === 'completed' ? '✅' : '❌';
  const color = result.status === 'completed' ? 'good' : 'danger';

  const payload = {
    text: `${statusEmoji} BURC Sync ${result.status}`,
    attachments: [
      {
        color,
        fields: [
          { title: 'Scope', value: tracker.syncScope, short: true },
          { title: 'Type', value: tracker.syncType, short: true },
          { title: 'Duration', value: `${result.durationSeconds}s`, short: true },
          { title: 'Records', value: result.metrics.recordsProcessed.toString(), short: true },
          { title: 'Errors', value: result.errors.length.toString(), short: true },
          { title: 'Warnings', value: result.warnings.length.toString(), short: true },
        ],
        footer: `Triggered by ${tracker.triggeredBy}`,
        ts: Math.floor(Date.now() / 1000),
      },
    ],
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      console.log('📬 Slack notification sent');

      // Record notification
      await supabase.from('burc_sync_notifications').insert({
        sync_status_id: tracker.statusId,
        notification_type: 'slack',
        notification_channel: 'default',
        subject: `BURC Sync ${result.status}`,
        message: JSON.stringify(payload),
        sent_at: new Date().toISOString(),
        status: 'sent',
      });
    } else {
      console.error('Failed to send Slack notification:', response.statusText);
    }
  } catch (error) {
    console.error('Error sending Slack notification:', error.message);
  }
}

/**
 * Send Teams notification
 */
async function sendTeamsNotification(tracker, result) {
  const webhookUrl = process.env.TEAMS_WEBHOOK_URL;
  if (!webhookUrl) return;

  const statusColor = result.status === 'completed' ? '00FF00' : 'FF0000';

  const payload = {
    '@type': 'MessageCard',
    '@context': 'https://schema.org/extensions',
    summary: `BURC Sync ${result.status}`,
    themeColor: statusColor,
    title: `BURC Sync ${result.status}`,
    sections: [
      {
        activityTitle: 'Sync Details',
        facts: [
          { name: 'Scope', value: tracker.syncScope },
          { name: 'Type', value: tracker.syncType },
          { name: 'Duration', value: `${result.durationSeconds}s` },
          { name: 'Records Processed', value: result.metrics.recordsProcessed.toString() },
          { name: 'Errors', value: result.errors.length.toString() },
          { name: 'Warnings', value: result.warnings.length.toString() },
          { name: 'Triggered By', value: tracker.triggeredBy },
        ],
      },
    ],
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      console.log('📬 Teams notification sent');

      // Record notification
      await supabase.from('burc_sync_notifications').insert({
        sync_status_id: tracker.statusId,
        notification_type: 'teams',
        notification_channel: 'default',
        subject: `BURC Sync ${result.status}`,
        message: JSON.stringify(payload),
        sent_at: new Date().toISOString(),
        status: 'sent',
      });
    } else {
      console.error('Failed to send Teams notification:', response.statusText);
    }
  } catch (error) {
    console.error('Error sending Teams notification:', error.message);
  }
}

/**
 * Send all notifications
 */
async function sendNotifications(tracker, result) {
  console.log('\n📬 Sending notifications...');

  await Promise.allSettled([
    sendSlackNotification(tracker, result),
    sendTeamsNotification(tracker, result),
  ]);
}

// ============================================================================
// Main Orchestration
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  let syncScope = 'all';
  let fiscalYear = null;
  let shouldRunValidation = true;
  let sendNotify = true;
  let triggeredBy = 'manual';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--scope' && args[i + 1]) {
      syncScope = args[i + 1];
      i++;
    } else if (args[i] === '--year' && args[i + 1]) {
      fiscalYear = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--skip-validation') {
      shouldRunValidation = false;
    } else if (args[i] === '--skip-notify') {
      sendNotify = false;
    } else if (args[i] === '--triggered-by' && args[i + 1]) {
      triggeredBy = args[i + 1];
      i++;
    }
  }

  // Validate scope
  const syncScript = SYNC_SCRIPTS[syncScope];
  if (!syncScript) {
    console.error(`❌ Invalid sync scope: ${syncScope}`);
    console.error(`   Valid options: ${Object.keys(SYNC_SCRIPTS).join(', ')}`);
    process.exit(1);
  }

  if (!fs.existsSync(syncScript)) {
    console.error(`❌ Sync script not found: ${syncScript}`);
    process.exit(1);
  }

  // Initialize tracker
  const tracker = new SyncStatusTracker('auto', syncScope, triggeredBy);
  await tracker.start();

  try {
    // Record file metadata
    for (const [year, filePath] of Object.entries(BURC_FILES)) {
      if (fiscalYear && parseInt(year) !== fiscalYear) continue;
      if (fs.existsSync(filePath)) {
        const metadata = getFileMetadata(filePath);
        tracker.addSourceFile(filePath, metadata.checksum);
        await recordFileAudit(filePath, parseInt(year), 'modified', tracker.statusId);
      }
    }

    // Run validation if enabled
    if (shouldRunValidation) {
      const validationPassed = await runValidation(syncScope, fiscalYear, tracker);

      if (!validationPassed) {
        console.error('\n❌ Validation failed - aborting sync');
        const result = await tracker.complete('failed');
        if (sendNotify) {
          await sendNotifications(tracker, result);
        }
        process.exit(1);
      }
    }

    // Execute sync
    const syncResult = await executeSyncScript(syncScript, tracker);

    if (!syncResult.success) {
      const result = await tracker.complete('failed');
      if (sendNotify) {
        await sendNotifications(tracker, result);
      }
      process.exit(1);
    }

    // Mark as completed
    const result = await tracker.complete('completed');

    // Send notifications
    if (sendNotify) {
      await sendNotifications(tracker, result);
    }

    console.log('\n🎉 Sync orchestration completed successfully\n');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    tracker.addError('Fatal error', { error: error.message, stack: error.stack });

    const result = await tracker.complete('failed');
    if (sendNotify) {
      await sendNotifications(tracker, result);
    }

    process.exit(1);
  }
}

main();
