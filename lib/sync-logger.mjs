/**
 * Sync history logger for sync scripts.
 *
 * Records sync runs to the `sync_history` table for staleness tracking
 * and the admin data sync dashboard.
 *
 * Usage:
 *   import { createSyncLogger } from './lib/sync-logger.mjs'
 *   const logger = await createSyncLogger(supabase, 'burc_sync', 'cron')
 *   // ... do work, call logger.addProcessed(n), logger.addCreated(n), etc.
 *   await logger.complete()    // on success
 *   await logger.fail(error)   // on failure
 */

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} source — identifier for this sync (e.g. 'burc_sync', 'activity_sync')
 * @param {string} triggeredBy — 'cron' | 'manual' | 'api'
 * @param {string} [triggeredByUser] — email of user who triggered (for manual/api)
 * @returns {Promise<SyncLogger>}
 */
export async function createSyncLogger(supabase, source, triggeredBy, triggeredByUser = null) {
  const startTime = Date.now()

  const { data, error } = await supabase
    .from('sync_history')
    .insert({
      source,
      triggered_by: triggeredBy,
      triggered_by_user: triggeredByUser,
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error) {
    console.warn(`  ⚠️  Failed to create sync_history record: ${error.message}`)
  }

  const recordId = data?.id || null
  const counts = { processed: 0, created: 0, updated: 0, failed: 0 }

  return {
    /** Increment processed count */
    addProcessed(n = 1) { counts.processed += n },

    /** Increment created count */
    addCreated(n = 1) { counts.created += n },

    /** Increment updated count */
    addUpdated(n = 1) { counts.updated += n },

    /** Increment failed count */
    addFailed(n = 1) { counts.failed += n },

    /** Get current counts snapshot */
    getCounts() { return { ...counts } },

    /** Mark sync as completed successfully */
    async complete(metadata = {}) {
      const durationMs = Date.now() - startTime
      if (!recordId) return

      const { error: updateError } = await supabase
        .from('sync_history')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          duration_ms: durationMs,
          records_processed: counts.processed,
          records_created: counts.created,
          records_updated: counts.updated,
          records_failed: counts.failed,
          metadata,
        })
        .eq('id', recordId)

      if (updateError) {
        console.warn(`  ⚠️  Failed to update sync_history: ${updateError.message}`)
      } else {
        console.log(`  📊 Sync logged: ${counts.processed} processed, ${counts.created} created, ${counts.updated} updated, ${counts.failed} failed (${durationMs}ms)`)
      }
    },

    /** Mark sync as failed */
    async fail(err) {
      const durationMs = Date.now() - startTime
      if (!recordId) return

      const { error: updateError } = await supabase
        .from('sync_history')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          duration_ms: durationMs,
          records_processed: counts.processed,
          records_created: counts.created,
          records_updated: counts.updated,
          records_failed: counts.failed,
          error_message: err?.message || String(err),
        })
        .eq('id', recordId)

      if (updateError) {
        console.warn(`  ⚠️  Failed to update sync_history: ${updateError.message}`)
      }
    },
  }
}
