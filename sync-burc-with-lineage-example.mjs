#!/usr/bin/env node
/**
 * BURC Sync Script with Data Lineage Tracking - Example
 *
 * This is an example showing how to integrate LineageTracker into BURC sync scripts.
 * It demonstrates:
 * - Starting a sync batch
 * - Tracking each change with source Excel cell reference
 * - Registering files in the registry
 * - Completing the batch with statistics
 * - Error handling and batch status updates
 *
 * To use in existing sync scripts:
 * 1. Import LineageTracker
 * 2. Start batch at beginning of sync
 * 3. Track each insert/update/delete with source details
 * 4. Complete batch at end with final status
 */

import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import crypto from 'crypto';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

// ============================================================================
// LineageTracker - Inline implementation for .mjs compatibility
// ============================================================================

class LineageTracker {
  constructor(supabaseUrl, supabaseKey) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.currentBatchId = null;
    this.changes = [];
    this.stats = {
      filesProcessed: 0,
      recordsInserted: 0,
      recordsUpdated: 0,
      recordsDeleted: 0,
      recordsSkipped: 0,
      recordsFailed: 0,
      errors: [],
      warnings: []
    };
  }

  async startBatch(config) {
    const { data, error } = await this.supabase
      .from('burc_sync_batches')
      .insert({
        triggered_by: config?.triggeredBy || 'script',
        sync_type: config?.syncType || 'manual',
        source_files: config?.sourceFiles || [],
        config: config?.config || {}
      })
      .select('id')
      .single();

    if (error) throw new Error(`Failed to start batch: ${error.message}`);

    this.currentBatchId = data.id;
    this.changes = [];
    this.stats = {
      filesProcessed: 0,
      recordsInserted: 0,
      recordsUpdated: 0,
      recordsDeleted: 0,
      recordsSkipped: 0,
      recordsFailed: 0,
      errors: [],
      warnings: []
    };

    return data.id;
  }

  trackChange(change) {
    if (!this.currentBatchId) {
      throw new Error('No active batch. Call startBatch() first.');
    }

    const cellRef = change.sourceCellReference ||
      `${change.sourceColumn}${change.sourceRow}`;

    this.changes.push({
      ...change,
      sourceCellReference: cellRef
    });

    // Update stats
    if (change.changeType === 'insert') this.stats.recordsInserted++;
    else if (change.changeType === 'update') this.stats.recordsUpdated++;
    else if (change.changeType === 'delete') this.stats.recordsDeleted++;
  }

  async flushChanges() {
    if (!this.currentBatchId || this.changes.length === 0) return;

    const records = this.changes.map(change => ({
      source_file: change.sourceFile,
      source_sheet: change.sourceSheet,
      source_row: change.sourceRow,
      source_column: change.sourceColumn,
      source_cell_reference: change.sourceCellReference,
      target_table: change.targetTable,
      target_id: change.targetId || null,
      target_column: change.targetColumn,
      old_value: change.oldValue || null,
      new_value: change.newValue || null,
      change_type: change.changeType,
      sync_batch_id: this.currentBatchId,
      synced_by: change.syncedBy || 'script',
      validation_status: change.validationStatus || 'valid',
      validation_message: change.validationMessage || null,
      metadata: change.metadata || null
    }));

    const { error } = await this.supabase
      .from('burc_data_lineage')
      .insert(records);

    if (error) throw new Error(`Failed to insert lineage: ${error.message}`);

    this.changes = [];
  }

  async updateBatchStats() {
    if (!this.currentBatchId) return;

    const { error } = await this.supabase
      .from('burc_sync_batches')
      .update({
        files_processed: this.stats.filesProcessed,
        records_inserted: this.stats.recordsInserted,
        records_updated: this.stats.recordsUpdated,
        records_deleted: this.stats.recordsDeleted,
        records_skipped: this.stats.recordsSkipped,
        records_failed: this.stats.recordsFailed,
        errors: this.stats.errors,
        warnings: this.stats.warnings
      })
      .eq('id', this.currentBatchId);

    if (error) throw new Error(`Failed to update stats: ${error.message}`);
  }

  async completeBatch(status = 'completed') {
    if (!this.currentBatchId) return;

    // Flush remaining changes
    if (this.changes.length > 0) {
      await this.flushChanges();
    }

    // Update final stats
    await this.updateBatchStats();

    // Mark as complete
    const { error } = await this.supabase.rpc('complete_sync_batch', {
      p_batch_id: this.currentBatchId,
      p_status: status
    });

    if (error) throw new Error(`Failed to complete batch: ${error.message}`);

    this.currentBatchId = null;
  }

  async registerFile(file) {
    const { data: existing } = await this.supabase
      .from('burc_file_registry')
      .select('id')
      .eq('file_path', file.filePath)
      .single();

    if (existing) {
      const { error } = await this.supabase
        .from('burc_file_registry')
        .update({
          file_name: file.fileName,
          file_size: file.fileSize,
          file_hash: file.fileHash,
          last_modified: file.lastModified,
          last_processed_at: new Date().toISOString(),
          last_sync_batch_id: this.currentBatchId
        })
        .eq('id', existing.id);

      if (error) throw new Error(`Failed to update file registry: ${error.message}`);
      return existing.id;
    } else {
      const { data, error } = await this.supabase
        .from('burc_file_registry')
        .insert({
          file_path: file.filePath,
          file_name: file.fileName,
          file_type: file.fileType,
          file_size: file.fileSize,
          file_hash: file.fileHash,
          last_modified: file.lastModified,
          first_processed_at: new Date().toISOString(),
          last_processed_at: new Date().toISOString(),
          total_syncs: 1,
          last_sync_batch_id: this.currentBatchId
        })
        .select('id')
        .single();

      if (error) throw new Error(`Failed to register file: ${error.message}`);
      return data.id;
    }
  }

  addError(error) {
    this.stats.errors.push(error);
    this.stats.recordsFailed++;
  }

  addWarning(warning) {
    this.stats.warnings.push(warning);
  }
}

// ============================================================================
// Example: Sync EBITA Monthly Data with Lineage Tracking
// ============================================================================

async function syncEbitaWithLineage() {
  const BURC_PATH = '/Users/jimmy.leimonitis/Library/CloudStorage/OneDrive-AlteraDigitalHealth/APAC Leadership Team - Performance/Financials/BURC/2026/Budget Planning/2026 APAC Performance.xlsx';

  console.log('📊 Starting BURC sync with data lineage tracking...\n');

  // Initialize LineageTracker
  const tracker = new LineageTracker(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    // Calculate file hash for change detection
    const fileBuffer = fs.readFileSync(BURC_PATH);
    const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const fileStats = fs.statSync(BURC_PATH);

    // Start batch
    const batchId = await tracker.startBatch({
      triggeredBy: 'sync-burc-with-lineage-example.mjs',
      syncType: 'manual',
      sourceFiles: [BURC_PATH],
      config: {
        mode: 'example',
        trackLineage: true
      }
    });

    console.log(`✅ Started sync batch: ${batchId}\n`);

    // Register file
    await tracker.registerFile({
      filePath: BURC_PATH,
      fileName: path.basename(BURC_PATH),
      fileType: 'burc_monthly',
      fileSize: fileStats.size,
      fileHash: fileHash,
      lastModified: fileStats.mtime.toISOString()
    });

    console.log('✅ Registered file in registry\n');

    tracker.stats.filesProcessed++;

    // Read Excel file
    const workbook = XLSX.readFile(BURC_PATH);
    const sheet = workbook.Sheets['Summary']; // Example sheet name

    if (!sheet) {
      tracker.addError({
        type: 'sheet_not_found',
        message: 'Summary sheet not found',
        file: BURC_PATH
      });
      await tracker.completeBatch('failed');
      console.error('❌ Summary sheet not found');
      return;
    }

    console.log('📖 Reading EBITA data from Summary sheet...\n');

    // Example: Extract EBITA data from specific cells
    // This is a simplified example - adjust based on actual sheet structure

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const startRow = 10; // Example: Data starts at row 10

    for (let i = 0; i < months.length; i++) {
      const row = startRow + i;
      const month = months[i];

      // Example cell references (adjust based on actual layout)
      const targetCell = sheet[`B${row}`]; // Target EBITA
      const actualCell = sheet[`C${row}`]; // Actual EBITA

      const targetValue = targetCell?.v || null;
      const actualValue = actualCell?.v || null;

      console.log(`Processing ${month}: Target=${targetValue}, Actual=${actualValue}`);

      // Track the insert/update
      tracker.trackChange({
        sourceFile: BURC_PATH,
        sourceSheet: 'Summary',
        sourceRow: row,
        sourceColumn: 'B',
        sourceCellReference: `B${row}`,
        targetTable: 'burc_ebita_monthly',
        targetId: null, // Will be set after insert
        targetColumn: 'target_ebita',
        oldValue: null, // Would need to query existing value
        newValue: String(targetValue),
        changeType: 'insert', // or 'update' if record exists
        metadata: {
          month: month,
          monthNum: i + 1,
          year: 2026
        }
      });

      tracker.trackChange({
        sourceFile: BURC_PATH,
        sourceSheet: 'Summary',
        sourceRow: row,
        sourceColumn: 'C',
        sourceCellReference: `C${row}`,
        targetTable: 'burc_ebita_monthly',
        targetId: null,
        targetColumn: 'actual_ebita',
        oldValue: null,
        newValue: String(actualValue),
        changeType: 'insert',
        metadata: {
          month: month,
          monthNum: i + 1,
          year: 2026
        }
      });

      // Flush every 100 changes to avoid memory issues
      if (tracker.changes.length >= 100) {
        await tracker.flushChanges();
        console.log('  💾 Flushed 100 changes to database');
      }
    }

    // Final flush
    await tracker.flushChanges();
    console.log('\n💾 Flushed remaining changes to database');

    // Update batch stats
    await tracker.updateBatchStats();
    console.log('📊 Updated batch statistics');

    // Complete batch
    await tracker.completeBatch('completed');
    console.log('\n✅ Sync batch completed successfully!');

    console.log('\nFinal Statistics:');
    console.log(`  Files Processed: ${tracker.stats.filesProcessed}`);
    console.log(`  Records Inserted: ${tracker.stats.recordsInserted}`);
    console.log(`  Records Updated: ${tracker.stats.recordsUpdated}`);
    console.log(`  Records Deleted: ${tracker.stats.recordsDeleted}`);
    console.log(`  Errors: ${tracker.stats.errors.length}`);
    console.log(`  Warnings: ${tracker.stats.warnings.length}`);

  } catch (error) {
    console.error('\n❌ Error during sync:', error.message);

    if (tracker.currentBatchId) {
      tracker.addError({
        type: 'sync_error',
        message: error.message,
        stack: error.stack
      });
      await tracker.updateBatchStats();
      await tracker.completeBatch('failed');
    }

    throw error;
  }
}

// ============================================================================
// Integration Pattern for Existing Sync Scripts
// ============================================================================

/**
 * Example pattern to add to existing sync functions:
 *
 * async function syncYourData(client, workbook, tracker, filePath) {
 *   const sheet = workbook.Sheets['YourSheet'];
 *
 *   // Your existing logic to extract data...
 *   const dataToSync = extractData(sheet);
 *
 *   for (const row of dataToSync) {
 *     // Your existing insert/update logic...
 *     const result = await client.query(
 *       'INSERT INTO your_table (...) VALUES (...) ON CONFLICT ... RETURNING id',
 *       [...]
 *     );
 *
 *     // Add lineage tracking:
 *     tracker.trackChange({
 *       sourceFile: filePath,
 *       sourceSheet: 'YourSheet',
 *       sourceRow: row.rowNumber,
 *       sourceColumn: 'A', // or actual column
 *       targetTable: 'your_table',
 *       targetId: result.rows[0].id,
 *       targetColumn: 'your_column',
 *       oldValue: row.oldValue,
 *       newValue: row.newValue,
 *       changeType: row.isNew ? 'insert' : 'update'
 *     });
 *
 *     // Flush periodically
 *     if (tracker.changes.length >= 100) {
 *       await tracker.flushChanges();
 *     }
 *   }
 * }
 */

// ============================================================================
// Run the example
// ============================================================================

if (import.meta.url === `file://${process.argv[1]}`) {
  syncEbitaWithLineage()
    .then(() => {
      console.log('\n✨ Done!');
      process.exit(0);
    })
    .catch(err => {
      console.error('\n💥 Fatal error:', err);
      process.exit(1);
    });
}

export { LineageTracker, syncEbitaWithLineage };
