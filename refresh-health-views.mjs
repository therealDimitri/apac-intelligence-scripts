#!/usr/bin/env node
/**
 * Refresh Health Score Materialized Views
 *
 * Run this after importing new segmentation data to update
 * all health score calculations and compliance summaries.
 */

import pg from 'pg';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const { Pool } = pg;

// Use Supabase direct connection
// Format: postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres
const originalUrl = process.env.DATABASE_URL;
const password = originalUrl.match(/postgres\.usoyxsunetvxdjdglkmn:([^@]+)@/)?.[1] || '';
const projectRef = 'usoyxsunetvxdjdglkmn';
const connectionString = `postgresql://postgres:${password}@db.${projectRef}.supabase.co:5432/postgres`;

console.log('Connecting to database...');

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function refreshViews() {
  const client = await pool.connect();

  try {
    console.log('='.repeat(60));
    console.log('REFRESHING HEALTH SCORE VIEWS');
    console.log('='.repeat(60));
    console.log('');

    // List of materialized views to refresh
    const views = [
      'client_health_summary',
      'event_compliance_summary',
    ];

    for (const view of views) {
      console.log(`🔄 Refreshing ${view}...`);
      try {
        // Try CONCURRENTLY first (doesn't lock the view)
        await client.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${view};`);
        console.log(`✅ ${view} refreshed successfully`);
      } catch (err) {
        if (err.message.includes('does not exist')) {
          console.log(`⚠️  ${view} does not exist (skipping)`);
        } else if (err.message.includes('CONCURRENTLY')) {
          // Try without CONCURRENTLY if it fails
          console.log(`   Retrying without CONCURRENTLY...`);
          await client.query(`REFRESH MATERIALIZED VIEW ${view};`);
          console.log(`✅ ${view} refreshed successfully`);
        } else {
          console.log(`❌ ${view} failed: ${err.message}`);
        }
      }
    }

    // Also update any regular views that might cache data
    console.log('\n🔄 Checking for regular view updates...');

    // Get list of all materialized views
    const mvResult = await client.query(`
      SELECT matviewname
      FROM pg_matviews
      WHERE schemaname = 'public'
    `);

    console.log('\nMaterialized views in database:');
    if (mvResult.rows.length === 0) {
      console.log('  (none found)');
    } else {
      for (const row of mvResult.rows) {
        console.log(`  - ${row.matviewname}`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ REFRESH COMPLETE');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

refreshViews();
